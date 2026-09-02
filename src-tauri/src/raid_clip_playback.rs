use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RaidClipPlayback {
    playback_id: String,
    raid_id: String,
    display_name: String,
    title: String,
    clip_number: usize,
    clip_count: usize,
}

#[derive(Default)]
pub struct RaidClipPlaybackState(Mutex<Option<RaidClipPlayback>>);

fn is_current_playback(current: &Option<RaidClipPlayback>, playback_id: &str) -> bool {
    current
        .as_ref()
        .is_some_and(|clip| clip.playback_id == playback_id)
}

fn update_playback(
    current: &mut Option<RaidClipPlayback>,
    playback_id: &str,
    playback: Option<RaidClipPlayback>,
) -> Result<bool, String> {
    if let Some(clip) = &playback {
        if clip.playback_id != playback_id {
            return Err("クリップの再生IDが一致しません".into());
        }
    } else if !is_current_playback(current, playback_id) {
        // Cleanup from the previous clip must never clear the next clip's controls.
        return Ok(false);
    }
    *current = playback;
    Ok(true)
}

#[tauri::command]
pub fn get_raid_clip_playback(
    state: State<'_, RaidClipPlaybackState>,
) -> Result<Option<RaidClipPlayback>, String> {
    Ok(state.0.lock().map_err(|error| error.to_string())?.clone())
}

#[tauri::command]
pub fn set_raid_clip_playback(
    app: AppHandle,
    state: State<'_, RaidClipPlaybackState>,
    playback_id: String,
    playback: Option<RaidClipPlayback>,
) -> Result<(), String> {
    let mut current = state.0.lock().map_err(|error| error.to_string())?;
    if update_playback(&mut current, &playback_id, playback)? {
        app.emit_to(
            "control-panel",
            "raid-clip-playback-updated",
            current.clone(),
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn skip_raid_clip(
    app: AppHandle,
    state: State<'_, RaidClipPlaybackState>,
    playback_id: String,
) -> Result<bool, String> {
    let current = state.0.lock().map_err(|error| error.to_string())?;
    if !is_current_playback(&current, &playback_id) {
        return Ok(false);
    }
    app.emit_to(
        "overlay",
        "raid-clip-skip-requested",
        serde_json::json!({ "playbackId": playback_id }),
    )
    .map_err(|error| error.to_string())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clip(id: &str) -> RaidClipPlayback {
        RaidClipPlayback {
            playback_id: id.into(),
            raid_id: "raid".into(),
            display_name: "Raider".into(),
            title: "Clip".into(),
            clip_number: 1,
            clip_count: 2,
        }
    }

    #[test]
    fn only_the_current_clip_can_be_skipped_or_cleared() {
        let mut current = None;
        assert!(!is_current_playback(&current, "first"));
        update_playback(&mut current, "first", Some(clip("first"))).unwrap();
        assert!(is_current_playback(&current, "first"));
        update_playback(&mut current, "next", Some(clip("next"))).unwrap();
        assert!(!is_current_playback(&current, "first"));
        assert!(!update_playback(&mut current, "first", None).unwrap());
        assert!(is_current_playback(&current, "next"));
        assert!(update_playback(&mut current, "next", None).unwrap());
        assert!(current.is_none());
    }

    #[test]
    fn rejects_mismatched_playback_ids_without_changing_state() {
        let mut current = Some(clip("current"));
        assert!(update_playback(&mut current, "other", Some(clip("invalid"))).is_err());
        assert!(is_current_playback(&current, "current"));
    }
}
