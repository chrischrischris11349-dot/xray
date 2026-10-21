// Release builds are GUI apps: no console window behind xray.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    xray::run();
}
