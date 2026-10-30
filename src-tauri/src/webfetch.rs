//! Cross-site requests for Equicord's plugins.
//!
//! Equicord was built as a userscript, and a userscript manager lets it fetch
//! from any site (badges, banners, reviews, themes). Discord's content
//! security policy blocks that from the page, so the page's `GM_xmlhttpRequest`
//! stand-in (equicord/build.mjs) hands the request here instead.
//!
//! Any script on discord.com can call this, so it stays narrow: https only,
//! never your own machine or local network, no cookies, a timeout and a size
//! cap. It can't reach anything a normal browser tab couldn't.

use std::io::Read;
use std::net::{IpAddr, ToSocketAddrs};
use std::time::Duration;

use base64::Engine;
use serde::Serialize;

const TIMEOUT_SECS: u64 = 20;
const MAX_BYTES: u64 = 25 * 1024 * 1024;
const METHODS: &[&str] = &["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];
/// Headers the page may not set: the transport and identity ones are ureq's job.
const BLOCKED_HEADERS: &[&str] = &["host", "cookie", "content-length", "connection", "transfer-encoding"];

#[derive(Serialize)]
pub struct WebResponse {
    status: u16,
    #[serde(rename = "statusText")]
    status_text: String,
    /// "name: value" lines, the way XMLHttpRequest reports them.
    headers: String,
    /// The body, base64-encoded.
    body: String,
    #[serde(rename = "finalUrl")]
    final_url: String,
}

#[tauri::command]
pub async fn web_fetch(method: String, url: String, headers: Vec<(String, String)>, body: Option<String>) -> Result<WebResponse, String> {
    tauri::async_runtime::spawn_blocking(move || fetch(&method, &url, &headers, body.as_deref()))
        .await
        .map_err(|err| err.to_string())?
}

fn fetch(method: &str, url: &str, headers: &[(String, String)], body: Option<&str>) -> Result<WebResponse, String> {
    let method = method.to_ascii_uppercase();
    if !METHODS.contains(&method.as_str()) {
        return Err(format!("method {method} isn't allowed"));
    }
    let parsed = tauri::Url::parse(url).map_err(|err| err.to_string())?;
    check_public(&parsed)?;

    let agent = crate::network::agent_builder()
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        // Redirects are followed by hand below, so each hop is checked too.
        .redirects(0)
        .build();
    let mut current = parsed;
    for _ in 0..5 {
        let mut request = agent.request(&method, current.as_str());
        for (name, value) in headers {
            if !BLOCKED_HEADERS.contains(&name.to_ascii_lowercase().as_str()) {
                request = request.set(name, value);
            }
        }
        let bytes = match body {
            Some(encoded) => Some(base64::engine::general_purpose::STANDARD.decode(encoded).map_err(|err| err.to_string())?),
            None => None,
        };
        let result = match bytes {
            Some(bytes) => request.send_bytes(&bytes),
            None => request.call(),
        };
        // ureq reports 4xx/5xx as errors; the page wants them as ordinary responses.
        let response = match result {
            Ok(response) | Err(ureq::Error::Status(_, response)) => response,
            Err(err) => return Err(err.to_string()),
        };
        if (300..400).contains(&response.status()) {
            if let Some(location) = response.header("location") {
                current = current.join(location).map_err(|err| err.to_string())?;
                check_public(&current)?;
                continue;
            }
        }
        return read(response, current.as_str());
    }
    Err("too many redirects".into())
}

fn read(response: ureq::Response, final_url: &str) -> Result<WebResponse, String> {
    let headers = response
        .headers_names()
        .iter()
        .filter_map(|name| response.header(name).map(|value| format!("{name}: {value}")))
        .collect::<Vec<_>>()
        .join("\r\n");
    let status = response.status();
    let status_text = response.status_text().to_string();
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|err| err.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("response is too large".into());
    }
    Ok(WebResponse {
        status,
        status_text,
        headers,
        body: base64::engine::general_purpose::STANDARD.encode(bytes),
        final_url: final_url.to_string(),
    })
}

/// Only https, and only hosts that resolve to public addresses.
pub(crate) fn check_public(url: &tauri::Url) -> Result<(), String> {
    if url.scheme() != "https" {
        return Err("only https is allowed".into());
    }
    let host = url.host_str().ok_or("no host")?;
    if crate::network::tor_enabled(){
        let normalized=host.trim_matches(['[',']']).to_ascii_lowercase();
        if normalized=="localhost"||normalized.ends_with(".localhost")||normalized.ends_with(".local")||normalized.ends_with(".internal")||normalized.parse::<IpAddr>().is_ok_and(|ip|!is_public(ip)){return Err("Local/private destinations are not allowed".into());}
        // Tor resolves hostnames remotely; resolving them here would leak DNS.
        return Ok(());
    }
    let port = url.port_or_known_default().unwrap_or(443);
    let addresses = (host, port).to_socket_addrs().map_err(|err| err.to_string())?;
    for address in addresses {
        if !is_public(address.ip()) {
            return Err(format!("{host} is on your own machine or network"));
        }
    }
    Ok(())
}

pub(crate) fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => !(v4.is_private() || v4.is_loopback() || v4.is_link_local() || v4.is_unspecified() || v4.is_broadcast() || v4.octets()[0] == 100 && (64..128).contains(&v4.octets()[1])),
        IpAddr::V6(v6) => {
            let first = v6.segments()[0];
            !(v6.is_loopback() || v6.is_unspecified() || (first & 0xfe00) == 0xfc00 || (first & 0xffc0) == 0xfe80 || v6.to_ipv4_mapped().is_some_and(|v4| !is_public(IpAddr::V4(v4))))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{check_public, is_public};

    #[test]
    fn refuses_local_addresses() {
        for ip in ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.1.1", "100.100.1.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"] {
            assert!(!is_public(ip.parse().unwrap()), "{ip} should be refused");
        }
        assert!(is_public("1.1.1.1".parse().unwrap()));
    }

    #[test]
    fn refuses_plain_http_and_localhost() {
        assert!(check_public(&tauri::Url::parse("http://example.com").unwrap()).is_err());
        assert!(check_public(&tauri::Url::parse("https://localhost/").unwrap()).is_err());
    }
}
