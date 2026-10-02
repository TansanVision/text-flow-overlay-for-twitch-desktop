use super::*;

fn store() -> Store {
    Store {
        rewards: vec![PointsReward {
            client_id: TWITCH_CLIENT_ID.into(),
            broadcaster_id: "channel".into(),
            id: "reward".into(),
            effect: PointsEffect::Hearts,
            cost: 100,
            cooldown_seconds: 30,
            enabled: true,
        }],
        jobs: Vec::new(),
    }
}

fn event(id: &str) -> Value {
    json!({"id":id, "broadcaster_user_id":"channel", "user_id":"viewer", "reward":{"id":"reward"}, "status":"unfulfilled", "redeemed_at":"2026-09-29T00:00:00Z"})
}

fn now() -> i64 {
    chrono::DateTime::parse_from_rfc3339("2026-09-29T00:00:01Z")
        .unwrap()
        .timestamp_millis()
}

#[test]
fn legacy_trail_rewards_and_jobs_migrate_to_hearts_without_changing_ids() {
    let mut original = store();
    original.receive(&event("existing-redemption"), "channel", false, now());
    let legacy = serde_json::to_string(&original)
        .unwrap()
        .replace("\"hearts\"", "\"trail\"");
    let migrated: Store = serde_json::from_str(&legacy).unwrap();
    assert_eq!(migrated.rewards[0].id, "reward");
    assert_eq!(migrated.rewards[0].effect, PointsEffect::Hearts);
    assert_eq!(migrated.jobs[0].id, "existing-redemption");
    assert_eq!(migrated.jobs[0].effect, PointsEffect::Hearts);
    assert!(serde_json::to_string(&migrated)
        .unwrap()
        .contains("\"hearts\""));
}

#[test]
fn failed_persistence_does_not_publish_a_completion_or_consume_a_claim() {
    let directory = std::env::temp_dir().join(format!(
        "text-flow-points-failure-{}",
        rand::random::<u64>()
    ));
    let mut initial = store();
    initial.receive(&event("one"), "channel", false, now());
    let state = PointsState {
        path: directory.join("missing").join("points.json"),
        store: Mutex::new(initial),
        operations: tokio::sync::Mutex::new(()),
        sync_error: Mutex::new(None),
    };
    assert!(state
        .change(|store| (store.claim(Some("channel"), false, now()), true))
        .is_err());
    assert_eq!(
        state.store.lock().unwrap().jobs[0].status,
        JobStatus::Queued
    );
    state
        .store
        .lock()
        .unwrap()
        .claim(Some("channel"), false, now());
    assert!(state
        .change(|store| (store.finish("one", true), true))
        .is_err());
    assert_eq!(
        state.store.lock().unwrap().jobs[0].status,
        JobStatus::Playing
    );
}

#[test]
fn overload_is_refunded_and_pending_settlements_are_never_pruned() {
    let mut store = store();
    for index in 0..151 {
        store.receive(&event(&index.to_string()), "channel", false, now());
    }
    assert_eq!(
        store
            .jobs
            .iter()
            .filter(|job| job.status == JobStatus::Queued)
            .count(),
        50
    );
    assert_eq!(
        store
            .jobs
            .iter()
            .filter(|job| job.status == JobStatus::CancelPending)
            .count(),
        101
    );
    store.expire(now() + MAX_WAIT_MS);
    assert_eq!(store.jobs.len(), 151);
    assert!(store
        .jobs
        .iter()
        .all(|job| job.status == JobStatus::CancelPending));
}

#[test]
fn queues_owned_rewards_once_and_ignores_other_channels_and_rewards() {
    let mut store = store();
    assert!(store.receive(&event("one"), "channel", false, now()));
    assert!(!store.receive(&event("one"), "channel", false, now()));
    assert!(!store.receive(&event("other-channel"), "other", false, now()));
    let mut unknown = event("unknown");
    unknown["reward"]["id"] = json!("unmanaged");
    assert!(!store.receive(&unknown, "channel", false, now()));
    assert_eq!(store.jobs.len(), 1);
}

#[test]
fn raid_waits_and_only_one_effect_is_claimed_at_a_time() {
    let mut store = store();
    store.receive(&event("one"), "channel", false, now());
    store.receive(&event("two"), "channel", false, now());
    assert!(store.claim(Some("channel"), true, now()).is_none());
    assert!(store.claim(Some("other"), false, now()).is_none());
    assert_eq!(
        store.claim(Some("channel"), false, now()).unwrap().id,
        "one"
    );
    assert_eq!(
        store.claim(Some("channel"), false, now()).unwrap().id,
        "one"
    );
    assert!(store.finish("one", true));
    assert!(!store.finish("one", false));
    assert_eq!(store.jobs[0].status, JobStatus::FulfillPending);
    assert_eq!(
        store.claim(Some("channel"), false, now()).unwrap().id,
        "two"
    );
}

#[test]
fn expiration_and_disabled_rewards_are_refunded_instead_of_fulfilled() {
    let mut store = store();
    store.receive(&event("waiting"), "channel", false, now());
    store.expire(now() + MAX_WAIT_MS);
    assert_eq!(store.jobs[0].status, JobStatus::CancelPending);
    store.rewards[0].enabled = false;
    store.receive(&event("disabled"), "channel", false, now());
    assert_eq!(store.jobs[1].status, JobStatus::CancelPending);
    store.rewards[0].enabled = true;
    store.receive(&event("playing"), "channel", false, now());
    store.claim(Some("channel"), false, now());
    store.expire(now() + MAX_PLAY_MS);
    assert_eq!(store.jobs[2].status, JobStatus::CancelPending);
}

#[test]
fn twitch_cancellation_cannot_be_overwritten_by_a_late_renderer_ack() {
    let mut store = store();
    store.receive(&event("one"), "channel", false, now());
    store.claim(Some("channel"), false, now());
    let mut canceled = event("one");
    canceled["status"] = json!("canceled");
    assert!(store.receive(&canceled, "channel", true, now()));
    assert!(!store.finish("one", true));
    assert_eq!(store.jobs[0].status, JobStatus::Canceled);
}

#[test]
fn restart_preserves_settlement_intents_and_refunds_unconfirmed_playback() {
    let directory =
        std::env::temp_dir().join(format!("text-flow-points-{}", rand::random::<u64>()));
    fs::create_dir_all(&directory).unwrap();
    let path = directory.join("points.json");
    let mut store = store();
    store.receive(&event("complete"), "channel", false, now());
    store.claim(Some("channel"), false, now());
    store.finish("complete", true);
    store.receive(&event("interrupted"), "channel", false, now());
    store.claim(Some("channel"), false, now());
    fs::write(&path, serde_json::to_vec(&store).unwrap()).unwrap();
    let restored = PointsState::load(path.clone()).unwrap();
    let store = restored.store.lock().unwrap();
    assert_eq!(store.jobs[0].status, JobStatus::FulfillPending);
    assert_eq!(store.jobs[1].status, JobStatus::CancelPending);
    drop(store);
    fs::remove_file(path).unwrap();
    fs::remove_dir(directory).unwrap();
}
