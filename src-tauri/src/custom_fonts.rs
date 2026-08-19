#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::{fs, path::PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomFont {
    id: String,
    name: String,
    file_name: String,
    data_uri: String,
}

pub struct CustomFontsState {
    directory: PathBuf,
}

impl CustomFontsState {
    pub fn new(directory: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&directory)
            .map_err(|error| format!("フォントフォルダを作成できませんでした: {error}"))?;
        Ok(Self { directory })
    }

    fn load(&self) -> Result<Vec<CustomFont>, String> {
        let mut files = fs::read_dir(&self.directory)
            .map_err(|error| error.to_string())?
            .filter_map(Result::ok)
            .filter_map(|entry| {
                let path = entry.path();
                let extension = path.extension()?.to_str()?.to_ascii_lowercase();
                matches!(extension.as_str(), "ttf" | "otf" | "woff" | "woff2").then_some((
                    entry.file_name().to_string_lossy().into_owned(),
                    path,
                    extension,
                ))
            })
            .collect::<Vec<_>>();
        files.sort_by_key(|(name, _, _)| name.to_ascii_lowercase());
        files
            .into_iter()
            .map(|(file_name, path, extension)| {
                let mime = match extension.as_str() {
                    "ttf" => "font/ttf",
                    "otf" => "font/otf",
                    "woff" => "font/woff",
                    "woff2" => "font/woff2",
                    _ => unreachable!(),
                };
                let bytes = fs::read(&path)
                    .map_err(|error| format!("{file_name}を読み込めませんでした: {error}"))?;
                let name = path
                    .file_stem()
                    .and_then(|value| value.to_str())
                    .unwrap_or(&file_name)
                    .to_owned();
                Ok(CustomFont {
                    id: format!("custom:{file_name}"),
                    name,
                    file_name,
                    data_uri: format!("data:{mime};base64,{}", STANDARD.encode(bytes)),
                })
            })
            .collect()
    }
}

#[tauri::command]
pub fn get_custom_fonts(
    state: tauri::State<'_, CustomFontsState>,
) -> Result<Vec<CustomFont>, String> {
    state.load()
}

#[tauri::command]
pub fn reload_custom_fonts(
    app: AppHandle,
    state: tauri::State<'_, CustomFontsState>,
) -> Result<Vec<CustomFont>, String> {
    let fonts = state.load()?;
    app.emit_to("overlay", "custom-fonts-updated", fonts.clone())
        .map_err(|error| error.to_string())?;
    Ok(fonts)
}

#[tauri::command]
pub fn open_custom_font_directory(state: tauri::State<'_, CustomFontsState>) -> Result<(), String> {
    let directory = state
        .directory
        .canonicalize()
        .map_err(|error| format!("フォントフォルダの場所を取得できませんでした: {error}"))?;

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        Command::new("explorer.exe")
            .arg(&directory)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|error| format!("フォントフォルダを開けませんでした: {error}"))?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = directory;
        Err("フォントフォルダを開く操作は現在Windowsのみ対応しています".into())
    }
}
