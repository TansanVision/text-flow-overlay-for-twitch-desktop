use std::time::Duration;

use futures_util::StreamExt;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tokio_tungstenite::connect_async;

const EVENTSUB_URL: &str = "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";
const SUBSCRIPTIONS_URL: &str = "https://api.twitch.tv/helix/eventsub/subscriptions";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatMessage {
    id: String,
    fragments: Vec<ChatFragment>,
    author_name: Option<String>,
    interaction_type: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RaidMessage {
    id: String,
    display_name: String,
    login: String,
    broadcaster_user_id: String,
    viewer_count: u64,
    profile_image_url: Option<String>,
    clips: Vec<RaidClip>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RaidClip {
    id: String,
    title: String,
    embed_url: String,
    duration: f64,
    view_count: u64,
}

#[derive(Clone, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum ChatFragment {
    Text {
        key: String,
        text: String,
    },
    Emote {
        key: String,
        text: String,
        url: String,
    },
}

pub fn spawn(
    app: AppHandle,
    access_token: String,
    broadcaster_user_id: String,
    chatting_user_id: String,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(error) =
                connect_and_receive(&app, &access_token, &broadcaster_user_id, &chatting_user_id)
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
        let message: Value =
            serde_json::from_str(frame.to_text().map_err(|error| error.to_string())?)
                .map_err(|error| error.to_string())?;
        match message["metadata"]["message_type"].as_str() {
            Some("session_welcome") => {
                let session_id = message["payload"]["session"]["id"]
                    .as_str()
                    .ok_or_else(|| "EventSub session ID was missing".to_owned())?;
                subscribe_chat(
                    access_token,
                    broadcaster_user_id,
                    chatting_user_id,
                    session_id,
                )
                .await?;
                subscribe_raid(access_token, broadcaster_user_id, session_id).await?;
                subscribe_support_events(access_token, broadcaster_user_id, session_id).await?;
            }
            Some("notification") => match message["metadata"]["subscription_type"].as_str() {
                Some("channel.chat.message") => emit_chat_message(app, &message)?,
                Some("channel.raid") => {
                    let event = &message["payload"]["event"];
                    if event["from_broadcaster_user_id"].as_str() == Some(broadcaster_user_id) {
                        save_audience_on_outgoing_raid(app)?;
                    } else {
                        emit_raid(app, access_token, &message).await?;
                    }
                }
                Some("channel.cheer") => emit_support_message(app, &message, "cheer")?,
                Some("channel.subscribe" | "channel.subscription.message") => {
                    emit_support_message(app, &message, "subscribe")?
                }
                Some("channel.subscription.gift") => emit_support_message(app, &message, "gift")?,
                _ => {}
            },
            Some("session_reconnect") => return Ok(()),
            Some("revocation") => return Err("Twitch chat subscription was revoked".into()),
            _ => {}
        }
    }
    Ok(())
}

async fn subscribe_support_events(
    access_token: &str,
    broadcaster_user_id: &str,
    session_id: &str,
) -> Result<(), String> {
    for event_type in [
        "channel.cheer",
        "channel.subscribe",
        "channel.subscription.message",
        "channel.subscription.gift",
    ] {
        let body = serde_json::json!({
            "type": event_type,
            "version": "1",
            "condition": { "broadcaster_user_id": broadcaster_user_id },
            "transport": { "method": "websocket", "session_id": session_id }
        });
        create_subscription(access_token, &body).await?;
    }
    Ok(())
}

async fn subscribe_chat(
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
    create_subscription(access_token, &body).await?;
    let outgoing_body = serde_json::json!({
        "type": "channel.raid",
        "version": "1",
        "condition": { "from_broadcaster_user_id": broadcaster_user_id },
        "transport": { "method": "websocket", "session_id": session_id }
    });
    create_subscription(access_token, &outgoing_body).await
}

fn save_audience_on_outgoing_raid(app: &AppHandle) -> Result<(), String> {
    let status = crate::audience::save(&app.state::<crate::audience::AudienceState>())?;
    app.emit_to("control-panel", "audience-auto-saved", status)
        .map_err(|error| error.to_string())
}

async fn subscribe_raid(
    access_token: &str,
    broadcaster_user_id: &str,
    session_id: &str,
) -> Result<(), String> {
    let body = serde_json::json!({
        "type": "channel.raid",
        "version": "1",
        "condition": { "to_broadcaster_user_id": broadcaster_user_id },
        "transport": { "method": "websocket", "session_id": session_id }
    });
    create_subscription(access_token, &body).await
}

