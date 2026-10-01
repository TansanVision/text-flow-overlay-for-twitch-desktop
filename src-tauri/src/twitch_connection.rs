use std::sync::Mutex;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

use crate::twitch_eventsub::RecentNotifications;

#[derive(Clone, Copy, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionPhase {
    #[default]
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
    ReauthorizationRequired,
    Unavailable,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionSnapshot {
    revision: u64,
    pub phase: ConnectionPhase,
    retry_in_seconds: Option<u64>,
    unavailable_subscriptions: Vec<String>,
}

#[derive(Default)]
struct Inner {
    generation: u64,
    snapshot: ConnectionSnapshot,
    recent: RecentNotifications,
}

#[derive(Default)]
pub struct ConnectionState(Mutex<Inner>);

impl ConnectionState {
    pub fn begin(&self, app: &AppHandle) -> u64 {
        let mut inner = self.0.lock().unwrap_or_else(|error| error.into_inner());
        inner.generation += 1;
        inner.snapshot = ConnectionSnapshot {
            revision: inner.snapshot.revision + 1,
            phase: ConnectionPhase::Connecting,
            ..Default::default()
        };
        let _ = app.emit_to(
            "control-panel",
            "twitch-connection-updated",
            &inner.snapshot,
        );
        inner.generation
    }

    pub fn update(
        &self,
        app: &AppHandle,
        generation: u64,
        phase: ConnectionPhase,
        retry: Option<u64>,
        unavailable: Vec<String>,
    ) {
        let mut inner = self.0.lock().unwrap_or_else(|error| error.into_inner());
        if inner.generation != generation {
            return;
        }
        inner.snapshot = ConnectionSnapshot {
            revision: inner.snapshot.revision + 1,
            phase,
            retry_in_seconds: retry,
            unavailable_subscriptions: unavailable,
        };
        let _ = app.emit_to(
            "control-panel",
            "twitch-connection-updated",
            &inner.snapshot,
        );
    }

    pub fn disconnect(&self, app: &AppHandle) {
        let generation = self.begin(app);
        self.0
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .recent = RecentNotifications::default();
        self.update(
            app,
            generation,
            ConnectionPhase::Disconnected,
            None,
            Vec::new(),
        );
    }

    pub fn accept(&self, generation: u64, message: &Value) -> bool {
        let mut inner = self.0.lock().unwrap_or_else(|error| error.into_inner());
        inner.generation == generation && inner.recent.accept(message)
    }

    pub fn is_current(&self, generation: u64) -> bool {
        self.0
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .generation
            == generation
    }
}

#[tauri::command]
pub fn get_twitch_connection(app: AppHandle) -> ConnectionSnapshot {
    app.state::<ConnectionState>()
        .0
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .snapshot
        .clone()
}
