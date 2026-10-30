//! Local, opt-in Tor routing. Never replace a failed proxy with a direct socket.
use std::{path::PathBuf,sync::{Mutex,atomic::{AtomicBool,Ordering}}};
static BROWSER:Mutex<Option<PathBuf>>=Mutex::new(None);
static TOR:AtomicBool=AtomicBool::new(false);
static TOR_LINKS:AtomicBool=AtomicBool::new(false);
pub const SOCKS:&str="socks5://127.0.0.1:9050";
pub fn configure(enabled:bool,browser:&str,links:bool){TOR.store(enabled,Ordering::SeqCst);TOR_LINKS.store(links,Ordering::SeqCst);if let Ok(mut path)=BROWSER.lock(){*path=if browser.is_empty(){None}else{Some(PathBuf::from(browser))};}}
pub fn tor_enabled()->bool{TOR.load(Ordering::SeqCst)}
pub fn tor_links_enabled()->bool{tor_enabled()||TOR_LINKS.load(Ordering::SeqCst)}
pub fn agent_builder()->ureq::AgentBuilder{builder_for(tor_enabled(),SOCKS)}
pub fn public_resolver(host:&str)->std::io::Result<Vec<std::net::SocketAddr>>{
 if tor_enabled(){let address=host.parse::<std::net::SocketAddr>().map_err(|_|std::io::Error::new(std::io::ErrorKind::PermissionDenied,"Local DNS is disabled in Tor mode"))?;if address.to_string()!="127.0.0.1:9050"{return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied,"Only the local Tor transport may connect directly"));}return Ok(vec![address]);}
 use std::net::ToSocketAddrs;let addresses:Vec<_>=host.to_socket_addrs()?.collect();
 if addresses.is_empty()||addresses.iter().any(|a|!crate::webfetch::is_public(a.ip())){return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied,"Non-public destination"));}Ok(addresses)
}
fn builder_for(enabled:bool,proxy:&str)->ureq::AgentBuilder{
 let builder=ureq::AgentBuilder::new();
 if enabled{builder.proxy(ureq::Proxy::new(proxy).expect("fixed local SOCKS URL"))}else{builder}
}
pub fn browser_args(base:&str)->String{
 if !tor_enabled(){return base.into();}
 format!("{base} --proxy-server={SOCKS} --proxy-bypass-list=\"<-loopback>\" --host-resolver-rules=\"MAP * ~NOTFOUND, EXCLUDE 127.0.0.1\" --dns-prefetch-disable --disable-quic --force-webrtc-ip-handling-policy=disable_non_proxied_udp")
}
pub fn validate_environment()->Result<(),String>{
 if tor_enabled(){let args=std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default().to_ascii_lowercase();if ["--no-proxy-server","--proxy-server","--proxy-bypass-list","--host-resolver-rules","--force-webrtc-ip-handling-policy"].iter().any(|flag|args.contains(flag)){return Err("Strict Tor mode refused conflicting WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS. Remove that external proxy override and restart; no direct fallback was used.".into());}}
 Ok(())
}
pub fn privacy_script()->&'static str{
 if !tor_enabled(){return "";}
 r#"Object.defineProperty(window,'__xrayTorMode',{value:true});
 for(const key of ['RTCPeerConnection','webkitRTCPeerConnection','RTCIceTransport','RTCDtlsTransport'])Object.defineProperty(window,key,{configurable:false,writable:false,value:undefined});"#
}
pub fn tor_browser_path()->Option<PathBuf>{
 let path=BROWSER.lock().ok()?.clone()?;
 let metadata=std::fs::read_to_string(path.parent()?.join("application.ini")).ok()?;
 let policies:serde_json::Value=serde_json::from_str(&std::fs::read_to_string(path.parent()?.join("distribution/policies.json")).ok()?).ok()?;
 (path.is_file()&&metadata.lines().any(|line|line.trim()=="Vendor=Tor Project")&&metadata.lines().any(|line|line.trim()=="RemotingName=Tor Browser")&&browser_policy_matches(&policies)).then_some(path)
}
fn browser_policy_matches(value:&serde_json::Value)->bool{
 let proxy=&value["policies"]["Proxy"];let prefs=&value["policies"]["Preferences"];
 proxy["Mode"]=="manual"&&proxy["Locked"]==true&&proxy["SOCKSProxy"]=="127.0.0.1:9050"&&proxy["SOCKSVersion"]==5&&proxy["UseProxyForDNS"]==true&&proxy["Passthrough"]==""&&["network.proxy.failover_direct","media.peerconnection.enabled"].iter().all(|key|prefs[*key]["Value"]==false&&prefs[*key]["Status"]=="locked")
}
pub fn open_browser(url:&str)->Result<(),String>{
 let firefox=tor_browser_path().ok_or("Link kept closed: the configured Tor Browser installation could not be verified. No ordinary browser was used.")?;
 // Validate a live SOCKS listener without contacting the destination or resolving DNS.
 use std::io::{Read,Write};
 let mut socket=std::net::TcpStream::connect_timeout(&"127.0.0.1:9050".parse().unwrap(),std::time::Duration::from_secs(2)).map_err(|_|"Link kept closed: start Tor on 127.0.0.1:9050 first.")?;
 socket.set_read_timeout(Some(std::time::Duration::from_secs(2))).map_err(|_|"Proxy check failed")?;
 socket.write_all(&[5,1,0]).map_err(|_|"Proxy check failed")?;let mut reply=[0;2];socket.read_exact(&mut reply).map_err(|_|"Proxy check failed")?;if reply!=[5,0]{return Err("Link kept closed: local service is not the configured SOCKS5 proxy.".into());}
 // A dedicated profile accepts subsequent reviewed links without touching the
 // user's ordinary Tor Browser profile or colliding with its no-remote lock.
 let profile=firefox.parent().unwrap().join("TorBrowser/Data/Browser/xray-profile");std::fs::create_dir_all(&profile).map_err(|_|"The XRay Tor Browser profile could not be created")?;
 std::process::Command::new(&firefox).current_dir(firefox.parent().unwrap()).env_remove("TOR_TRANSPROXY").env_remove("MOZ_NO_REMOTE").env("TOR_PROVIDER","none").env("TOR_SKIP_LAUNCH","1").env("TOR_SOCKS_HOST","127.0.0.1").env("TOR_SOCKS_PORT","9050").env("TOR_SKIP_CONTROLPORTTEST","1").args(["--allow-remote","--profile"]).arg(profile).args(["-new-tab",url]).spawn().map_err(|_|"Firefox could not open; no other browser was used.")?;Ok(())
}
#[cfg(test)]mod tests{
 use super::*;use std::{io::{Read,Write},net::TcpListener,time::Duration};
 #[test]fn socks_sends_hostnames_and_never_calls_destination_dns(){
  let listener=TcpListener::bind("127.0.0.1:0").unwrap();let address=listener.local_addr().unwrap();
  let worker=std::thread::spawn(move||{let(mut stream,_)=listener.accept().unwrap();stream.set_read_timeout(Some(Duration::from_secs(3))).unwrap();let mut greeting=[0;3];stream.read_exact(&mut greeting).unwrap();assert_eq!(greeting,[5,1,0]);stream.write_all(&[5,0]).unwrap();let mut head=[0;5];stream.read_exact(&mut head).unwrap();assert_eq!(&head[..4],&[5,1,0,3]);let mut domain=vec![0;head[4]as usize];stream.read_exact(&mut domain).unwrap();assert_eq!(domain,b"xray-dns-must-not-resolve.invalid");stream.write_all(&[5,1,0,1,0,0,0,0,0,0]).unwrap();});
  let agent=builder_for(true,&format!("socks5://{address}")).resolver(move|host:&str|{assert_eq!(host,address.to_string(),"Only the numeric proxy transport may resolve locally");Ok(vec![address])}).timeout(Duration::from_secs(3)).build();
  // The proxy's numeric loopback address is parsed without resolving a hostname.
  assert!(agent.get("https://xray-dns-must-not-resolve.invalid").call().is_err());worker.join().unwrap();
 }
 #[test]fn unavailable_proxy_fails_without_a_direct_connection(){let listener=TcpListener::bind("127.0.0.1:0").unwrap();let address=listener.local_addr().unwrap();drop(listener);assert!(builder_for(true,&format!("socks5://{address}")).timeout(Duration::from_secs(1)).build().get("https://xray-dns-must-not-resolve.invalid").call().is_err());}
 #[test]fn browser_policy_requires_locked_remote_dns_without_direct_fallback(){let mut policy=serde_json::json!({"policies":{"Proxy":{"Mode":"manual","Locked":true,"SOCKSProxy":"127.0.0.1:9050","SOCKSVersion":5,"UseProxyForDNS":true,"Passthrough":""},"Preferences":{"network.proxy.failover_direct":{"Value":false,"Status":"locked"},"media.peerconnection.enabled":{"Value":false,"Status":"locked"}}}});assert!(browser_policy_matches(&policy));policy["policies"]["Proxy"]["Passthrough"]=serde_json::json!("*");assert!(!browser_policy_matches(&policy));policy["policies"]["Proxy"]["Passthrough"]=serde_json::json!("");policy["policies"]["Preferences"]["network.proxy.failover_direct"]["Value"]=serde_json::json!(true);assert!(!browser_policy_matches(&policy));}
 #[test]#[ignore="requires the user's running local Tor proxy"]fn live_tor_exit_check(){let result:serde_json::Value=builder_for(true,SOCKS).timeout(Duration::from_secs(45)).build().get("https://check.torproject.org/api/ip").call().unwrap().into_json().unwrap();assert_eq!(result["IsTor"],true);println!("Native HTTPS request verified as using Tor; exit address omitted.");}
}
