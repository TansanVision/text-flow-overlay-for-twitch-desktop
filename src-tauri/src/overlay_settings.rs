use std::{fs, path::PathBuf, sync::Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlaySettings {
    pub comment_duration_seconds: f64,
    pub default_size: String,
}

impl Default for OverlaySettings {
    fn default() -> Self {
        Self {
            comment_duration_seconds: 5.0,
            default_size: "medium".to_owned(),
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
            serde_json::from_slice(&fs::read(&path).map_err(|error| error.to_string())?)
                .map_err(|error| format!("オーバーレイ設定を読み込めませんでした: {error}"))?
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
    if !(1.0..=30.0).contains(&settings.comment_duration_seconds) {
        return Err("コメント表示時間は1～30秒で指定してください".into());
    }
    if !matches!(settings.default_size.as_str(), "small" | "medium" | "big") {
        return Err("既定サイズが不正です".into());
    }
    Ok(())
}

fn write_settings(path: &PathBuf, settings: &OverlaySettings) -> Result<(), String> {
    let contents = serde_json::to_vec_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| format!("オーバーレイ設定を保存できませんでした: {error}"))
}
