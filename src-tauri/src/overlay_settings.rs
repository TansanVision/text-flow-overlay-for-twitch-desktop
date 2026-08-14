use std::{fs, path::PathBuf, sync::Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct OverlaySettings {
    pub language: String,
    pub settings_version: u8,
    pub comment_duration_seconds: f64,
    pub default_size: String,
    pub raid_clips_enabled: bool,
    pub raid_clip_count: u8,
    pub raid_clip_muted: bool,
    pub raid_intro_seconds: u64,
    pub raid_auto_shoutout: bool,
    pub raid_introduction_mode: String,
    pub enabled_effects: Vec<String>,
}

impl Default for OverlaySettings {
    fn default() -> Self {
        Self {
            language: "ja".to_owned(),
            settings_version: 1,
            comment_duration_seconds: 5.0,
            default_size: "medium".to_owned(),
            raid_clips_enabled: true,
            raid_clip_count: 5,
            raid_clip_muted: false,
            raid_intro_seconds: 60,
            raid_auto_shoutout: true,
            raid_introduction_mode: "automatic".to_owned(),
            enabled_effects: vec![
                "sakura",
                "snow",
                "balloons",
                "kamifubuki",
                "rain",
                "maruta",
                "chikuwa",
                "marutai",
            ]
            .into_iter()
            .map(str::to_owned)
            .collect(),
        }
    }
}

pub struct OverlaySettingsState {
    path: PathBuf,
    value: Mutex<OverlaySettings>,
}

impl OverlaySettingsState {
    pub fn load(path: PathBuf) -> Result<Self, String> {
        let value = if path.exists() {
            let bytes = fs::read(&path).map_err(|error| error.to_string())?;
            let raw: serde_json::Value = serde_json::from_slice(&bytes)
                .map_err(|error| format!("オーバーレイ設定を読み込めませんでした: {error}"))?;
            let needs_raid_defaults_migration = raw.get("settingsVersion").is_none();
            let mut value: OverlaySettings = serde_json::from_value(raw)
                .map_err(|error| format!("オーバーレイ設定を読み込めませんでした: {error}"))?;
            if needs_raid_defaults_migration {
                value.settings_version = 1;
                value.raid_intro_seconds = 60;
                value.raid_clip_count = 5;
                value.raid_clips_enabled = true;
                value.raid_auto_shoutout = true;
                write_settings(&path, &value)?;
            }
            value
        } else {
            let value = OverlaySettings::default();
            write_settings(&path, &value)?;
            value
        };
        validate(&value)?;
        Ok(Self {
            path,
            value: Mutex::new(value),
        })
    }
}

#[tauri::command]
pub fn get_overlay_settings(
    state: tauri::State<'_, OverlaySettingsState>,
) -> Result<OverlaySettings, String> {
    state
        .value
        .lock()
        .map_err(|error| error.to_string())
        .map(|value| value.clone())
}

#[tauri::command]
pub fn save_overlay_settings(
    app: AppHandle,
    settings: OverlaySettings,
    state: tauri::State<'_, OverlaySettingsState>,
) -> Result<(), String> {
    validate(&settings)?;
    write_settings(&state.path, &settings)?;
    *state.value.lock().map_err(|error| error.to_string())? = settings.clone();
    app.emit_to("overlay", "overlay-settings-updated", settings)
        .map_err(|error| error.to_string())
}

fn validate(settings: &OverlaySettings) -> Result<(), String> {
    if !matches!(settings.language.as_str(), "ja" | "en") {
        return Err("Language setting must be ja or en".into());
    }
    if !(1.0..=30.0).contains(&settings.comment_duration_seconds) {
        return Err("コメント表示時間は1～30秒で指定してください".into());
    }
    if !matches!(settings.default_size.as_str(), "small" | "medium" | "big") {
        return Err("既定サイズが不正です".into());
    }
    if !(1..=5).contains(&settings.raid_clip_count) {
        return Err("Raidクリップの再生本数は1～5件で指定してください".into());
    }
    if !(1..=60).contains(&settings.raid_intro_seconds) {
        return Err("Raidイントロの表示時間は1～60秒で指定してください".into());
    }
    if !matches!(
        settings.raid_introduction_mode.as_str(),
        "automatic" | "manual"
    ) {
        return Err("Raid紹介モードが不正です".into());
    }
    Ok(())
}

fn write_settings(path: &PathBuf, settings: &OverlaySettings) -> Result<(), String> {
    let contents = serde_json::to_vec_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(path, contents)
        .map_err(|error| format!("オーバーレイ設定を保存できませんでした: {error}"))
}
