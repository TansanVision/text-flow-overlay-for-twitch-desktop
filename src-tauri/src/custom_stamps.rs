use std::{fs, path::PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StampDefinition {
    command_name: String,
    file_name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomStamp {
    command_name: String,
    data_uri: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomStampEditorData {
    definitions: Vec<StampDefinition>,
    image_files: Vec<String>,
}

pub struct CustomStampsState {
    directory: PathBuf,
    config_path: PathBuf,
}

impl CustomStampsState {
    pub fn new(directory: PathBuf) -> Result<Self, String> {
        let config_path = directory.join("stamps.json");
        if !config_path.exists() {
            fs::write(&config_path, b"[]\n")
                .map_err(|error| format!("カスタムスタンプ設定を作成できませんでした: {error}"))?;
        }
        Ok(Self { directory, config_path })
    }

    fn load(&self) -> Result<Vec<CustomStamp>, String> {
        self.load_definitions()?
            .into_iter()
            .map(|definition| self.load_stamp(definition))
            .collect()
    }

    fn load_definitions(&self) -> Result<Vec<StampDefinition>, String> {
        serde_json::from_slice(&fs::read(&self.config_path).map_err(|error| error.to_string())?)
            .map_err(|error| format!("stamps.jsonを読み込めませんでした: {error}"))
    }

    fn image_files(&self) -> Result<Vec<String>, String> {
        let mut files = fs::read_dir(&self.directory)
            .map_err(|error| error.to_string())?
            .filter_map(Result::ok)
            .filter_map(|entry| {
                let path = entry.path();
                let extension = path.extension()?.to_str()?.to_ascii_lowercase();
                matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp")
                    .then(|| entry.file_name().to_string_lossy().into_owned())
            })
            .collect::<Vec<_>>();
        files.sort_by_key(|name| name.to_ascii_lowercase());
        Ok(files)
    }

    fn load_stamp(&self, definition: StampDefinition) -> Result<CustomStamp, String> {
        let command_name = definition.command_name.trim();
        if command_name.is_empty() || command_name.chars().any(char::is_whitespace) {
            return Err("スタンプのコマンド名は空白を含まない文字列にしてください".into());
        }
        let requested = PathBuf::from(&definition.file_name);
        if requested.components().count() != 1 {
            return Err(format!("不正なスタンプファイル名です: {}", definition.file_name));
        }
        let mime = match requested
            .extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref()
        {
            Some("png") => "image/png",
            Some("jpg" | "jpeg") => "image/jpeg",
            Some("gif") => "image/gif",
            Some("webp") => "image/webp",
            _ => return Err(format!("未対応の画像形式です: {}", definition.file_name)),
        };
        let bytes = fs::read(self.directory.join(&requested))
            .map_err(|error| format!("{}を読み込めませんでした: {error}", definition.file_name))?;
        Ok(CustomStamp {
            command_name: command_name.to_owned(),
            data_uri: format!("data:{mime};base64,{}", STANDARD.encode(bytes)),
        })
    }
}

#[tauri::command]
pub fn get_custom_stamps(state: tauri::State<'_, CustomStampsState>) -> Result<Vec<CustomStamp>, String> {
    state.load()
}

#[tauri::command]
pub fn reload_custom_stamps(app: AppHandle, state: tauri::State<'_, CustomStampsState>) -> Result<Vec<CustomStamp>, String> {
    emit_stamps(&app, state.load()?)
}

#[tauri::command]
pub fn get_custom_stamp_editor_data(state: tauri::State<'_, CustomStampsState>) -> Result<CustomStampEditorData, String> {
    Ok(CustomStampEditorData {
        definitions: state.load_definitions()?,
        image_files: state.image_files()?,
    })
}

#[tauri::command]
pub fn save_custom_stamp_definitions(
    app: AppHandle,
    definitions: Vec<StampDefinition>,
    state: tauri::State<'_, CustomStampsState>,
) -> Result<Vec<CustomStamp>, String> {
    for definition in definitions.iter().cloned() {
        state.load_stamp(definition)?;
    }
    let contents = serde_json::to_vec_pretty(&definitions).map_err(|error| error.to_string())?;
    fs::write(&state.config_path, contents)
        .map_err(|error| format!("stamps.jsonを保存できませんでした: {error}"))?;
    emit_stamps(&app, state.load()?)
}

fn emit_stamps(app: &AppHandle, stamps: Vec<CustomStamp>) -> Result<Vec<CustomStamp>, String> {
    app.emit_to("overlay", "custom-stamps-updated", stamps.clone())
        .map_err(|error| error.to_string())?;
    Ok(stamps)
}
