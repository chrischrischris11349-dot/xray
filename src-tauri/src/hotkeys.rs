//! Global hotkeys: push to talk, mute, deafen and fake deafen that work while
//! another app, like a game, has focus. Discord's web version only sees keys
//! while its window is focused, so xray watches the keyboard system-wide with
//! a low-level hook, plus the mouse when a mouse button is bound.
//!
//! The hooks only observe: every key still reaches the focused app. Discord's
//! page never sees keystrokes, only the name of the action that fired. With
//! no hotkeys set, no hook is installed at all.
//!
//! Known limit: Windows hides input aimed at apps running as administrator
//! from non-administrator apps, so hotkeys don't fire while such a game is focused.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use crate::{settings, Shell};

const MAX_LABEL_CHARS: usize = 32;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Binding {
    /// Windows virtual-key code. Mouse buttons use 0x04 (middle), 0x05 and 0x06 (back, forward).
    pub key: u16,
    #[serde(default)]
    pub ctrl: bool,
    #[serde(default)]
    pub shift: bool,
    #[serde(default)]
    pub alt: bool,
    /// What the panel shows, like "Ctrl+Shift+M" or "Mouse 4".
    #[serde(default)]
    pub label: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Hotkeys {
    pub push_to_talk: Option<Binding>,
    pub toggle_mute: Option<Binding>,
    pub toggle_deafen: Option<Binding>,
    pub toggle_fake_deafen: Option<Binding>,
}

impl Hotkeys {
    const NONE: Hotkeys = Hotkeys { push_to_talk: None, toggle_mute: None, toggle_deafen: None, toggle_fake_deafen: None };

    fn bindings(&self) -> impl Iterator<Item = &Binding> {
        [&self.push_to_talk, &self.toggle_mute, &self.toggle_deafen, &self.toggle_fake_deafen]
            .into_iter()
            .flatten()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    PushToTalk,
    ToggleMute,
    ToggleDeafen,
    ToggleFakeDeafen,
}

impl Action {
    const ALL: [Action; 4] = [Action::PushToTalk, Action::ToggleMute, Action::ToggleDeafen, Action::ToggleFakeDeafen];

    /// The name the page's `window.__xray.hotkey` handler expects.
    fn name(self) -> &'static str {
        match self {
            Action::PushToTalk => "pushToTalk",
            Action::ToggleMute => "toggleMute",
            Action::ToggleDeafen => "toggleDeafen",
            Action::ToggleFakeDeafen => "toggleFakeDeafen",
        }
    }

    fn binding(self, hotkeys: &Hotkeys) -> Option<&Binding> {
        match self {
            Action::PushToTalk => hotkeys.push_to_talk.as_ref(),
            Action::ToggleMute => hotkeys.toggle_mute.as_ref(),
            Action::ToggleDeafen => hotkeys.toggle_deafen.as_ref(),
            Action::ToggleFakeDeafen => hotkeys.toggle_fake_deafen.as_ref(),
        }
    }
}

const VK_SHIFT: u16 = 0x10;
const VK_CONTROL: u16 = 0x11;
const VK_MENU: u16 = 0x12;

fn is_mouse(key: u16) -> bool {
    matches!(key, 0x04..=0x06)
}

/// The low-level hook reports left and right modifiers separately; bindings use the plain ones.
fn normalize(key: u16) -> u16 {
    match key {
        0xA0 | 0xA1 => VK_SHIFT,
        0xA2 | 0xA3 => VK_CONTROL,
        0xA4 | 0xA5 => VK_MENU,
        other => other,
    }
}

/// Turns raw key events into hotkey presses and releases. A binding's
/// modifiers must be held, but extra ones are fine, so push to talk still
/// works while you hold Shift to sprint.
pub struct Matcher {
    held: [bool; 4],
    ctrl: bool,
    shift: bool,
    alt: bool,
}

impl Matcher {
    pub const fn new() -> Self {
        Self { held: [false; 4], ctrl: false, shift: false, alt: false }
    }

    pub fn key(&mut self, hotkeys: &Hotkeys, key: u16, down: bool) -> Vec<(Action, bool)> {
        let key = normalize(key);
        match key {
            VK_SHIFT => self.shift = down,
            VK_CONTROL => self.ctrl = down,
            VK_MENU => self.alt = down,
            _ => {}
        }
        let mut fired = Vec::new();
        for (i, action) in Action::ALL.into_iter().enumerate() {
            let Some(binding) = action.binding(hotkeys) else { continue };
            if normalize(binding.key) != key {
                continue;
            }
            if down {
                // Holding a key repeats key-down; only the first one counts.
                let modifiers_held = (!binding.ctrl || self.ctrl) && (!binding.shift || self.shift) && (!binding.alt || self.alt);
                if !self.held[i] && modifiers_held {
                    self.held[i] = true;
                    fired.push((action, true));
                }
            } else if self.held[i] {
                self.held[i] = false;
                fired.push((action, false));
            }
        }
        fired
    }

    pub fn release(&mut self, action: Action) -> bool {
        let i = action as usize;
        std::mem::replace(&mut self.held[i], false)
    }

    pub fn release_all(&mut self) -> Vec<(Action, bool)> {
        Action::ALL.into_iter().filter(|&action| self.release(action)).map(|action| (action, false)).collect()
    }
}

pub fn validate(hotkeys: &Hotkeys) -> Result<(), String> {
    for binding in hotkeys.bindings() {
        if binding.key == 0x01 || binding.key == 0x02 {
            return Err("Left and right click can't be hotkeys.".into());
        }
        if binding.key == 0 || binding.key > 0xFE {
            return Err(format!("Key code {} isn't a key xray can watch.", binding.key));
        }
        if binding.label.chars().count() > MAX_LABEL_CHARS {
            return Err("That key name is too long.".into());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_hotkeys<R: Runtime>(app: AppHandle<R>) -> Hotkeys {
    app.state::<Shell>().0.lock().map(|shell| shell.hotkeys.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn set_hotkeys<R: Runtime>(app: AppHandle<R>, hotkeys: Hotkeys) -> Result<(), String> {
    validate(&hotkeys)?;
    if let Ok(mut shell) = app.state::<Shell>().0.lock() {
        shell.hotkeys = hotkeys.clone();
        settings::save(&app, &shell);
    }
    #[cfg(windows)]
    hook::update(hotkeys);
    Ok(())
}

/// Starts watching for `hotkeys`, and forwards each press or release to Discord's page.
pub fn start<R: Runtime>(app: &AppHandle<R>, hotkeys: Hotkeys) {
    let (events, received) = std::sync::mpsc::channel::<(Action, bool)>();
    let app = app.clone();
    let forward = move || {
        for (action, pressed) in received {
            let call = format!("window.__xray && window.__xray.hotkey({:?}, {pressed})", action.name());
            crate::window::eval(&app, &call);
        }
    };
    if let Err(err) = std::thread::Builder::new().name("xray-hotkey-events".into()).spawn(forward) {
        eprintln!("xray: couldn't start hotkeys: {err}");
        return;
    }
    #[cfg(windows)]
    hook::start(hotkeys, events);
    #[cfg(not(windows))]
    let _ = (hotkeys, events);
}

#[cfg(windows)]
mod hook {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::mpsc::Sender;
    use std::sync::{Mutex, OnceLock, RwLock};

    use windows::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, KillTimer, PeekMessageW, PostThreadMessageW, SetTimer, SetWindowsHookExW,
        UnhookWindowsHookEx, HC_ACTION, HHOOK, HOOKPROC, KBDLLHOOKSTRUCT, MSG, MSLLHOOKSTRUCT, PM_NOREMOVE, WH_KEYBOARD_LL,
        WH_MOUSE_LL, WINDOWS_HOOK_ID, WM_APP, WM_KEYDOWN, WM_KEYUP, WM_MBUTTONDOWN, WM_MBUTTONUP, WM_MOUSEMOVE,
        WM_SYSKEYDOWN, WM_SYSKEYUP, WM_TIMER, WM_USER, WM_XBUTTONDOWN, WM_XBUTTONUP, XBUTTON2,
    };

    use super::{is_mouse, Action, Hotkeys, Matcher};

    /// Posted to the hook thread when the bindings change.
    const WM_REFRESH: u32 = WM_APP + 1;
    /// While push to talk is held, how often to confirm the key is really still down.
    /// If Windows ever swallows the release (focus moving to an admin app, say),
    /// this stops the mic from staying open.
    const HELD_CHECK_MS: u32 = 200;
    const VK_MBUTTON: u16 = 0x04;
    const VK_XBUTTON1: u16 = 0x05;
    const VK_XBUTTON2: u16 = 0x06;

    static HOTKEYS: RwLock<Hotkeys> = RwLock::new(Hotkeys::NONE);
    static MATCHER: Mutex<Matcher> = Mutex::new(Matcher::new());
    static EVENTS: OnceLock<Sender<(Action, bool)>> = OnceLock::new();
    static THREAD: OnceLock<u32> = OnceLock::new();
    static HELD_TIMER: AtomicUsize = AtomicUsize::new(0);

    pub fn start(hotkeys: Hotkeys, events: Sender<(Action, bool)>) {
        if let Ok(mut current) = HOTKEYS.write() {
            *current = hotkeys;
        }
        let _ = EVENTS.set(events);
        if let Err(err) = std::thread::Builder::new().name("xray-hotkeys".into()).spawn(run) {
            eprintln!("xray: couldn't start the hotkey watcher: {err}");
        }
    }

    pub fn update(hotkeys: Hotkeys) {
        if let Ok(mut current) = HOTKEYS.write() {
            *current = hotkeys;
        }
        // Anything held under the old bindings is let go, so push to talk can't stick.
        let released = MATCHER.lock().map(|mut matcher| matcher.release_all()).unwrap_or_default();
        released.into_iter().for_each(send);
        if let Some(&thread) = THREAD.get() {
            unsafe {
                let _ = PostThreadMessageW(thread, WM_REFRESH, WPARAM(0), LPARAM(0));
            }
        }
    }

    fn send(event: (Action, bool)) {
        if let Some(events) = EVENTS.get() {
            let _ = events.send(event);
        }
    }

    /// The hook thread: low-level hooks call back on the thread that installed
    /// them, through its message loop.
    fn run() {
        unsafe {
            let mut msg = MSG::default();
            // Makes sure this thread has a message queue before anyone posts to it.
            let _ = PeekMessageW(&mut msg, None, WM_USER, WM_USER, PM_NOREMOVE);
            let _ = THREAD.set(GetCurrentThreadId());
            let mut hooks = Hooks::default();
            hooks.refresh();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                match msg.message {
                    WM_REFRESH => hooks.refresh(),
                    WM_TIMER => check_push_to_talk(),
                    _ => {}
                }
            }
        }
    }

    #[derive(Default)]
    struct Hooks {
        keyboard: Option<HHOOK>,
        mouse: Option<HHOOK>,
    }

    impl Hooks {
        /// Installs only the hooks the current bindings need.
        unsafe fn refresh(&mut self) {
            let (keyboard, mouse) = match HOTKEYS.read() {
                Ok(hotkeys) => (hotkeys.bindings().any(|b| !is_mouse(b.key)), hotkeys.bindings().any(|b| is_mouse(b.key))),
                Err(_) => (false, false),
            };
            let module: Option<HINSTANCE> = GetModuleHandleW(None).ok().map(Into::into);
            set_hook(&mut self.keyboard, keyboard, WH_KEYBOARD_LL, Some(keyboard_proc), module);
            set_hook(&mut self.mouse, mouse, WH_MOUSE_LL, Some(mouse_proc), module);
        }
    }

    unsafe fn set_hook(slot: &mut Option<HHOOK>, wanted: bool, kind: WINDOWS_HOOK_ID, proc: HOOKPROC, module: Option<HINSTANCE>) {
        if wanted && slot.is_none() {
            match SetWindowsHookExW(kind, proc, module, 0) {
                Ok(hook) => *slot = Some(hook),
                Err(err) => eprintln!("xray: couldn't watch for hotkeys: {err}"),
            }
        } else if !wanted {
            if let Some(hook) = slot.take() {
                let _ = UnhookWindowsHookEx(hook);
            }
        }
    }

    unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code as u32 == HC_ACTION {
            let info = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
            match wparam.0 as u32 {
                WM_KEYDOWN | WM_SYSKEYDOWN => on_input(info.vkCode as u16, true),
                WM_KEYUP | WM_SYSKEYUP => on_input(info.vkCode as u16, false),
                _ => {}
            }
        }
        CallNextHookEx(None, code, wparam, lparam)
    }

    unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        // Movement is by far the most common mouse event, so it leaves first.
        let message = wparam.0 as u32;
        if code as u32 == HC_ACTION && message != WM_MOUSEMOVE {
            let info = &*(lparam.0 as *const MSLLHOOKSTRUCT);
            let x_button = if (info.mouseData >> 16) as u16 == XBUTTON2 { VK_XBUTTON2 } else { VK_XBUTTON1 };
            match message {
                WM_MBUTTONDOWN => on_input(VK_MBUTTON, true),
                WM_MBUTTONUP => on_input(VK_MBUTTON, false),
                WM_XBUTTONDOWN => on_input(x_button, true),
                WM_XBUTTONUP => on_input(x_button, false),
                _ => {}
            }
        }
        CallNextHookEx(None, code, wparam, lparam)
    }

    /// Runs inside the hook callback, so it only matches and queues; the page call happens elsewhere.
    fn on_input(key: u16, down: bool) {
        let fired = match (HOTKEYS.read(), MATCHER.lock()) {
            (Ok(hotkeys), Ok(mut matcher)) => matcher.key(&hotkeys, key, down),
            _ => return,
        };
        for event in fired {
            if event == (Action::PushToTalk, true) {
                start_held_check();
            }
            send(event);
        }
    }

    fn start_held_check() {
        if HELD_TIMER.load(Ordering::Relaxed) == 0 {
            let id = unsafe { SetTimer(None, 0, HELD_CHECK_MS, None) };
            HELD_TIMER.store(id, Ordering::Relaxed);
        }
    }

    fn stop_held_check() {
        let id = HELD_TIMER.swap(0, Ordering::Relaxed);
        if id != 0 {
            unsafe {
                let _ = KillTimer(None, id);
            }
        }
    }

    fn check_push_to_talk() {
        let key = HOTKEYS.read().ok().and_then(|hotkeys| hotkeys.push_to_talk.as_ref().map(|b| b.key));
        let still_down = key.is_some_and(|key| unsafe { GetAsyncKeyState(i32::from(key)) } as u16 & 0x8000 != 0);
        if still_down {
            return;
        }
        stop_held_check();
        let was_held = MATCHER.lock().map(|mut matcher| matcher.release(Action::PushToTalk)).unwrap_or(false);
        if was_held {
            send((Action::PushToTalk, false));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bind(key: u16, ctrl: bool) -> Option<Binding> {
        Some(Binding { key, ctrl, shift: false, alt: false, label: String::new() })
    }

    #[test]
    fn push_to_talk_presses_once_and_releases() {
        let hotkeys = Hotkeys { push_to_talk: bind(0x56, false), ..Hotkeys::default() };
        let mut m = Matcher::new();
        assert_eq!(m.key(&hotkeys, 0x56, true), vec![(Action::PushToTalk, true)]);
        assert!(m.key(&hotkeys, 0x56, true).is_empty(), "key repeat must not press again");
        assert_eq!(m.key(&hotkeys, 0x56, false), vec![(Action::PushToTalk, false)]);
        assert!(m.key(&hotkeys, 0x41, true).is_empty());
    }

    #[test]
    fn modifiers_must_be_held_but_extras_are_fine() {
        let hotkeys = Hotkeys { toggle_mute: bind(0x4D, true), push_to_talk: bind(0x56, false), ..Hotkeys::default() };
        let mut m = Matcher::new();
        assert!(m.key(&hotkeys, 0x4D, true).is_empty(), "M alone isn't Ctrl+M");
        m.key(&hotkeys, 0x4D, false);
        m.key(&hotkeys, 0xA2, true); // left Ctrl
        assert_eq!(m.key(&hotkeys, 0x4D, true), vec![(Action::ToggleMute, true)]);
        m.key(&hotkeys, 0xA0, true); // left Shift held while sprinting
        assert_eq!(m.key(&hotkeys, 0x56, true), vec![(Action::PushToTalk, true)]);
    }

    #[test]
    fn a_lone_modifier_can_be_a_hotkey() {
        let hotkeys = Hotkeys { push_to_talk: bind(VK_CONTROL, false), ..Hotkeys::default() };
        let mut m = Matcher::new();
        assert_eq!(m.key(&hotkeys, 0xA3, true), vec![(Action::PushToTalk, true)]); // right Ctrl
        assert_eq!(m.key(&hotkeys, 0xA3, false), vec![(Action::PushToTalk, false)]);
    }

    #[test]
    fn release_all_lets_go_of_held_keys() {
        let hotkeys = Hotkeys { push_to_talk: bind(0x56, false), ..Hotkeys::default() };
        let mut m = Matcher::new();
        m.key(&hotkeys, 0x56, true);
        assert_eq!(m.release_all(), vec![(Action::PushToTalk, false)]);
        assert!(m.release_all().is_empty());
    }

    #[test]
    fn validation_rejects_clicks_and_bad_codes() {
        assert!(validate(&Hotkeys { toggle_mute: bind(0x01, false), ..Hotkeys::default() }).is_err());
        assert!(validate(&Hotkeys { toggle_mute: bind(0x00, false), ..Hotkeys::default() }).is_err());
        assert!(validate(&Hotkeys { toggle_mute: bind(0x05, false), ..Hotkeys::default() }).is_ok());
    }

    #[test]
    fn hotkeys_round_trip_as_camel_case_json() {
        let json = r#"{"pushToTalk":{"key":86,"label":"V"},"toggleMute":null}"#;
        let hotkeys: Hotkeys = serde_json::from_str(json).unwrap();
        assert_eq!(hotkeys.push_to_talk.as_ref().map(|b| b.key), Some(86));
        assert!(serde_json::to_string(&hotkeys).unwrap().contains("\"toggleFakeDeafen\":null"));
    }
}
