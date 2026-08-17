// Windows'ta uygulama açılırken arka planda konsol (CMD) penceresi görünmesin.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    telefon_dukkan_lib::run();
}
