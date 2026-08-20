use std::{fs, net::TcpListener, path::PathBuf, sync::Mutex};

use serde::Serialize;
use tauri::{webview::WebviewWindowBuilder, WebviewUrl};
use tauri::{Emitter, Manager, PhysicalPosition, Position};

mod audience;
mod custom_fonts;
mod custom_stamps;
mod external_emotes;
mod overlay_settings;
mod twitch_auth;
mod twitch_chat;

struct OverlayWindowPositionState {
    previous_position: Mutex<Option<PhysicalPosition<i32>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    operating_system: &'static str,
    architecture: &'static str,
}

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
    fs::create_dir_all(data_directory.join("fonts"))?;
    fs::create_dir_all(data_directory.join("audience"))?;
    Ok(data_directory)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port = find_available_port().expect("failed to find an available localhost port");
    let data_directory =
        create_portable_data_directories().expect("failed to create portable data directories");
    let settings = overlay_settings::OverlaySettingsState::load(
        data_directory.join("config").join("overlay.json"),
    )
    .expect("failed to load overlay settings");
    let custom_stamps = custom_stamps::CustomStampsState::new(data_directory.join("custom-stamps"))
        .expect("failed to initialize custom stamps");
    let custom_fonts = custom_fonts::CustomFontsState::new(data_directory.join("fonts"))
        .expect("failed to initialize custom fonts");

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(control_panel) = app.get_webview_window("control-panel") {
                let _ = control_panel.unminimize();
                let _ = control_panel.show();
                let _ = control_panel.set_focus();
            }
        }))
        .plugin(tauri_plugin_localhost::Builder::new(port).build())
        .plugin(tauri_plugin_opener::init())
        .manage(twitch_auth::TwitchAuthState::new(
            data_directory.join("auth").join("twitch-token.json"),
        ))
        .manage(settings)
        .manage(custom_stamps)
        .manage(custom_fonts)
        .manage(audience::AudienceState::new(
            data_directory.join("audience"),
        ))
        .manage(OverlayWindowPositionState {
            previous_position: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            twitch_auth::start_twitch_device_authorization,
            twitch_auth::poll_twitch_device_authorization,
            twitch_auth::restore_twitch_authorization,
            twitch_auth::logout_twitch,
            twitch_auth::send_twitch_shoutout,
            overlay_settings::get_overlay_settings,
            overlay_settings::save_overlay_settings,
            custom_stamps::get_custom_stamps,
            custom_stamps::reload_custom_stamps,
            custom_stamps::get_custom_stamp_editor_data,
            custom_stamps::open_custom_stamp_directory,
            custom_stamps::save_custom_stamp_definitions,
            custom_fonts::get_custom_fonts,
            custom_fonts::reload_custom_fonts,
            custom_fonts::open_custom_font_directory,
            external_emotes::get_external_emotes,
            audience::save_audience_interactions,
            audience::open_audience_directory,
            audience::clear_audience_interactions,
            get_runtime_info,
            get_overlay_window_visibility,
            set_overlay_window_visibility,
            notify_manual_raid_ready,
            play_manual_raid_clips,
            notify_manual_raid_clips_completed,
            notify_raid_phase,
            emit_overlay_test
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
                WebviewUrl::External(
                    format!("http://localhost:{port}/index.html?view=overlay")
                        .parse()
                        .expect("failed to build the localhost overlay URL"),
                ),
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

#[tauri::command]
fn get_runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        operating_system: match std::env::consts::OS {
            "windows" => "Windows",
            "macos" => "macOS",
            "linux" => "Linux",
            value => value,
        },
        architecture: match std::env::consts::ARCH {
            "x86_64" => "x64",
            "x86" => "x86",
            "aarch64" => "ARM64",
            value => value,
        },
    }
}

#[tauri::command]
fn notify_manual_raid_ready(app: tauri::AppHandle, raid: serde_json::Value) -> Result<(), String> {
    app.emit_to("control-panel", "manual-raid-ready", raid)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn play_manual_raid_clips(app: tauri::AppHandle, raid: serde_json::Value) -> Result<(), String> {
    app.emit_to("overlay", "manual-raid-clips-requested", raid)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn notify_manual_raid_clips_completed(
    app: tauri::AppHandle,
    raid_id: String,
) -> Result<(), String> {
    app.emit_to(
        "control-panel",
        "manual-raid-clips-completed",
        serde_json::json!({ "raidId": raid_id }),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn notify_raid_phase(app: tauri::AppHandle, raid_id: String, phase: String) -> Result<(), String> {
    app.emit_to(
        "control-panel",
        "raid-phase-updated",
        serde_json::json!({ "raidId": raid_id, "phase": phase }),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_overlay_window_visibility(app: tauri::AppHandle) -> Result<bool, String> {
    let position = app
        .get_webview_window("overlay")
        .ok_or_else(|| "オーバーレイウィンドウが見つかりません".to_owned())?
        .outer_position()
        .map_err(|error| error.to_string())?;
    Ok(position.x > -5000 && position.y > -5000)
}

#[tauri::command]
fn set_overlay_window_visibility(
    app: tauri::AppHandle,
    visible: bool,
    state: tauri::State<'_, OverlayWindowPositionState>,
) -> Result<bool, String> {
    let overlay = app
        .get_webview_window("overlay")
        .ok_or_else(|| "オーバーレイウィンドウが見つかりません".to_owned())?;
    if visible {
        overlay.show().map_err(|error| error.to_string())?;
        let position = state
            .previous_position
            .lock()
            .map_err(|error| error.to_string())?
            .take()
            .unwrap_or_else(|| PhysicalPosition::new(0, 0));
        overlay
            .set_position(Position::Physical(position))
            .map_err(|error| error.to_string())?;
    } else {
        let current_position = overlay
            .outer_position()
            .map_err(|error| error.to_string())?;
        if current_position.x > -5000 && current_position.y > -5000 {
            *state
                .previous_position
                .lock()
                .map_err(|error| error.to_string())? = Some(current_position);
        }
        overlay.show().map_err(|error| error.to_string())?;
        overlay
            .set_position(Position::Physical(PhysicalPosition::new(-10_000, -10_000)))
            .map_err(|error| error.to_string())?;
    }
    get_overlay_window_visibility(app)
}

#[tauri::command]
fn emit_overlay_test(
    app: tauri::AppHandle,
    event: String,
    payload: serde_json::Value,
) -> Result<(), String> {
    match event.as_str() {
        "twitch-chat-message" | "twitch-raid" => app
            .emit_to("overlay", &event, payload)
            .map_err(|error| error.to_string()),
        _ => Err("許可されていないテストイベントです".into()),
    }
}
