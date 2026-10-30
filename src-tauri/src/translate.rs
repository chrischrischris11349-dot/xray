//! Translates a message's text for the Translate plugin.
//!
//! Discord's page can't reach a translation service itself (its content
//! security policy only allows Discord's hosts), so the plugin hands the text
//! here. The command only ever talks to Google's public translate endpoint,
//! with the text capped, and runs off the UI thread so a slow answer never
//! freezes the window. Nothing is sent unless you pick Translate on a message.

use serde::Serialize;
use serde_json::Value;

const ENDPOINT: &str = "https://translate.googleapis.com/translate_a/single";
const MAX_CHARS: usize = 5000;
const TIMEOUT_SECS: u64 = 12;

#[derive(Serialize)]
pub struct Translation {
    text: String,
    /// The language Google detected, like "es".
    from: String,
}

#[tauri::command]
pub async fn translate(text: String, to: String) -> Result<Translation, String> {
    let to = language(&to).ok_or("unknown target language")?;
    let text: String = text.chars().take(MAX_CHARS).collect();
    if text.trim().is_empty() {
        return Err("nothing to translate".into());
    }
    tauri::async_runtime::spawn_blocking(move || request(&text, &to))
        .await
        .map_err(|err| err.to_string())?
}

/// Language codes are short letters and dashes ("en", "pt-BR", "zh-TW"); anything else is refused.
fn language(code: &str) -> Option<String> {
    let ok = !code.is_empty() && code.len() <= 8 && code.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    ok.then(|| code.to_string())
}

fn request(text: &str, to: &str) -> Result<Translation, String> {
    let body: Value = crate::network::agent_builder()
        .timeout(std::time::Duration::from_secs(TIMEOUT_SECS))
        .build()
        .post(ENDPOINT)
        .query("client", "gtx")
        .query("sl", "auto")
        .query("tl", to)
        .query("dt", "t")
        // In the body, not the URL: 5000 characters percent-encoded would overflow a URL.
        .send_form(&[("q", text)])
        .map_err(|err| err.to_string())?
        .into_json()
        .map_err(|err| err.to_string())?;
    parse(&body).ok_or_else(|| "unexpected answer from the translator".into())
}

/// The answer is `[[["translated", "original", ...], ...], null, "detected-language", ...]`.
fn parse(body: &Value) -> Option<Translation> {
    let text: String = body.get(0)?.as_array()?.iter().filter_map(|part| part.get(0)?.as_str()).collect();
    let from = body.get(2).and_then(Value::as_str).unwrap_or("").to_string();
    (!text.is_empty()).then_some(Translation { text, from })
}

#[cfg(test)]
mod tests {
    use super::{language, parse};
    use serde_json::json;

    #[test]
    fn joins_the_translated_pieces() {
        let body = json!([[["Hello ", "Hola ", null], ["world", "mundo", null]], null, "es"]);
        let t = parse(&body).unwrap();
        assert_eq!(t.text, "Hello world");
        assert_eq!(t.from, "es");
    }

    #[test]
    fn refuses_odd_language_codes() {
        assert!(language("pt-BR").is_some());
        assert!(language("en&x=1").is_none());
        assert!(language("").is_none());
    }
}
