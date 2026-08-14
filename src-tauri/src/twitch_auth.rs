use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::twitch_chat;

const DEVICE_URL: &str = "https://id.twitch.tv/oauth2/device";
const TOKEN_URL: &str = "https://id.twitch.tv/oauth2/token";
const VALIDATE_URL: &str = "https://id.twitch.tv/oauth2/validate";
const USERS_URL: &str = "https://api.twitch.tv/helix/users";
const CHAT_SCOPES: &str =
    "user:read:chat moderator:manage:shoutouts bits:read channel:read:subscriptions";

pub struct TwitchAuthState {
    pending: Mutex<Option<PendingAuthorization>>,
    access_token: Arc<Mutex<Option<String>>>,
    user_id: Arc<Mutex<Option<String>>>,
    token_path: PathBuf,
    chat_task: Arc<Mutex<Option<tauri::async_runtime::JoinHandle<()>>>>,
    refresh_task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

impl TwitchAuthState {
    pub fn new(token_path: PathBuf) -> Self {
        Self {
            pending: Mutex::new(None),
            access_token: Arc::new(Mutex::new(None)),
            user_id: Arc::new(Mutex::new(None)),
            token_path,
            chat_task: Arc::new(Mutex::new(None)),
            refresh_task: Mutex::new(None),
        }
    }