async fn create_subscription(access_token: &str, body: &Value) -> Result<(), String> {
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

async fn emit_raid(app: &AppHandle, access_token: &str, message: &Value) -> Result<(), String> {
    let event = &message["payload"]["event"];
    let user_id = event["from_broadcaster_user_id"]
        .as_str()
        .unwrap_or_default();
    let profile_image_url = get_profile_image(access_token, user_id).await;
    let clips = get_clips(access_token, user_id).await;
    let raid = RaidMessage {
        id: message["metadata"]["message_id"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
        display_name: event["from_broadcaster_user_name"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
        login: event["from_broadcaster_user_login"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
        broadcaster_user_id: user_id.to_owned(),
        viewer_count: event["viewers"].as_u64().unwrap_or_default(),
        profile_image_url,
        clips,
    };
    app.emit_to("overlay", "twitch-raid", raid)
        .map_err(|error| error.to_string())
}

async fn get_clips(access_token: &str, user_id: &str) -> Vec<RaidClip> {
    let response = match reqwest::Client::new()
        .get("https://api.twitch.tv/helix/clips")
        .query(&[("broadcaster_id", user_id), ("first", "5")])
        .bearer_auth(access_token)
        .header("Client-Id", "jj36zzmydbz142ux14kpbsw5w747ta")
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => response,
        Ok(response) => {
            log::warn!("Twitch clips request failed: {}", response.status());
            return Vec::new();
        }
        Err(error) => {
            log::warn!("Twitch clips request failed: {error}");
            return Vec::new();
        }
    };
    let value = match response.json::<Value>().await {
        Ok(value) => value,
        Err(error) => {
            log::warn!("Twitch clips response could not be decoded: {error}");
            return Vec::new();
        }
    };
    value["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|clip| {
            Some(RaidClip {
                id: clip["id"].as_str()?.to_owned(),
                title: clip["title"].as_str().unwrap_or("Twitch Clip").to_owned(),
                embed_url: clip["embed_url"].as_str()?.to_owned(),
                duration: clip["duration"].as_f64().unwrap_or(30.0),
                view_count: clip["view_count"].as_u64().unwrap_or_default(),
            })
        })
        .collect()
}

async fn get_profile_image(access_token: &str, user_id: &str) -> Option<String> {
    let response = reqwest::Client::new()
        .get("https://api.twitch.tv/helix/users")
        .query(&[("id", user_id)])
        .bearer_auth(access_token)
        .header("Client-Id", "jj36zzmydbz142ux14kpbsw5w747ta")
        .send()
        .await
        .ok()?;
    let value = response.json::<Value>().await.ok()?;
    value["data"].as_array()?.first()?["profile_image_url"]
        .as_str()
        .map(str::to_owned)
}

fn emit_chat_message(app: &AppHandle, message: &Value) -> Result<(), String> {
    let event = &message["payload"]["event"];
    let fragments = event["message"]["fragments"]
        .as_array()
        .map(|fragments| {
            fragments
                .iter()
                .enumerate()
                .map(|(index, fragment)| convert_fragment(fragment, index))
                .collect()
        })
        .unwrap_or_else(|| {
            vec![ChatFragment::Text {
                key: "0".to_owned(),
                text: event["message"]["text"]
                    .as_str()
                    .unwrap_or_default()
                    .to_owned(),
            }]
        });
    let chat = ChatMessage {
        id: event["message_id"].as_str().unwrap_or_default().to_owned(),
        fragments,
        author_name: event["chatter_user_name"].as_str().map(str::to_owned),
        interaction_type: "comment".to_owned(),
    };
    app.emit_to("overlay", "twitch-chat-message", chat)
        .map_err(|error| error.to_string())
}

fn emit_support_message(app: &AppHandle, message: &Value, kind: &str) -> Result<(), String> {
    let event = &message["payload"]["event"];
    let name = event["user_name"]
        .as_str()
        .or_else(|| event["user_login"].as_str())
        .unwrap_or("匿名ユーザー");
    let text = match kind {
        "cheer" => format!(
            "{name}さんから{} Bits！",
            event["bits"].as_u64().unwrap_or_default()
        ),
        "gift" => format!(
            "{name}さんからサブスクギフト {}件！",
            event["total"].as_u64().unwrap_or(1)
        ),
        _ if event["message"]["text"].as_str().is_some() => format!(
            "{name}さんが{}か月サブスク！ {}",
            event["cumulative_months"].as_u64().unwrap_or(1),
            event["message"]["text"].as_str().unwrap_or_default()
        ),
        _ => format!("{name}さんがサブスクしました！"),
    };
    let chat = ChatMessage {
        id: message["metadata"]["message_id"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
        fragments: vec![ChatFragment::Text {
            key: "0".to_owned(),
            text,
        }],
        author_name: Some(name.to_owned()),
        interaction_type: kind.to_owned(),
    };
    app.emit_to("overlay", "twitch-chat-message", chat)
        .map_err(|error| error.to_string())
}

fn convert_fragment(fragment: &Value, index: usize) -> ChatFragment {
    let key = index.to_string();
    let text = fragment["text"].as_str().unwrap_or_default().to_owned();
    if fragment["type"].as_str() == Some("emote") {
        if let Some(id) = fragment["emote"]["id"].as_str() {
            let animated = fragment["emote"]["format"]
                .as_array()
                .is_some_and(|formats| formats.iter().any(|format| format == "animated"));
            let format = if animated { "animated" } else { "static" };
            return ChatFragment::Emote {
                key,
                text,
                url: format!("https://static-cdn.jtvnw.net/emoticons/v2/{id}/{format}/dark/3.0"),
            };
        }
    }
    ChatFragment::Text { key, text }
}
