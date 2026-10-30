//! Fixed provider routes. Secrets are DPAPI-protected and never returned to the WebView.
use std::{collections::BTreeMap, io::Read, sync::Mutex, time::{Duration,Instant}};
use serde::{Deserialize,Serialize};
use serde_json::{Value,json};
use tauri::{Manager,AppHandle,WebviewWindow};
static VAULT_LOCK: Mutex<()> = Mutex::new(());
static REQUESTS: Mutex<Vec<Instant>> = Mutex::new(Vec::new());
#[derive(Default,Deserialize,Serialize)]
struct Vault { keys:BTreeMap<String,String>, #[serde(default)] intelx_host:String }
fn vault_path(app:&AppHandle)->Result<std::path::PathBuf,String> { Ok(app.path().app_config_dir().map_err(|_|"Config folder unavailable")?.join("provider-keys.bin")) }
#[cfg(windows)]
fn crypt(bytes:&[u8],protect:bool)->Result<Vec<u8>,String> {
    use windows::Win32::{Security::Cryptography::*,Foundation::{LocalFree,HLOCAL}};
    let input=CRYPT_INTEGER_BLOB{cbData:bytes.len() as u32,pbData:bytes.as_ptr() as *mut u8};
    let mut output=CRYPT_INTEGER_BLOB::default();
    unsafe {
        if protect { CryptProtectData(&input,windows::core::w!("XRay provider keys"),None,None,None,CRYPTPROTECT_UI_FORBIDDEN,&mut output) }
        else { CryptUnprotectData(&input,None,None,None,None,CRYPTPROTECT_UI_FORBIDDEN,&mut output) }.map_err(|_|"Windows could not unlock provider keys".to_string())?;
        let result=std::slice::from_raw_parts(output.pbData,output.cbData as usize).to_vec();
        LocalFree(Some(HLOCAL(output.pbData as *mut _))); Ok(result)
    }
}
#[cfg(not(windows))]
fn crypt(_bytes:&[u8],_protect:bool)->Result<Vec<u8>,String> { Err("Provider vault currently requires Windows DPAPI".into()) }
fn load(app:&AppHandle)->Result<Vault,String> {
    let path=vault_path(app)?;
    if !path.exists() { return Ok(Vault::default()); }
    let bytes=std::fs::read(path).map_err(|_|"Could not read provider vault")?;
    if bytes.len()>16384 {return Err("Provider vault exceeds its limit".into());}
    serde_json::from_slice(&crypt(&bytes,false)?).map_err(|_|"Provider vault is unreadable".into())
}
pub fn configured(app:&AppHandle,provider:&str)->bool { load(app).ok().and_then(|v|v.keys.get(provider).cloned()).is_some_and(|v|!v.is_empty()) }
#[tauri::command]
pub async fn provider_keys(app:AppHandle,window:WebviewWindow,provider:Option<String>,key:Option<String>,host:Option<String>)->Result<Value,String> {
    // Only the bundled, separate configuration window can write keys.
    if provider.is_some() && (window.label()!="provider-settings" || window.url().ok().is_none_or(|u| !(u.scheme()=="tauri" || matches!(u.scheme(),"http"|"https") && u.host_str()==Some("tauri.localhost")) || u.path()!="/providers.html")) { return Err("Use the native provider settings window".into()); }
    let _guard=VAULT_LOCK.lock().map_err(|_|"Vault busy")?;
    let mut vault=load(&app)?;
    if let Some(provider)=provider {
        if !["intelx","snusbase","oathnet"].contains(&provider.as_str()) {return Err("Unknown provider".into());}
        let key=key.unwrap_or_default().trim().to_owned();
        if key.len()>512 || key.contains(['\r','\n']) {return Err("Invalid API key".into());}
        if key.is_empty() {vault.keys.remove(&provider);} else {vault.keys.insert(provider,key);}
        if let Some(host)=host { if !["2.intelx.io","free.intelx.io"].contains(&host.as_str()){return Err("Unsupported IntelX API instance".into());}vault.intelx_host=host; }
        let bytes=crypt(&serde_json::to_vec(&vault).map_err(|_|"Could not encode keys")?,true)?;
        let path=vault_path(&app)?;std::fs::create_dir_all(path.parent().unwrap()).map_err(|_|"Could not create config folder")?;
        let temporary=path.with_extension("tmp");std::fs::write(&temporary,bytes).map_err(|_|"Could not save provider keys")?;std::fs::rename(temporary,path).map_err(|_|"Could not commit provider keys")?;
    }
    Ok(json!({"intelx":vault.keys.contains_key("intelx"),"snusbase":vault.keys.contains_key("snusbase"),"oathnet":vault.keys.contains_key("oathnet"),"intelxHost":if vault.intelx_host.is_empty(){"2.intelx.io"}else{&vault.intelx_host}}))
}
#[tauri::command]
pub fn open_provider_settings(app:AppHandle)->Result<(),String> {
    if let Some(window)=app.get_webview_window("provider-settings") {let _=window.show();let _=window.set_focus();return Ok(());}
    tauri::WebviewWindowBuilder::new(&app,"provider-settings",tauri::WebviewUrl::App("providers.html".into())).title("XRay · Provider keys").inner_size(530.,590.).resizable(false).build().map_err(|_|"Could not open provider settings")?;Ok(())
}
fn uuid(s:&str)->bool {s.len()==36 && s.bytes().all(|b|b.is_ascii_hexdigit() || b==b'-')}
pub fn request_plan(provider:&str,operation:&str,query:&str,kind:&str)->Result<(String,Option<Value>),String> {
    if query.len()>500 || query.contains(['\r','\n']) {return Err("Use a query of at most 500 characters".into());}
    match provider {
        "snusbase"=>{
            let path=match operation {"search"=>"data/search","count"=>"data/count","combo"=>"tools/combo-lookup","hash"=>"tools/hash-lookup","ip"=>"tools/ip-whois","domain"=>"tools/domain-whois","stats"=>return Ok(("/data/stats".into(),None)),_=>return Err("Unsupported Snusbase operation".into())};
            if query.trim().is_empty(){return Err("Enter a search term".into());}
            if !["email","username","lastip","password","hash","name","_domain"].contains(&kind){return Err("Snusbase has no Discord-ID selector. Use Oathnet for Discord IDs.".into());}
            if operation=="combo" && !["username","password"].contains(&kind){return Err("Combo lookup accepts username or password selectors".into());}
            if operation=="hash" && !["hash","password"].contains(&kind){return Err("Hash lookup accepts hash or password selectors".into());}
            let mut body=json!({"terms":[query]});
            if !["ip","domain"].contains(&operation) {body["types"]=json!([kind]);body["group_by"]=json!("db");}
            Ok((format!("/{path}"),Some(body)))
        },
        "intelx"=>{
            let path=match operation {"account"=>return Ok(("/authenticate/info".into(),None)),"search"=>{
                if query.trim().is_empty() || query.bytes().all(|b|b.is_ascii_digit()) || !["email","domain","url","ip","cidr","phone","bitcoin","mac","uuid","ipfs","simhash"].contains(&kind) {return Err("IntelX needs a supported selector such as an email, domain or IP; raw Discord IDs and usernames are unsupported.".into());}
                return Ok(("/intelligent/search".into(),Some(json!({"term":query,"buckets":[],"lookuplevel":0,"maxresults":100,"timeout":20,"datefrom":"","dateto":"","sort":4,"media":0,"terminate":[]}))));
            },"result"=>"/intelligent/search/result","statistics"=>"/intelligent/search/statistic","terminate"=>"/intelligent/search/terminate",_=>return Err("Unsupported IntelX operation".into())};
            if !uuid(query){return Err("Invalid IntelX search ID".into());}
            Ok((format!("{path}?id={query}&limit=100"),None))
        },
        "oathnet"=>{
            if operation=="session" {if query.trim().is_empty(){return Err("Enter a query".into());}return Ok(("/api/service/search/init".into(),Some(json!({"query":query}))));}
            let (path,param)=match operation {"profile"=>("discord-userinfo","discord_id"),"history"=>("discord-username-history","discord_id"),"search"=>("v2/breach/search","q"),"stealer"=>("v2/stealer/search","q"),"victims"=>("v2/victims/search","q"),"ip"=>("ip-info","ip"),"steam"=>("steam","steam_id"),"xbox"=>("xbox","xbl_id"),"roblox"=>("roblox-userinfo","username"),_=>return Err("Unsupported Oathnet operation".into())};
            if query.trim().is_empty(){return Err("Enter a query".into());}
            if ["profile","history"].contains(&operation) && (!(14..=19).contains(&query.len()) || !query.bytes().all(|b|b.is_ascii_digit())) {return Err("Use a 14–19 digit Discord ID".into());}
            let mut url=tauri::Url::parse(&format!("https://oathnet.org/api/service/{path}")).unwrap();url.query_pairs_mut().append_pair(param,query);
            if ["search","stealer","victims"].contains(&operation) {url.query_pairs_mut().append_pair("page_size","100");}
            if ["stealer","victims"].contains(&operation) {url.query_pairs_mut().append_pair("view","enriched");}
            Ok((url.as_str().trim_start_matches("https://oathnet.org").to_owned(),None))
        },_=>Err("Unknown provider".into())
    }
}
pub fn transfer(app:&AppHandle,provider:&str,operation:&str,query:&str,kind:&str)->Result<Value,String> {
    transfer_paged(app,provider,operation,query,kind,None)
}
fn paged_plan(provider:&str,operation:&str,query:&str,kind:&str,cursor:Option<&str>)->Result<(String,Option<Value>),String>{
    context_plan(provider,operation,query,kind,cursor,None)
}
fn context_plan(provider:&str,operation:&str,query:&str,kind:&str,cursor:Option<&str>,search_id:Option<&str>)->Result<(String,Option<Value>),String>{
    let (mut path,body)=request_plan(provider,operation,query,kind)?;
    if let Some(cursor)=cursor.filter(|c|!c.is_empty()) {
        if provider!="oathnet" || !["search","stealer","victims"].contains(&operation) || cursor.len()>4096 || cursor.contains(['\r','\n']) {return Err("Unsupported or invalid pagination cursor".into());}
        let mut url=tauri::Url::parse(&format!("https://oathnet.org{path}")).map_err(|_|"Invalid provider route")?;
        url.query_pairs_mut().append_pair("cursor",cursor);
        path=url.as_str().trim_start_matches("https://oathnet.org").to_owned();
    }
    if let Some(search_id)=search_id {
        if provider!="oathnet" || operation=="session" || search_id.is_empty() || search_id.len()>256 || !search_id.bytes().all(|b|b.is_ascii_alphanumeric() || matches!(b,b'_'|b'-')) {return Err("Invalid Oathnet search session".into());}
        let mut url=tauri::Url::parse(&format!("https://oathnet.org{path}")).map_err(|_|"Invalid provider route")?;
        url.query_pairs_mut().append_pair("search_id",search_id);path=url.as_str().trim_start_matches("https://oathnet.org").to_owned();
    }
    Ok((path,body))
}
fn transfer_paged(app:&AppHandle,provider:&str,operation:&str,query:&str,kind:&str,cursor:Option<&str>)->Result<Value,String> {
    transfer_context(app,provider,operation,query,kind,cursor,None)
}
fn transfer_context(app:&AppHandle,provider:&str,operation:&str,query:&str,kind:&str,cursor:Option<&str>,search_id:Option<&str>)->Result<Value,String> {
    let (path,body)=context_plan(provider,operation,query,kind,cursor,search_id)?;
    {let mut requests=REQUESTS.lock().map_err(|_|"Provider queue unavailable")?;requests.retain(|t|t.elapsed()<Duration::from_secs(60));if requests.len()>=30{return Err("Please wait before starting more lookups".into());}requests.push(Instant::now());}

    let vault=load(app)?;let key=vault.keys.get(provider).ok_or("Open Provider keys and configure this provider first")?;
    let (base,header)=match provider {"snusbase"=>("https://api.snusbase.com".to_owned(),"Auth"),"intelx"=>(format!("https://{}",if vault.intelx_host=="free.intelx.io"{"free.intelx.io"}else{"2.intelx.io"}),"X-Key"),_=>("https://oathnet.org".to_owned(),"x-api-key")};
    let agent=crate::network::agent_builder().timeout(Duration::from_secs(25)).redirects(0).build();
    let req=agent.request(if body.is_some(){"POST"}else{"GET"},&format!("{base}{path}")).set(header,key);
    let response=match body {Some(body)=>req.send_json(body),None=>req.call()};
    let response=match response {Ok(r)=>r,Err(ureq::Error::Status(429,response))=>{
        let retry=response.header("retry-after").or_else(||if provider=="snusbase"{response.header("x-rate-limit-reset")}else{None}).and_then(|s|s.parse::<u64>().ok()).filter(|s|*s<=86400);
        return Err(retry.map_or_else(||"Provider rate limit reached; your provider quota must reset before searches can run".to_owned(),|seconds|format!("Provider rate limit reached; retry after {seconds} seconds")));
    },Err(ureq::Error::Status(code,_))=>return Err(match code {401=>"Provider rejected the API key",403=>"Your plan does not permit this lookup",402=>"Provider credits exhausted",429=>"Provider rate limit reached; retry later",400=>"Provider rejected this query or selector",_=>"Provider request failed"}.into()),Err(_)=>return Err("Provider unreachable or timed out".into())};
    if operation=="terminate" && response.status()==204 {return Ok(json!({"stopped":true}));}
    let mut bytes=Vec::new();response.into_reader().take(2_000_001).read_to_end(&mut bytes).map_err(|_|"Could not read provider response")?;
    if bytes.len()>2_000_000{return Err("Provider response exceeds 2 MB; narrow the search".into());}
    let text=String::from_utf8(bytes).map_err(|_|"Provider returned unreadable data")?.replace(key,"[redacted API key]");
    let body:Value=serde_json::from_str(&text).map_err(|_|"Provider returned invalid JSON")?;
    if body["success"]==false && body["message"].as_str()!=Some("No results found.") {return Err("Provider could not complete this lookup; check your plan, query and quota".into());}
    Ok(body)
}
#[tauri::command]
pub async fn intel_request(app:AppHandle,provider:String,operation:String,query:String,kind:String,cursor:Option<String>,search_id:Option<String>)->Result<Value,String> {
    tauri::async_runtime::spawn_blocking(move||transfer_context(&app,&provider,&operation,&query,&kind,cursor.as_deref(),search_id.as_deref())).await.map_err(|_|"Lookup task failed".to_string())?
}
#[cfg(test)]
mod tests {use super::*;
#[test]fn provider_routes_are_fixed(){assert!(request_plan("intelx","search","771362184416198707","discord").is_err());assert!(request_plan("snusbase","search","user","discord").is_err());assert!(request_plan("oathnet","profile","771362184416198707","discord").is_ok());assert!(request_plan("oathnet","../../evil","x","x").is_err());assert!(request_plan("snusbase","search","test","username").unwrap().1.unwrap()["terms"][0]=="test");}
#[test]fn snusbase_tool_selectors_match_each_operation(){
 assert!(request_plan("snusbase","combo","example@example.com","email").is_err());
 assert!(request_plan("snusbase","combo","synthetic-user","username").is_ok());
 assert_eq!(request_plan("snusbase","hash","synthetic-password","password").unwrap().1.unwrap()["types"][0],"password");
 let body=request_plan("snusbase","ip","1.1.1.1","lastip").unwrap().1.unwrap();assert!(body.get("types").is_none());assert!(body.get("group_by").is_none());
}
#[test]fn search_cursor_is_encoded_only_on_the_fixed_oath_route(){
 let (path,_)=paged_plan("oathnet","search","300760994454437890","discord",Some("a+/=&cursor=evil")).unwrap();
 let url=tauri::Url::parse(&format!("https://oathnet.org{path}")).unwrap();let pairs=url.query_pairs().collect::<Vec<_>>();
 assert_eq!(pairs.iter().filter(|(k,_)|k=="cursor").count(),1);assert_eq!(pairs.iter().find(|(k,_)|k=="cursor").unwrap().1,"a+/=&cursor=evil");
 assert!(paged_plan("snusbase","search","user","username",Some("x")).is_err());
}
#[test]fn vault_round_trip(){let input=b"synthetic-test-key";let encrypted=crypt(input,true).unwrap();assert_ne!(encrypted,input);assert_eq!(crypt(&encrypted,false).unwrap(),input);}
#[test]fn full_search_context_stays_on_fixed_routes(){
 let (path,body)=request_plan("oathnet","session","300760994454437890","discord").unwrap();assert_eq!(path,"/api/service/search/init");assert_eq!(body.unwrap()["query"],"300760994454437890");
 for op in ["search","stealer","victims"] {let (path,_)=context_plan("oathnet",op,"300760994454437890","discord",Some("next+/="),Some("sess_test")).unwrap();let url=tauri::Url::parse(&format!("https://oathnet.org{path}")).unwrap();assert_eq!(url.host_str(),Some("oathnet.org"));assert!(url.query_pairs().any(|(k,v)|k=="search_id" && v=="sess_test"));}
 assert!(context_plan("oathnet","search","x","discord",None,Some("sess_test&url=evil")).is_err());assert!(context_plan("intelx","search","example.com","domain",None,Some("sess_test")).is_err());
}
}
