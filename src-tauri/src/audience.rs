use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::PathBuf,
    sync::Mutex,
};

use serde::Serialize;

pub struct AudienceState {
    path: PathBuf,
    entries: Mutex<BTreeMap<String, BTreeSet<String>>>,
}

impl AudienceState {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
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
    fs::write(&state.path, output)
        .map_err(|error| format!("反応ユーザー一覧を保存できませんでした: {error}"))?;
    Ok(AudienceStatus {
        total: entries.values().map(BTreeSet::len).sum(),
        path: state.path.display().to_string(),
    })
}

#[tauri::command]
pub fn record_audience_interaction(
    kind: String,
    name: String,
    state: tauri::State<'_, AudienceState>,
) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Ok(());
    }
    state
        .entries
        .lock()
        .map_err(|error| error.to_string())?
        .entry(kind)
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
pub fn clear_audience_interactions(state: tauri::State<'_, AudienceState>) -> Result<(), String> {
    state
        .entries
        .lock()
        .map_err(|error| error.to_string())?
        .clear();
    Ok(())
}
