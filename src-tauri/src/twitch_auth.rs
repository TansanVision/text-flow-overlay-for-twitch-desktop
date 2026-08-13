use std::{fs, path::PathBuf, sync::Mutex};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::twitch_chat;

const DEVICE_URL: &str = "https://id.twitch.tv/oauth2/device";
const TOKEN_URL: &str = "https://id.twitch.tv/oauth2/token";
const VALIDATE_URL: &str = "https://id.twitch.tv/oauth2/validate";
const CHAT_SCOPES: &str = "user:read:chat";

pub struct TwitchAuthState {
    pending: Mutex<Option<PendingAuthorization>>,
    access_token: Mutex<Option<String>>,
    token_path: PathBuf,
    chat_task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

impl TwitchAuthState {
    pub fn new(token_path: PathBuf) -> Self {
        Self {
            pending: Mutex::new(None),
            access_token: Mutex::new(None),
            token_path,
            chat_task: Mutex::new(None),
        }
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
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredToken {
    client_id: String,
    access_token: String,
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
        user_id: String,
        scopes: Vec<String>,
    },
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum RestoreResult {
    Disconnected,
    Authorized {
        login: String,
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
    save_token(
        &state.token_path,
        &StoredToken {
            client_id: pending.client_id,
            access_token: token.access_token.clone(),
        },
    )?;
    start_chat(&app, &state, token.access_token, validated.user_id.clone())?;
    *state.pending.lock().map_err(|error| error.to_string())? = None;

    Ok(PollResult::Authorized {
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

    let stored: StoredToken = serde_json::from_slice(
        &fs::read(&state.token_path).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("保存したTwitch認証情報を読み込めませんでした: {error}"))?;

    match validate_token(&stored.access_token).await {
        Ok(validated) if validated.client_id == stored.client_id => {
            *state.access_token.lock().map_err(|error| error.to_string())? =
                Some(stored.access_token);
            start_chat(
                &app,
                &state,
                state
                    .access_token
                    .lock()
                    .map_err(|error| error.to_string())?
                    .clone()
                    .ok_or_else(|| "Twitchアクセストークンがありません".to_owned())?,
                validated.user_id.clone(),
            )?;
            Ok(RestoreResult::Authorized {
                login: validated.login,
                user_id: validated.user_id,
                scopes: validated.scopes,
            })
        }
        _ => {
            let _ = fs::remove_file(&state.token_path);
            Ok(RestoreResult::Disconnected)
        }
    }
}

#[tauri::command]
pub fn logout_twitch(state: tauri::State<'_, TwitchAuthState>) -> Result<(), String> {
    *state.access_token.lock().map_err(|error| error.to_string())? = None;
    *state.pending.lock().map_err(|error| error.to_string())? = None;
    if let Some(task) = state.chat_task.lock().map_err(|error| error.to_string())?.take() {
        task.abort();
    }
    if state.token_path.exists() {
        fs::remove_file(&state.token_path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn start_chat(
    app: &AppHandle,
    state: &TwitchAuthState,
    access_token: String,
    user_id: String,
) -> Result<(), String> {
    if let Some(task) = state.chat_task.lock().map_err(|error| error.to_string())?.take() {
        task.abort();
    }
    let task = twitch_chat::spawn(app.clone(), access_token, user_id.clone(), user_id);
    *state.chat_task.lock().map_err(|error| error.to_string())? = Some(task);
    Ok(())
}

fn save_token(path: &PathBuf, token: &StoredToken) -> Result<(), String> {
    let contents = serde_json::to_vec_pretty(token).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| format!("Twitch認証情報を保存できませんでした: {error}"))
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
