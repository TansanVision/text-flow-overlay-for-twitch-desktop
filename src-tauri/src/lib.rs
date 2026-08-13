use std::{fs, net::TcpListener, path::PathBuf};

use tauri::Manager;
use tauri::{webview::WebviewWindowBuilder, WebviewUrl};

mod twitch_auth;
mod twitch_chat;

fn find_available_port() -> std::io::Result<u16> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    Ok(listener.local_addr()?.port())
}

fn create_portable_data_directories() -> std::io::Result<PathBuf> {
    let executable_directory = std::env::current_exe()?
        .parent()
        .ok_or_else(|| std::io::Error::other("executable directory was not found"))?
        .to_path_buf();
    let data_directory = executable_directory.join("portable-data");
    fs::create_dir_all(data_directory.join("auth"))?;
    fs::create_dir_all(data_directory.join("config"))?;
    fs::create_dir_all(data_directory.join("custom-stamps"))?;
    Ok(data_directory)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port = find_available_port().expect("failed to find an available localhost port");
    let data_directory =
        create_portable_data_directories().expect("failed to create portable data directories");

    tauri::Builder::default()
        .plugin(tauri_plugin_localhost::Builder::new(port).build())
        .plugin(tauri_plugin_opener::init())
        .manage(twitch_auth::TwitchAuthState::new(
            data_directory.join("auth").join("twitch-token.json"),
        ))
        .invoke_handler(tauri::generate_handler![
            twitch_auth::start_twitch_device_authorization,
            twitch_auth::poll_twitch_device_authorization,
            twitch_auth::restore_twitch_authorization,
            twitch_auth::logout_twitch
        ])
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            WebviewWindowBuilder::new(
                app,
                "control-panel",
                WebviewUrl::App(format!("index.html?port={port}").into()),
            )
            .title("Twitch Text Flow Overlay Desktop")
            .inner_size(1000.0, 700.0)
            .min_inner_size(720.0, 480.0)
            .build()?;

            let overlay = WebviewWindowBuilder::new(
                app,
                "overlay",
                WebviewUrl::App("index.html?view=overlay".into()),
            )
            .title("Twitch Text Flow Overlay")
            .inner_size(1280.0, 720.0)
            .fullscreen(false)
            .maximized(false)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .resizable(false)
            .skip_taskbar(true)
            .build()?;
            overlay.set_ignore_cursor_events(true)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "control-panel"
                && matches!(event, tauri::WindowEvent::CloseRequested { .. })
            {
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
