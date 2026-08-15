use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::PathBuf,
    sync::Mutex,
};

use serde::Serialize;

pub struct AudienceState {
    directory: PathBuf,
    entries: Mutex<BTreeMap<String, BTreeSet<String>>>,
}

impl AudienceState {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            directory,
            entries: Mutex::new(BTreeMap::new()),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudienceStatus {
    total: usize,
    path: String,
}

pub fn save(state: &AudienceState) -> Result<AudienceStatus, String> {
    let entries = state.entries.lock().map_err(|error| error.to_string())?;
    let labels = [
        ("comment", "コメントしてくれた方"),
        ("cheer", "チア・ビットしてくれた方"),
        ("subscribe", "サブスクしてくれた方"),
        ("gift", "ギフトを送ってくれた方"),
        ("raid", "レイドしてくれた方"),
    ];
    let mut output = String::new();
    for (kind, label) in labels {
        if let Some(names) = entries.get(kind) {
            if names.is_empty() {
                continue;
            }
            output.push_str(&format!(
                "## {label}\n{}\n\n",
                names.iter().cloned().collect::<Vec<_>>().join("\n")
            ));
        }
    }
    fs::create_dir_all(&state.directory)
        .map_err(|error| format!("反応ユーザー記録フォルダを作成できませんでした: {error}"))?;
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let base_name = format!("audience_{timestamp}");
    let mut path = state.directory.join(format!("{base_name}.md"));
    let mut sequence = 2;
    while path.exists() {
        path = state.directory.join(format!("{base_name}_{sequence}.md"));
        sequence += 1;
    }
    fs::write(&path, output)
        .map_err(|error| format!("反応ユーザー一覧を保存できませんでした: {error}"))?;
    Ok(AudienceStatus {
        total: entries.values().map(BTreeSet::len).sum(),
        path: path.display().to_string(),
    })
}

pub fn record(state: &AudienceState, kind: &str, name: &str) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Ok(());
    }
    state
        .entries
        .lock()
        .map_err(|error| error.to_string())?
        .entry(kind.to_owned())
        .or_default()
        .insert(name.to_owned());
    Ok(())
}

#[tauri::command]
pub fn save_audience_interactions(
    state: tauri::State<'_, AudienceState>,
) -> Result<AudienceStatus, String> {
    save(&state)
}

#[tauri::command]
pub fn open_audience_directory(state: tauri::State<'_, AudienceState>) -> Result<(), String> {
    fs::create_dir_all(&state.directory)
        .map_err(|error| format!("反応ユーザー記録フォルダを作成できませんでした: {error}"))?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(&state.directory)
            .spawn()
            .map_err(|error| format!("反応ユーザー記録フォルダを開けませんでした: {error}"))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("反応ユーザー記録フォルダを開く操作は現在Windowsのみ対応しています".into())
    }
}

#[tauri::command]
pub fn clear_audience_interactions(state: tauri::State<'_, AudienceState>) -> Result<(), String> {
    state
        .entries
        .lock()
        .map_err(|error| error.to_string())?
        .clear();
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    #[test]
    fn records_without_duplicates_and_saves_a_timestamped_file() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after UNIX epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "twitch-text-flow-overlay-audience-{}-{unique}",
            std::process::id()
        ));
        let state = AudienceState::new(directory.clone());

        record(&state, "comment", "viewer").expect("first record should succeed");
        record(&state, "comment", "viewer").expect("duplicate record should succeed");
        let status = save(&state).expect("save should succeed");

        assert_eq!(status.total, 1);
        let path = PathBuf::from(&status.path);
        assert_eq!(path.parent(), Some(directory.as_path()));
        assert!(path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("audience_") && name.ends_with(".md")));
        let contents = fs::read_to_string(&path).expect("saved file should be readable");
        assert!(contents.contains("viewer"));

        fs::remove_file(path).expect("test output file should be removable");
        fs::remove_dir(directory).expect("test output directory should be removable");
    }
}
