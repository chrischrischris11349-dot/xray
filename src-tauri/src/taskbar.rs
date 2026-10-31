use tauri::AppHandle;
#[tauri::command]
pub fn set_voice_controls(app:AppHandle,window:tauri::WebviewWindow,muted:bool,deafened:bool,connected:bool) {
    #[cfg(windows)] let _={let label=window.label().to_string();app.run_on_main_thread(move||native::update(&label,muted,deafened,connected))};
    #[cfg(not(windows))] let _=(app,muted,deafened,connected);
}
pub fn install_window<R:tauri::Runtime>(window:&tauri::WebviewWindow<R>) { #[cfg(windows)] native::install(window.clone()); #[cfg(not(windows))] let _=window; }
pub fn register_shortcut(app:&AppHandle) {#[cfg(windows)] {let _=native::shortcut(app);} #[cfg(not(windows))] let _=app;}

#[cfg(windows)]
mod native {
use super::*;
use std::{cell::RefCell,collections::HashMap};
use windows::{core::{Interface,PCWSTR,GUID},Win32::{Foundation::{HWND,LPARAM,LRESULT,WPARAM,PROPERTYKEY},System::{Com::{CoCreateInstance,CLSCTX_INPROC_SERVER,IPersistFile,StructuredStorage::PROPVARIANT},Variant::VT_LPWSTR},UI::{Shell::*,WindowsAndMessaging::*}}};
thread_local! {static STATE:RefCell<HashMap<String,*mut Controls>>=RefCell::new(HashMap::new());}
struct Controls {label:String,dispatch:Box<dyn Fn(&str)>,hwnd:HWND,list:ITaskbarList3,icons:[HICON;5],created:u32,added:bool,muted:bool,deafened:bool,connected:bool}
fn buttons(state:&Controls)->[THUMBBUTTON;3] {
    std::array::from_fn(|n|{let active=if n==0{state.muted}else{state.deafened};let text=if n==2{"Leave voice channel"}else if n==0{if active{"Unmute"}else{"Mute"}}else if active{"Undeafen"}else{"Deafen"};let mut button=THUMBBUTTON{dwMask:THB_ICON|THB_TOOLTIP|THB_FLAGS,iId:101+n as u32,hIcon:state.icons[if n==2{4}else{n*2+usize::from(active)}],dwFlags:if n==2&&!state.connected{THBF_DISABLED}else{THBF_ENABLED},..Default::default()};for(i,c)in text.encode_utf16().enumerate(){button.szTip[i]=c;}button})
}
pub fn update(label:&str,muted:bool,deafened:bool,connected:bool){STATE.with(|slot|unsafe{if let Some(state)=slot.borrow().get(label).and_then(|pointer|pointer.as_mut()){if state.muted==muted&&state.deafened==deafened&&state.connected==connected{return;}state.muted=muted;state.deafened=deafened;state.connected=connected;if state.added{let _=state.list.ThumbBarUpdateButtons(state.hwnd,&buttons(state));}}});}
unsafe extern "system" fn callback(hwnd:HWND,msg:u32,wparam:WPARAM,lparam:LPARAM,_id:usize,data:usize)->LRESULT {
    let state=&mut *(data as *mut Controls);
    if msg==state.created {state.added=state.list.ThumbBarUpdateButtons(hwnd,&buttons(state)).is_ok() || state.list.ThumbBarAddButtons(hwnd,&buttons(state)).is_ok();}
    if msg==WM_COMMAND && ((wparam.0>>16)&0xffff)==0x1800 {let id=wparam.0&0xffff;if [101,102,103].contains(&id){let action=if id==101{"mute"}else if id==102{"deafen"}else{"leave"};(state.dispatch)(action);return LRESULT(0);}}
    if msg==WM_NCDESTROY {STATE.with(|slot|{slot.borrow_mut().remove(&state.label);});let _=RemoveWindowSubclass(hwnd,Some(callback),0x5852);let state=Box::from_raw(data as *mut Controls);for icon in state.icons{let _=DestroyIcon(icon);}return DefSubclassProc(hwnd,msg,wparam,lparam);}
    DefSubclassProc(hwnd,msg,wparam,lparam)
}
pub fn install<R:tauri::Runtime>(window:tauri::WebviewWindow<R>) {
    unsafe {
        let label=window.label().to_string();if STATE.with(|slot|slot.borrow().contains_key(&label)){return;}let Ok(raw)=window.hwnd()else{return;};let hwnd=HWND(raw.0);
        let Ok(list)=CoCreateInstance::<_,ITaskbarList3>(&TaskbarList,None,CLSCTX_INPROC_SERVER)else{return;};if list.HrInit().is_err(){return;}
        let images:[&[u8];5]=[include_bytes!("../icons/taskbar-mic.png"),include_bytes!("../icons/taskbar-mic-off.png"),include_bytes!("../icons/taskbar-headphones.png"),include_bytes!("../icons/taskbar-headphone-off.png"),include_bytes!("../icons/taskbar-leave.png")];
        let mut icons=[HICON::default();5];for(i,image)in images.into_iter().enumerate(){let Ok(icon)=CreateIconFromResourceEx(image,true,0x30000,24,24,LR_DEFAULTCOLOR)else{for icon in icons{if !icon.is_invalid(){let _=DestroyIcon(icon);}}return;};icons[i]=icon;}
        let created=RegisterWindowMessageW(windows::core::w!("TaskbarButtonCreated"));
        let mut state=Box::new(Controls{label:label.clone(),dispatch:Box::new(move|action|{let _=window.eval(&format!("window.__xray?.taskbarVoice('{action}')"));}),hwnd,list,icons,created,added:false,muted:false,deafened:false,connected:false});
        state.added=state.list.ThumbBarAddButtons(hwnd,&buttons(&state)).is_ok();
        let pointer=Box::into_raw(state);if SetWindowSubclass(hwnd,Some(callback),0x5852,pointer as usize).as_bool(){STATE.with(|slot|{slot.borrow_mut().insert(label,pointer);});}else{let state=Box::from_raw(pointer);for icon in state.icons{let _=DestroyIcon(icon);}}
    }
}
fn app_id_property(id:&str)->windows::core::Result<PROPVARIANT>{
    // PROPVARIANT::drop calls PropVariantClear. Its LPWSTR must be COM-owned,
    // never a borrowed Rust Vec pointer (which causes a double free on return).
    let wide=id.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
    unsafe {
        let string=SHStrDupW(PCWSTR(wide.as_ptr()))?;
        let mut value=PROPVARIANT::default();
        (*value.Anonymous.Anonymous).vt=VT_LPWSTR;
        (*value.Anonymous.Anonymous).Anonymous.pwszVal=string;
        Ok(value)
    }
}
#[cfg(test)]
mod tests{use super::*;
 #[test]fn shortcut_string_is_com_owned_and_drops_safely(){
  for _ in 0..128 {
   let value=app_id_property("app.xray.desktop").unwrap();assert_eq!(value.vt(),VT_LPWSTR);
   assert_eq!(windows::core::BSTR::try_from(&value).unwrap().to_string(),"app.xray.desktop");
   drop(value);
  }
 }
}
pub fn shortcut(app:&AppHandle)->windows::core::Result<()> {
    // A real Start-menu shortcut with the AUMID lets Windows resolve the friendly
    // notification application name instead of showing app.xray.desktop.
    let Some(roaming)=std::env::var_os("APPDATA")else{return Ok(());};
    let dir=std::path::PathBuf::from(roaming).join("Microsoft/Windows/Start Menu/Programs/XRay");let _=std::fs::create_dir_all(&dir);
    let Ok(exe)=std::env::current_exe()else{return Ok(());};
    let wide=|s:&str|s.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
    unsafe {
        let link:IShellLinkW=CoCreateInstance(&ShellLink,None,CLSCTX_INPROC_SERVER)?;
        link.SetPath(PCWSTR(wide(&exe.to_string_lossy()).as_ptr()))?;link.SetDescription(windows::core::w!("XRay"))?;
        let properties:PropertiesSystem::IPropertyStore=link.cast()?;
        let value=app_id_property(&app.config().identifier)?;
        let key=PROPERTYKEY{fmtid:GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3),pid:5};properties.SetValue(&key,&value)?;properties.Commit()?;
        let file:IPersistFile=link.cast()?;file.Save(PCWSTR(wide(&dir.join("XRay.lnk").to_string_lossy()).as_ptr()),true)?;
    }Ok(())
}
}
