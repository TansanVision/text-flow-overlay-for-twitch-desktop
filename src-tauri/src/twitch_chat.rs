use std::time::Duration;

use futures_util::StreamExt;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio_tungstenite::connect_async;

const EVENTSUB_URL: &str = "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";
const SUBSCRIPTIONS_URL: &str = "https://api.twitch.tv/helix/eventsub/subscriptions";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatMessage {
    id: String,
    user_name: String,
    text: String,
    color: String,
}

pub fn spawn(
    app: AppHandle,
    access_token: String,
    broadcaster_user_id: String,
    chatting_user_id: String,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(error) = connect_and_receive(
                &app,
                &access_token,
                &broadcaster_user_id,
                &chatting_user_id,
            )
            .await
            {
                log::warn!("Twitch chat connection ended: {error}");
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    })
}

async fn connect_and_receive(
    app: &AppHandle,
    access_token: &str,
    broadcaster_user_id: &str,
    chatting_user_id: &str,
) -> Result<(), String> {
    let (socket, _) = connect_async(EVENTSUB_URL)
        .await
        .map_err(|error| error.to_string())?;
    let (_, mut incoming) = socket.split();

    while let Some(frame) = incoming.next().await {
        let frame = frame.map_err(|error| error.to_string())?;
        if !frame.is_text() {
            continue;
        }
        let message: Value = serde_json::from_str(
            frame.to_text().map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
        match message["metadata"]["message_type"].as_str() {
            Some("session_welcome") => {
                let session_id = message["payload"]["session"]["id"]
                    .as_str()
                    .ok_or_else(|| "EventSub session ID was missing".to_owned())?;
                subscribe(
                    access_token,
                    broadcaster_user_id,
                    chatting_user_id,
                    session_id,
                )
                .await?;
            }
            Some("notification") => emit_chat_message(app, &message)?,
            Some("session_reconnect") => return Ok(()),
            Some("revocation") => return Err("Twitch chat subscription was revoked".into()),
            _ => {}
        }
    }
    Ok(())
}

async fn subscribe(
    access_token: &str,
    broadcaster_user_id: &str,
    chatting_user_id: &str,
    session_id: &str,
) -> Result<(), String> {
    let body = serde_json::json!({
        "type": "channel.chat.message",
        "version": "1",
        "condition": {
            "broadcaster_user_id": broadcaster_user_id,
            "user_id": chatting_user_id
        },
        "transport": { "method": "websocket", "session_id": session_id }
    });
    let response = reqwest::Client::new()
        .post(SUBSCRIPTIONS_URL)
        .bearer_auth(access_token)
        .header("Client-Id", "jj36zzmydbz142ux14kpbsw5w747ta")
        .json(&body)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if response.status().is_success() {
        Ok(())
    } else {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        Err(format!("EventSub subscription failed ({status}): {body}"))
    }
}

fn emit_chat_message(app: &AppHandle, message: &Value) -> Result<(), String> {
    let event = &message["payload"]["event"];
    let chat = ChatMessage {
        id: event["message_id"].as_str().unwrap_or_default().to_owned(),
        user_name: event["chatter_user_name"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
        text: event["message"]["text"].as_str().unwrap_or_default().to_owned(),
        color: event["color"].as_str().unwrap_or("#ffffff").to_owned(),
    };
    app.emit_to("overlay", "twitch-chat-message", chat)
        .map_err(|error| error.to_string())
}
