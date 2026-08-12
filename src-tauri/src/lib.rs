use std::net::TcpListener;

use tauri::Manager;
use tauri::{webview::WebviewWindowBuilder, WebviewUrl};

fn find_available_port() -> std::io::Result<u16> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    Ok(listener.local_addr()?.port())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port = find_available_port().expect("failed to find an available localhost port");
    let origin = format!("http://localhost:{port}");

    tauri::Builder::default()
        .plugin(tauri_plugin_localhost::Builder::new(port).build())
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
                WebviewUrl::External(
                    format!("{origin}/index.html")
                        .parse()
                        .expect("invalid localhost URL"),
                ),
            )
            .title("Twitch Text Flow Overlay Desktop")
            .inner_size(1000.0, 700.0)
            .min_inner_size(720.0, 480.0)
            .build()?;

            let overlay_url = format!("{origin}/index.html?view=overlay");
            let overlay = WebviewWindowBuilder::new(
                app,
                "overlay",
                WebviewUrl::External(overlay_url.parse().expect("invalid overlay URL")),
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
