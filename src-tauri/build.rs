fn main() {
    configure_twitch_client_id();
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "start_twitch_device_authorization",
            "poll_twitch_device_authorization",
            "restore_twitch_authorization",
            "logout_twitch",
            "send_twitch_shoutout",
            "start_twitch_commercial",
            "get_raid_clip_playback",
            "set_raid_clip_playback",
            "skip_raid_clip",
            "get_overlay_settings",
            "save_overlay_settings",
            "get_custom_stamps",
            "reload_custom_stamps",
            "get_custom_stamp_editor_data",
            "open_custom_stamp_directory",
            "save_custom_stamp_definitions",
            "get_custom_fonts",
            "reload_custom_fonts",
            "open_custom_font_directory",
            "get_external_emotes",
            "save_audience_interactions",
            "open_audience_directory",
            "clear_audience_interactions",
            "get_runtime_info",
            "get_overlay_window_visibility",
            "set_overlay_window_visibility",
            "notify_manual_raid_ready",
            "play_manual_raid_clips",
            "notify_manual_raid_clips_completed",
            "notify_raid_phase",
            "emit_overlay_test",
        ]),
    ))
    .expect("failed to run the Tauri build script")
}

fn configure_twitch_client_id() {
    println!("cargo:rerun-if-env-changed=TWITCH_CLIENT_ID");
    let client_id = std::env::var("TWITCH_CLIENT_ID").unwrap_or_default();
    let client_id = client_id.trim();
    assert!(
        !client_id.is_empty(),
        "TWITCH_CLIENT_ID is required at build time. Set it in the build environment, or use the npm Tauri scripts with .env.local (see .env.example)."
    );
    assert!(
        !client_id.chars().any(char::is_whitespace),
        "TWITCH_CLIENT_ID must not contain whitespace."
    );
    println!("cargo:rustc-env=TWITCH_CLIENT_ID={client_id}");
}
