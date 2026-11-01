//! Only reviewed SoundCloud web links may be handed to GhostCloud.
use tauri::Url;

pub fn ghostcloud_url(url:&Url)->Option<Url>{
    if !matches!(url.scheme(),"https"|"http")||!url.username().is_empty()||url.password().is_some()||url.port().is_some(){return None;}
    if !matches!(url.host_str(),Some("soundcloud.com"|"www.soundcloud.com"|"m.soundcloud.com"|"on.soundcloud.com")){return None;}
    let mut target=Url::parse("ghostcloud://open").ok()?;
    target.query_pairs_mut().append_pair("url",url.as_str());
    Some(target)
}

pub fn registered()->bool{
    #[cfg(windows)]{
        use winreg::{enums::HKEY_CLASSES_ROOT,RegKey};
        return RegKey::predef(HKEY_CLASSES_ROOT).open_subkey("ghostcloud").ok()
            .is_some_and(|key|key.get_value::<String,_>("URL Protocol").is_ok()&&key.open_subkey("shell\\open\\command").ok().is_some_and(|command|command.get_value::<String,_>("").is_ok_and(|value|!value.trim().is_empty())));
    }
    #[cfg(not(windows))]{false}
}

#[cfg(test)] mod tests{
    use super::*;
    #[test] fn soundcloud_links_round_trip_without_losing_private_link_or_timestamp(){
        for host in ["soundcloud.com","www.soundcloud.com","m.soundcloud.com","on.soundcloud.com"]{
            let source=Url::parse(&format!("https://{host}/artist/track/s-secret?si=a&other=%22quoted%22#t=1:20")).unwrap();
            let target=ghostcloud_url(&source).unwrap();
            assert_eq!(target.scheme(),"ghostcloud");assert_eq!(target.host_str(),Some("open"));
            assert_eq!(target.query_pairs().collect::<Vec<_>>(),vec![("url".into(),source.as_str().into())]);
        }
    }
    #[test] fn lookalike_hosts_credentials_ports_and_other_schemes_stay_out(){
        for value in ["https://soundcloud.com.evil.test/a","https://evil.soundcloud.com/a","https://notsoundcloud.com/a","https://soundcloud.com@evil.test/a","https://user@soundcloud.com/a","https://soundcloud.com:8443/a","file:///soundcloud.com/a","javascript:alert(1)","https://example.com/?url=https://soundcloud.com/a"]{
            assert!(ghostcloud_url(&Url::parse(value).unwrap()).is_none(),"{value}");
        }
    }
}