    pub fn is_current_user_id(&self, candidate: &str) -> Result<bool, String> {
        self.user_id
            .lock()
            .map_err(|error| error.to_string())
            .map(|user_id| user_id.as_deref() == Some(candidate))
    }
}

#[derive(Clone)]
struct PendingAuthorization {
    client_id: String,
    device_code: String,
}

#[derive(Deserialize)]
struct DeviceResponse {
    device_code: String,
    expires_in: u64,
    interval: u64,
    user_code: String,
    verification_uri: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAuthorization {
    expires_in: u64,
    interval: u64,
    user_code: String,
    verification_uri: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredToken {
    client_id: String,
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
}

#[derive(Deserialize)]
struct OAuthError {
    message: Option<String>,
}

#[derive(Deserialize)]
struct ValidatedToken {
    client_id: String,
    login: String,
    user_id: String,
    scopes: Vec<String>,
    expires_in: u64,
}

#[derive(Deserialize)]
struct UsersResponse {
    data: Vec<TwitchUser>,
}

#[derive(Deserialize)]
struct TwitchUser {
    display_name: String,
    profile_image_url: String,
}

#[derive(Serialize)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PollResult {
    Pending,
    Authorized {
        login: String,
        display_name: String,
        profile_image_url: Option<String>,
        user_id: String,
        scopes: Vec<String>,
    },
}

#[derive(Serialize)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum RestoreResult {
    Disconnected,
    Authorized {
        login: String,
        display_name: String,
        profile_image_url: Option<String>,
        user_id: String,
        scopes: Vec<String>,
    },
}

#[tauri::command]
pub async fn start_twitch_device_authorization(
    client_id: String,
    state: tauri::State<'_, TwitchAuthState>,
) -> Result<DeviceAuthorization, String> {
    let client_id = client_id.trim().to_owned();
    if client_id.is_empty() {
        return Err("Client IDを入力してください。".into());
    }

    let response = reqwest::Client::new()
        .post(DEVICE_URL)
        .form(&[("client_id", client_id.as_str()), ("scopes", CHAT_SCOPES)])
        .send()
        .await
        .map_err(|error| format!("Twitchへの接続に失敗しました: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let error = response.json::<OAuthError>().await.ok();
        return Err(error
            .and_then(|value| value.message)
            .unwrap_or_else(|| format!("認証コードを取得できませんでした ({status})")));
    }

    let device = response
        .json::<DeviceResponse>()
        .await
        .map_err(|error| format!("Twitchの応答を読み取れませんでした: {error}"))?;

    *state.pending.lock().map_err(|error| error.to_string())? = Some(PendingAuthorization {
        client_id,
        device_code: device.device_code.clone(),
    });

    Ok(DeviceAuthorization {
        expires_in: device.expires_in,
        interval: device.interval,
        user_code: device.user_code,
        verification_uri: device.verification_uri,
    })
}

#[tauri::command]
pub async fn poll_twitch_device_authorization(
    app: AppHandle,
    state: tauri::State<'_, TwitchAuthState>,
) -> Result<PollResult, String> {
    let pending = state
        .pending
        .lock()
        .map_err(|error| error.to_string())?
        .clone()
        .ok_or_else(|| "認証待ちのセッションがありません。".to_owned())?;

    let response = reqwest::Client::new()
        .post(TOKEN_URL)
        .form(&[
            ("client_id", pending.client_id.as_str()),
            ("scopes", CHAT_SCOPES),
            ("device_code", pending.device_code.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|error| format!("Twitchへの接続に失敗しました: {error}"))?;

    if !response.status().is_success() {
        let error = response.json::<OAuthError>().await.ok();
        let message = error.and_then(|value| value.message).unwrap_or_default();
        if message == "authorization_pending" {
            return Ok(PollResult::Pending);
        }
        return Err(if message.is_empty() {
            "Twitch認証に失敗しました。".into()
        } else {
            message
        });
    }

    let token = response
        .json::<TokenResponse>()
        .await
        .map_err(|error| format!("アクセストークンを読み取れませんでした: {error}"))?;
    let validated = validate_token(&token.access_token).await?;

    if validated.client_id != pending.client_id {
        return Err("検証したトークンのClient IDが一致しません。".into());
    }

    *state
        .access_token
        .lock()
        .map_err(|error| error.to_string())? = Some(token.access_token.clone());
    *state.user_id.lock().map_err(|error| error.to_string())? = Some(validated.user_id.clone());
    save_token(
        &state.token_path,
        &StoredToken {
            client_id: pending.client_id.clone(),
            access_token: token.access_token.clone(),
            refresh_token: Some(token.refresh_token.clone()),
        },
    )?;
    start_chat(&app, &state, token.access_token, validated.user_id.clone())?;
    start_refresh_task(
        &app,
        &state,
        pending.client_id,
        token.refresh_token,
        token.expires_in,
    )?;
    *state.pending.lock().map_err(|error| error.to_string())? = None;

    let access_token = state
        .access_token
        .lock()
        .map_err(|error| error.to_string())?
        .clone()
        .ok_or_else(|| "Twitchアクセストークンがありません".to_owned())?;
    let profile = get_user_profile(&access_token, &validated.user_id).await;
    Ok(PollResult::Authorized {
        display_name: profile
            .as_ref()
            .map_or_else(|| validated.login.clone(), |user| user.display_name.clone()),
        profile_image_url: profile.map(|user| user.profile_image_url),
        login: validated.login,
        user_id: validated.user_id,
        scopes: validated.scopes,
    })
}

#[tauri::command]
pub async fn restore_twitch_authorization(
    app: AppHandle,
    state: tauri::State<'_, TwitchAuthState>,
) -> Result<RestoreResult, String> {
    if !state.token_path.exists() {
        return Ok(RestoreResult::Disconnected);
    }

    let stored: StoredToken =
        serde_json::from_slice(&fs::read(&state.token_path).map_err(|error| error.to_string())?)
            .map_err(|error| format!("保存したTwitch認証情報を読み込めませんでした: {error}"))?;

    let (access_token, refresh_token, validated, expires_in) =
        match validate_token(&stored.access_token).await {
            Ok(validated)
                if has_required_scopes(&validated) && validated.client_id == stored.client_id =>
            {
                (stored.access_token, stored.refresh_token, validated, None)
            }
            Ok(_) => {
                let _ = fs::remove_file(&state.token_path);
                return Ok(RestoreResult::Disconnected);
            }
            Err(_) => {
                let Some(refresh_token) = stored.refresh_token else {
                    let _ = fs::remove_file(&state.token_path);
                    return Ok(RestoreResult::Disconnected);
                };
                let token = match refresh_access_token(&stored.client_id, &refresh_token).await {
                    Ok(token) => token,
                    Err(error) => {
                        log::warn!("Twitch token refresh failed during restore: {error}");
                        return Ok(RestoreResult::Disconnected);
                    }
                };
                let validated = validate_token(&token.access_token).await?;
                if !has_required_scopes(&validated) || validated.client_id != stored.client_id {
                    let _ = fs::remove_file(&state.token_path);
                    return Ok(RestoreResult::Disconnected);
                }
                save_token(
                    &state.token_path,
                    &StoredToken {
                        client_id: stored.client_id.clone(),
                        access_token: token.access_token.clone(),
                        refresh_token: Some(token.refresh_token.clone()),
                    },
                )?;
                (
                    token.access_token,
                    Some(token.refresh_token),
                    validated,
                    Some(token.expires_in),
                )
            }
        };

    let profile = get_user_profile(&access_token, &validated.user_id).await;
    *state
        .access_token
        .lock()
        .map_err(|error| error.to_string())? = Some(access_token.clone());
    *state.user_id.lock().map_err(|error| error.to_string())? = Some(validated.user_id.clone());
    start_chat(&app, &state, access_token, validated.user_id.clone())?;
    if let Some(refresh_token) = refresh_token {
        start_refresh_task(
            &app,
            &state,
            stored.client_id,
            refresh_token,
            expires_in.unwrap_or(validated.expires_in),
        )?;
    }
    Ok(RestoreResult::Authorized {
        display_name: profile
            .as_ref()
            .map_or_else(|| validated.login.clone(), |user| user.display_name.clone()),
        profile_image_url: profile.map(|user| user.profile_image_url),
        login: validated.login,
        user_id: validated.user_id,
        scopes: validated.scopes,
    })
}

async fn get_user_profile(access_token: &str, user_id: &str) -> Option<TwitchUser> {
    reqwest::Client::new()
        .get(USERS_URL)
        .query(&[("id", user_id)])
        .bearer_auth(access_token)
        .header("Client-Id", "jj36zzmydbz142ux14kpbsw5w747ta")
        .send()
        .await
        .ok()?
        .json::<UsersResponse>()
        .await
        .ok()?
        .data
        .into_iter()
        .next()
}

#[tauri::command]
pub fn logout_twitch(state: tauri::State<'_, TwitchAuthState>) -> Result<(), String> {
    *state
        .access_token
        .lock()
        .map_err(|error| error.to_string())? = None;
    *state.user_id.lock().map_err(|error| error.to_string())? = None;
    *state.pending.lock().map_err(|error| error.to_string())? = None;
    if let Some(task) = state
        .chat_task
        .lock()
        .map_err(|error| error.to_string())?
        .take()
    {
        task.abort();
    }
    if let Some(task) = state
        .refresh_task
        .lock()
        .map_err(|error| error.to_string())?
        .take()
    {
        task.abort();
    }
    if state.token_path.exists() {
        fs::remove_file(&state.token_path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn send_twitch_shoutout(
    app: AppHandle,
    raider_user_id: String,
    state: tauri::State<'_, TwitchAuthState>,
) -> Result<(), String> {
    let result = async {
        let access_token = state
            .access_token
            .lock()
            .map_err(|error| error.to_string())?
            .clone()
            .ok_or_else(|| "Twitchに接続されていません".to_owned())?;
        let broadcaster_id = state
            .user_id
            .lock()
            .map_err(|error| error.to_string())?
            .clone()
            .ok_or_else(|| "TwitchユーザーIDがありません".to_owned())?;
        let response = reqwest::Client::new()
            .post("https://api.twitch.tv/helix/chat/shoutouts")
            .query(&[
                ("from_broadcaster_id", broadcaster_id.as_str()),
                ("to_broadcaster_id", raider_user_id.as_str()),
                ("moderator_id", broadcaster_id.as_str()),
            ])
            .bearer_auth(access_token)
            .header("Client-Id", "jj36zzmydbz142ux14kpbsw5w747ta")
            .send()
            .await
            .map_err(|error| format!("シャウトアウトに失敗しました: {error}"))?;
        if response.status().is_success() {
            Ok(())
        } else {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            Err(format!("シャウトアウトに失敗しました ({status}): {body}"))
        }
    }
    .await;
    let payload = match &result {
        Ok(()) => serde_json::json!({ "success": true }),
        Err(error) => serde_json::json!({ "success": false, "error": error }),
    };
    if let Err(error) = app.emit_to("control-panel", "shoutout-result", payload) {
        log::warn!("Failed to emit shoutout result: {error}");
    }
    result
}

fn start_chat(
    app: &AppHandle,
    state: &TwitchAuthState,
    access_token: String,
    user_id: String,
) -> Result<(), String> {
    if let Some(task) = state
        .chat_task
        .lock()
        .map_err(|error| error.to_string())?
        .take()
    {
        task.abort();
    }
    let task = twitch_chat::spawn(app.clone(), access_token, user_id.clone(), user_id);
    *state.chat_task.lock().map_err(|error| error.to_string())? = Some(task);
    Ok(())
}

fn start_refresh_task(
    app: &AppHandle,
    state: &TwitchAuthState,
    client_id: String,
    refresh_token: String,
    expires_in: u64,
) -> Result<(), String> {
    if let Some(task) = state
        .refresh_task
        .lock()
        .map_err(|error| error.to_string())?
        .take()
    {
        task.abort();
    }
    let app = app.clone();
    let token_path = state.token_path.clone();
    let access_token_state = Arc::clone(&state.access_token);
    let user_id_state = Arc::clone(&state.user_id);
    let chat_task = Arc::clone(&state.chat_task);
    let task = tauri::async_runtime::spawn(async move {
        maintain_tokens(
            app,
            client_id,
            refresh_token,
            expires_in,
            token_path,
            access_token_state,
            user_id_state,
            chat_task,
        )
        .await;
    });
    *state
        .refresh_task
        .lock()
        .map_err(|error| error.to_string())? = Some(task);
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn maintain_tokens(
    app: AppHandle,
    client_id: String,
    mut refresh_token: String,
    mut expires_in: u64,
    token_path: PathBuf,
    access_token_state: Arc<Mutex<Option<String>>>,
    user_id_state: Arc<Mutex<Option<String>>>,
    chat_task: Arc<Mutex<Option<tauri::async_runtime::JoinHandle<()>>>>,
) {
    loop {
        let wait_seconds = expires_in.saturating_sub(300).clamp(60, 3600);
        tokio::time::sleep(Duration::from_secs(wait_seconds)).await;
        let current_access_token = match access_token_state.lock() {
            Ok(value) => value.clone(),
            Err(error) => {
                log::warn!("Twitch token state lock failed: {error}");
                return;
            }
        };
        if let Some(token) = current_access_token {
            if let Ok(validated) = validate_token(&token).await {
                expires_in = validated.expires_in;
                if expires_in > 600 {
                    continue;
                }
            }
        }

        let refreshed = loop {
            match refresh_access_token(&client_id, &refresh_token).await {
                Ok(token) => break token,
                Err(error) => {
                    log::warn!("Twitch token refresh failed; retrying in 60 seconds: {error}");
                    tokio::time::sleep(Duration::from_secs(60)).await;
                }
            }
        };
        let validated = match validate_token(&refreshed.access_token).await {
            Ok(validated) if has_required_scopes(&validated) => validated,
            Ok(_) => {
                log::warn!("Refreshed Twitch token is missing required scopes");
                return;
            }
            Err(error) => {
                log::warn!("Refreshed Twitch token validation failed: {error}");
                return;
            }
        };
        refresh_token = refreshed.refresh_token;
        expires_in = refreshed.expires_in;
        if let Err(error) = save_token(
            &token_path,
            &StoredToken {
                client_id: client_id.clone(),
                access_token: refreshed.access_token.clone(),
                refresh_token: Some(refresh_token.clone()),
            },
        ) {
            log::warn!("Refreshed Twitch token could not be saved: {error}");
            continue;
        }
        if let Ok(mut value) = access_token_state.lock() {
            *value = Some(refreshed.access_token.clone());
        }
        if let Ok(mut value) = user_id_state.lock() {
            *value = Some(validated.user_id.clone());
        }
        restart_chat_task(&app, &chat_task, refreshed.access_token, validated.user_id);
    }
}

fn restart_chat_task(
    app: &AppHandle,
    chat_task: &Arc<Mutex<Option<tauri::async_runtime::JoinHandle<()>>>>,
    access_token: String,
    user_id: String,
) {
    let Ok(mut current_task) = chat_task.lock() else {
        return;
    };
    if let Some(task) = current_task.take() {
        task.abort();
    }
    *current_task = Some(twitch_chat::spawn(
        app.clone(),
        access_token,
        user_id.clone(),
        user_id,
    ));
}

async fn refresh_access_token(
    client_id: &str,
    refresh_token: &str,
) -> Result<TokenResponse, String> {
    let response = reqwest::Client::new()
        .post(TOKEN_URL)
        .form(&[
            ("client_id", client_id),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ])
        .send()
        .await
        .map_err(|error| format!("Twitchトークンの更新に失敗しました: {error}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let error = response.json::<OAuthError>().await.ok();
        return Err(error
            .and_then(|value| value.message)
            .unwrap_or_else(|| format!("Twitchトークンを更新できませんでした ({status})")));
    }
    response
        .json::<TokenResponse>()
        .await
        .map_err(|error| format!("更新したTwitchトークンを読み取れませんでした: {error}"))
}

fn has_required_scopes(validated: &ValidatedToken) -> bool {
    CHAT_SCOPES
        .split_whitespace()
        .all(|scope| validated.scopes.iter().any(|value| value == scope))
}

fn save_token(path: &PathBuf, token: &StoredToken) -> Result<(), String> {
    let contents = serde_json::to_vec_pretty(token).map_err(|error| error.to_string())?;
    fs::write(path, contents)
        .map_err(|error| format!("Twitch認証情報を保存できませんでした: {error}"))
}

async fn validate_token(access_token: &str) -> Result<ValidatedToken, String> {
    let response = reqwest::Client::new()
        .get(VALIDATE_URL)
        .header("Authorization", format!("OAuth {access_token}"))
        .send()
        .await
        .map_err(|error| format!("トークン検証に失敗しました: {error}"))?;

    if !response.status().is_success() {
        return Err("Twitchアクセストークンが無効です。".into());
    }

    response
        .json::<ValidatedToken>()
        .await
        .map_err(|error| format!("トークン検証結果を読み取れませんでした: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_legacy_stored_token_without_refresh_token() {
        let stored: StoredToken =
            serde_json::from_str(r#"{"clientId":"client","accessToken":"access"}"#)
                .expect("legacy token should deserialize");
        assert_eq!(stored.client_id, "client");
        assert_eq!(stored.access_token, "access");
        assert!(stored.refresh_token.is_none());
    }

    #[test]
    fn checks_every_required_scope() {
        let validated = ValidatedToken {
            client_id: "client".into(),
            login: "login".into(),
            user_id: "user".into(),
            scopes: CHAT_SCOPES.split_whitespace().map(str::to_owned).collect(),
            expires_in: 3600,
        };
        assert!(has_required_scopes(&validated));
    }
}
