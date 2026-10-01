use std::{fs, path::PathBuf, sync::Mutex, time::Duration};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};

use crate::{twitch_auth::TwitchAuthState, twitch_config::TWITCH_CLIENT_ID};

const API: &str = "https://api.twitch.tv/helix/channel_points/custom_rewards";
pub const ADD_EVENT: &str = "channel.channel_points_custom_reward_redemption.add";
pub const UPDATE_EVENT: &str = "channel.channel_points_custom_reward_redemption.update";
const MAX_WAIT_MS: i64 = 120_000;
const MAX_PLAY_MS: i64 = 120_000;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PointsEffect {
    #[serde(alias = "trail")]
    Hearts,
    Gravity,
    Flower,
    EmoteFountain,
    Fireworks,
    Bubbles,
    Paint,
}

impl PointsEffect {
    fn title(self) -> &'static str {
        match self {
            Self::Hearts => "ふわふわハート",
            Self::Gravity => "10秒の無重力",
            Self::Flower => "花のじゅうたん",
            Self::EmoteFountain => "エモート噴水",
            Self::Fireworks => "お祝い花火",
            Self::Bubbles => "シャボン玉",
            Self::Paint => "ペイント遊び",
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PointsReward {
    client_id: String,
    broadcaster_id: String,
    id: String,
    effect: PointsEffect,
    cost: u32,
    cooldown_seconds: u32,
    enabled: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum JobStatus {
    Queued,
    Playing,
    FulfillPending,
    CancelPending,
    Fulfilled,
    Canceled,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PointsJob {
    id: String,
    reward_id: String,
    client_id: String,
    broadcaster_id: String,
    pub user_id: String,
    pub effect: PointsEffect,
    status: JobStatus,
    created_at: i64,
    started_at: Option<i64>,
    #[serde(default)]
    next_retry_at: i64,
    preview: bool,
    error: Option<String>,
}

impl PointsJob {
    fn finished(&self) -> bool {
        matches!(self.status, JobStatus::Fulfilled | JobStatus::Canceled)
    }
    fn belongs_to(&self, user: &str) -> bool {
        self.client_id == TWITCH_CLIENT_ID && self.broadcaster_id == user
    }
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
struct Store {
    rewards: Vec<PointsReward>,
    jobs: Vec<PointsJob>,
}

impl Store {
    fn receive(&mut self, event: &Value, user: &str, update: bool, now: i64) -> bool {
        if event["broadcaster_user_id"].as_str() != Some(user) {
            return false;
        }
        let Some(id) = event["id"].as_str().filter(|id| !id.is_empty()) else {
            return false;
        };
        if let Some(job) = self
            .jobs
            .iter_mut()
            .find(|job| job.id == id && job.belongs_to(user))
        {
            if update {
                let status = match event["status"].as_str() {
                    Some("fulfilled") => Some(JobStatus::Fulfilled),
                    Some("canceled") => Some(JobStatus::Canceled),
                    _ => None,
                };
                if let Some(status) = status {
                    job.status = status;
                    job.error = None;
                    return true;
                }
            }
            return false;
        }
        if update || event["status"].as_str() != Some("unfulfilled") {
            return false;
        }
        let Some(user_id) = event["user_id"].as_str().filter(|id| !id.is_empty()) else {
            return false;
        };
        let Some(reward) = self.rewards.iter().find(|reward| {
            reward.client_id == TWITCH_CLIENT_ID
                && reward.broadcaster_id == user
                && event["reward"]["id"] == reward.id
        }) else {
            return false;
        };
        let created_at = event["redeemed_at"]
            .as_str()
            .and_then(|time| chrono::DateTime::parse_from_rfc3339(time).ok())
            .map(|time| time.timestamp_millis().min(now))
            .unwrap_or(now);
        let overloaded = self
            .jobs
            .iter()
            .filter(|job| {
                job.belongs_to(user) && matches!(job.status, JobStatus::Queued | JobStatus::Playing)
            })
            .count()
            >= 50;
        let expired = now - created_at >= MAX_WAIT_MS;
        let cancel = !reward.enabled || overloaded || expired;
        self.jobs.push(PointsJob {
            id: id.into(),
            reward_id: reward.id.clone(),
            client_id: TWITCH_CLIENT_ID.into(),
            broadcaster_id: user.into(),
            user_id: user_id.into(),
            effect: reward.effect,
            status: if cancel {
                JobStatus::CancelPending
            } else {
                JobStatus::Queued
            },
            created_at,
            started_at: None,
            next_retry_at: 0,
            preview: false,
            error: cancel.then(|| "無効・混雑・待機時間超過のため返還待ちです".into()),
        });
        true
    }

    fn expire(&mut self, now: i64) -> bool {
        let mut changed = false;
        for job in &mut self.jobs {
            let expired = match job.status {
                JobStatus::Queued => now - job.created_at >= MAX_WAIT_MS,
                JobStatus::Playing => now - job.started_at.unwrap_or(job.created_at) >= MAX_PLAY_MS,
                _ => false,
            };
            if expired {
                job.status = if job.preview {
                    JobStatus::Canceled
                } else {
                    JobStatus::CancelPending
                };
                job.error = Some("演出の待機・応答時間を超えました".into());
                changed = true;
            }
        }
        // Keep pending settlements, even during a long outage, and a bounded completed history.
        let mut completed = self.jobs.iter().filter(|job| job.finished()).count();
        if completed > 100 {
            self.jobs.retain(|job| {
                if completed > 100 && job.finished() {
                    completed -= 1;
                    changed = true;
                    false
                } else {
                    true
                }
            });
        }
        changed
    }

    fn claim(&mut self, user: Option<&str>, blocked: bool, now: i64) -> Option<PointsJob> {
        let eligible =
            |job: &PointsJob| job.preview || user.is_some_and(|user| job.belongs_to(user));
        if let Some(job) = self
            .jobs
            .iter()
            .find(|job| eligible(job) && job.status == JobStatus::Playing)
        {
            return Some(job.clone());
        }
        if blocked {
            return None;
        }
        let job = self
            .jobs
            .iter_mut()
            .find(|job| eligible(job) && job.status == JobStatus::Queued)?;
        job.status = JobStatus::Playing;
        job.started_at = Some(now);
        Some(job.clone())
    }

    fn finish(&mut self, id: &str, success: bool) -> bool {
        let Some(job) = self
            .jobs
            .iter_mut()
            .find(|job| job.id == id && job.status == JobStatus::Playing)
        else {
            return false;
        };
        job.status = match (job.preview, success) {
            (true, true) => JobStatus::Fulfilled,
            (true, false) => JobStatus::Canceled,
            (false, true) => JobStatus::FulfillPending,
            (false, false) => JobStatus::CancelPending,
        };
        job.error = (!success).then(|| "演出を中止したため返還待ちです".into());
        true
    }
}

pub struct PointsState {
    path: PathBuf,
    store: Mutex<Store>,
    operations: tokio::sync::Mutex<()>,
    sync_error: Mutex<Option<String>>,
}

impl PointsState {
    pub fn load(path: PathBuf) -> Result<Self, String> {
        let mut store: Store = if path.exists() {
            serde_json::from_slice(&fs::read(&path).map_err(|error| error.to_string())?)
                .map_err(|error| error.to_string())?
        } else {
            Store::default()
        };
        store.jobs.retain(|job| !job.preview);
        for job in &mut store.jobs {
            if matches!(job.status, JobStatus::Queued | JobStatus::Playing) {
                job.status = JobStatus::CancelPending;
                job.error = Some("アプリ再起動で中断したため返還待ちです".into());
            }
        }
        let state = Self {
            path,
            store: Mutex::new(store),
            operations: tokio::sync::Mutex::new(()),
            sync_error: Mutex::new(None),
        };
        state.save(&*state.store.lock().map_err(|error| error.to_string())?)?;
        Ok(state)
    }

    fn save(&self, store: &Store) -> Result<(), String> {
        use std::io::Write;
        let temporary = self.path.with_extension("json.tmp");
        let bytes = serde_json::to_vec_pretty(store).map_err(|error| error.to_string())?;
        (|| -> std::io::Result<()> {
            let mut file = fs::File::create(&temporary)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
            drop(file);
            fs::rename(&temporary, &self.path)
        })()
        .map_err(|error| format!("ポイント処理の記録を保存できません: {error}"))
    }

    // Publish changes only after durable storage succeeds. A failed acknowledgment remains retryable.
    fn change<T>(&self, update: impl FnOnce(&mut Store) -> (T, bool)) -> Result<T, String> {
        let mut stored = self.store.lock().map_err(|error| error.to_string())?;
        let mut next = stored.clone();
        let (result, changed) = update(&mut next);
        if changed {
            self.save(&next)?;
            *stored = next;
        }
        Ok(result)
    }

    pub fn receive(&self, message: &Value, user: &str) -> Result<(), String> {
        self.change(|store| {
            let changed = store.receive(
                &message["payload"]["event"],
                user,
                message["metadata"]["subscription_type"] == UPDATE_EVENT,
                Utc::now().timestamp_millis(),
            );
            ((), changed)
        })
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PointsSnapshot {
    authorized: bool,
    sync_error: Option<String>,
    rewards: Vec<PointsReward>,
    jobs: Vec<PointsJob>,
}

#[tauri::command]
pub fn get_channel_points(
    app: AppHandle,
    state: State<'_, PointsState>,
) -> Result<PointsSnapshot, String> {
    let credentials = app.state::<TwitchAuthState>().points_credentials().ok();
    let user = credentials.as_ref().map(|(_, user)| user.as_str());
    let store = state.store.lock().map_err(|error| error.to_string())?;
    Ok(PointsSnapshot {
        authorized: credentials.is_some(),
        sync_error: state
            .sync_error
            .lock()
            .map_err(|error| error.to_string())?
            .clone(),
        rewards: store
            .rewards
            .iter()
            .filter(|reward| {
                reward.client_id == TWITCH_CLIENT_ID && Some(reward.broadcaster_id.as_str()) == user
            })
            .cloned()
            .collect(),
        jobs: store
            .jobs
            .iter()
            .rev()
            .filter(|job| job.preview || user.is_some_and(|user| job.belongs_to(user)))
            .take(30)
            .cloned()
            .collect(),
    })
}

async fn request(
    token: &str,
    method: reqwest::Method,
    redemptions: bool,
    query: &[(&str, &str)],
    body: Option<Value>,
) -> Result<Value, String> {
    let url = if redemptions {
        format!("{API}/redemptions")
    } else {
        API.to_owned()
    };
    let mut request = reqwest::Client::new()
        .request(method, url)
        .timeout(Duration::from_secs(8))
        .bearer_auth(token)
        .header("Client-Id", TWITCH_CLIENT_ID)
        .query(query);
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request
        .send()
        .await
        .map_err(|_| "TwitchポイントAPIに接続できません".to_owned())?;
    if !response.status().is_success() {
        return Err(format!("TwitchポイントAPI: HTTP {}。認証・チャンネルポイント利用資格・報酬の状態を確認してください", response.status().as_u16()));
    }
    response
        .json()
        .await
        .map_err(|_| "TwitchポイントAPIの応答を読み取れません".into())
}

#[tauri::command]
pub async fn save_channel_point_reward(
    app: AppHandle,
    state: State<'_, PointsState>,
    effect: PointsEffect,
    cost: u32,
    cooldown_seconds: u32,
    enabled: bool,
) -> Result<(), String> {
    if !(1..=1_000_000).contains(&cost) || !(10..=86_400).contains(&cooldown_seconds) {
        return Err("コストは1～1,000,000、クールダウンは10～86,400秒で指定してください".into());
    }
    let _operation = state.operations.lock().await;
    let (token, user) = app.state::<TwitchAuthState>().points_credentials()?;
    let existing = state
        .store
        .lock()
        .map_err(|error| error.to_string())?
        .rewards
        .iter()
        .find(|reward| {
            reward.client_id == TWITCH_CLIENT_ID
                && reward.broadcaster_id == user
                && reward.effect == effect
        })
        .cloned();
    // Reconcile before creating: a timed-out POST may already have created the reward.
    let listed = request(
        &token,
        reqwest::Method::GET,
        false,
        &[
            ("broadcaster_id", &user),
            ("only_manageable_rewards", "true"),
        ],
        None,
    )
    .await?;
    let title = format!("Text Flow · {}", effect.title());
    let found = listed["data"]
        .as_array()
        .and_then(|rewards| {
            rewards.iter().find(|reward| {
                existing
                    .as_ref()
                    .is_some_and(|existing| reward["id"] == existing.id)
                    || reward["title"] == title
                    || (effect == PointsEffect::Hearts
                        && reward["title"] == "Text Flow · 次のコメントに光の軌跡")
                    || (effect == PointsEffect::Flower && reward["title"] == "Text Flow · 一輪の花")
            })
        })
        .and_then(|reward| reward["id"].as_str())
        .map(str::to_owned);
    let mut query = vec![("broadcaster_id", user.as_str())];
    if let Some(id) = &found {
        query.push(("id", id));
    }
    let body = json!({"title": title, "cost": cost, "is_enabled": enabled,
        "is_user_input_required": false, "is_global_cooldown_enabled": true, "global_cooldown_seconds": cooldown_seconds,
        "should_redemptions_skip_request_queue": false});
    let result = request(
        &token,
        if found.is_some() {
            reqwest::Method::PATCH
        } else {
            reqwest::Method::POST
        },
        false,
        &query,
        Some(body),
    )
    .await?;
    let id = result["data"][0]["id"]
        .as_str()
        .ok_or("報酬IDを確認できません。もう一度保存してください")?
        .to_owned();
    state.change(|store| {
        store.rewards.retain(|reward| {
            !(reward.client_id == TWITCH_CLIENT_ID
                && reward.broadcaster_id == user
                && reward.effect == effect)
        });
        store.rewards.push(PointsReward {
            client_id: TWITCH_CLIENT_ID.into(),
            broadcaster_id: user,
            id,
            effect,
            cost,
            cooldown_seconds,
            enabled,
        });
        ((), true)
    })
}

#[tauri::command]
pub fn preview_channel_point_effect(
    state: State<'_, PointsState>,
    effect: PointsEffect,
) -> Result<(), String> {
    let mut store = state.store.lock().map_err(|error| error.to_string())?;
    if store
        .jobs
        .iter()
        .filter(|job| job.preview && !job.finished())
        .count()
        >= 5
    {
        return Err("テスト演出は5件まで待機できます".into());
    }
    let now = Utc::now().timestamp_millis();
    store.jobs.push(PointsJob {
        id: format!("preview-{now}-{}", rand::random::<u64>()),
        reward_id: String::new(),
        client_id: TWITCH_CLIENT_ID.into(),
        broadcaster_id: String::new(),
        user_id: "preview-user".into(),
        effect,
        status: JobStatus::Queued,
        created_at: now,
        started_at: None,
        next_retry_at: 0,
        preview: true,
        error: None,
    });
    Ok(())
}

#[tauri::command]
pub fn claim_channel_point_effect(
    app: AppHandle,
    state: State<'_, PointsState>,
    blocked: bool,
) -> Result<Option<PointsJob>, String> {
    let credentials = app.state::<TwitchAuthState>().points_credentials().ok();
    let now = Utc::now().timestamp_millis();
    state.change(|store| {
        let changed = store.expire(now);
        let job = store.claim(
            credentials.as_ref().map(|(_, user)| user.as_str()),
            blocked,
            now,
        );
        let changed = changed || job.as_ref().is_some_and(|job| job.started_at == Some(now));
        (job, changed)
    })
}

#[tauri::command]
pub fn finish_channel_point_effect(
    state: State<'_, PointsState>,
    id: String,
    success: bool,
) -> Result<(), String> {
    state.change(|store| {
        let changed = store.finish(&id, success);
        ((), changed)
    })
}

async fn settle(token: &str, user: &str, job: &PointsJob) -> Result<JobStatus, String> {
    let status = if job.status == JobStatus::FulfillPending {
        "FULFILLED"
    } else {
        "CANCELED"
    };
    let query = [
        ("broadcaster_id", user),
        ("reward_id", job.reward_id.as_str()),
        ("id", job.id.as_str()),
    ];
    match request(
        token,
        reqwest::Method::PATCH,
        true,
        &query,
        Some(json!({"status": status})),
    )
    .await
    {
        Ok(_) => Ok(if status == "FULFILLED" {
            JobStatus::Fulfilled
        } else {
            JobStatus::Canceled
        }),
        Err(error) => {
            // A previous response may have been lost, or the streamer may have resolved it in Twitch.
            let actual = request(token, reqwest::Method::GET, true, &query, None)
                .await
                .ok();
            match actual
                .as_ref()
                .and_then(|value| value["data"][0]["status"].as_str())
            {
                Some("FULFILLED") => Ok(JobStatus::Fulfilled),
                Some("CANCELED") => Ok(JobStatus::Canceled),
                _ => Err(error),
            }
        }
    }
}

pub fn start_worker(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut last_reconcile = 0;
        let mut last_user = String::new();
        loop {
            tokio::time::sleep(Duration::from_secs(2)).await;
            let state = app.state::<PointsState>();
            let now = Utc::now().timestamp_millis();
            if let Err(error) = state.change(|store| {
                let changed = store.expire(now);
                ((), changed)
            }) {
                log::error!("{error}");
            }
            let Ok((token, user)) = app.state::<TwitchAuthState>().points_credentials() else {
                continue;
            };
            let pending = state
                .store
                .lock()
                .map(|store| {
                    store
                        .jobs
                        .iter()
                        .filter(|job| {
                            job.belongs_to(&user)
                                && !job.preview
                                && job.next_retry_at <= now
                                && matches!(
                                    job.status,
                                    JobStatus::FulfillPending | JobStatus::CancelPending
                                )
                        })
                        .take(8)
                        .cloned()
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            for job in pending {
                let result = settle(&token, &user, &job).await;
                if let Err(error) = state.change(|store| {
                    if let Some(current) = store
                        .jobs
                        .iter_mut()
                        .find(|current| current.id == job.id && current.status == job.status)
                    {
                        match result {
                            Ok(status) => {
                                current.status = status;
                                current.error = None;
                            }
                            Err(error) => {
                                current.error = Some(error);
                                current.next_retry_at = Utc::now().timestamp_millis() + 30_000;
                            }
                        }
                        return ((), true);
                    }
                    ((), false)
                }) {
                    log::error!("{error}");
                }
            }
            if last_user != user || now - last_reconcile >= 30_000 {
                last_user = user.clone();
                last_reconcile = now;
                let rewards = state
                    .store
                    .lock()
                    .map(|store| {
                        store
                            .rewards
                            .iter()
                            .filter(|reward| {
                                reward.client_id == TWITCH_CLIENT_ID
                                    && reward.broadcaster_id == user
                            })
                            .cloned()
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                let mut sync_error = None;
                for reward in rewards {
                    let response = request(
                        &token,
                        reqwest::Method::GET,
                        true,
                        &[
                            ("broadcaster_id", &user),
                            ("reward_id", &reward.id),
                            ("status", "UNFULFILLED"),
                            ("first", "50"),
                            ("sort", "OLDEST"),
                        ],
                        None,
                    )
                    .await;
                    if let Err(error) = &response {
                        sync_error = Some(error.clone());
                    }
                    if let Ok(response) = response {
                        if let Some(events) = response["data"].as_array() {
                            if let Err(error) = state.change(|store| {
                                let mut changed = false;
                                for event in events {
                                    let mut event = event.clone();
                                    event["broadcaster_user_id"] = event["broadcaster_id"].clone();
                                    event["status"] = json!("unfulfilled");
                                    changed |= store.receive(
                                        &event,
                                        &user,
                                        false,
                                        Utc::now().timestamp_millis(),
                                    );
                                }
                                ((), changed)
                            }) {
                                log::error!("{error}");
                                sync_error = Some(error);
                            }
                        }
                    }
                }
                if let Ok(mut error) = state.sync_error.lock() {
                    *error = sync_error;
                }
            }
        }
    });
}

#[cfg(test)]
#[path = "twitch_points_tests.rs"]
mod tests;
