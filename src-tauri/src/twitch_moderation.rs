use chrono::{DateTime, SecondsFormat};
use serde::Serialize;
use serde_json::Value;

pub const SUBSCRIPTIONS: [&str; 3] = [
    "channel.chat.message_delete",
    "channel.chat.clear_user_messages",
    "channel.chat.clear",
];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSource {
    message_id: String,
    user_id: String,
    broadcaster_user_id: String,
    sent_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatModeration {
    broadcaster_user_id: String,
    sent_at: String,
    #[serde(flatten)]
    action: Action,
}

#[derive(Clone, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum Action {
    DeleteMessage { message_id: String },
    ClearUser { user_id: String },
    Clear,
}

fn required(value: &Value) -> Option<String> {
    value
        .as_str()
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

// Fixed-width UTC timestamps preserve Twitch's sub-millisecond ordering in the renderer.
fn timestamp(message: &Value) -> Option<String> {
    DateTime::parse_from_rfc3339(message["metadata"]["message_timestamp"].as_str()?)
        .ok()
        .map(|time| time.to_utc().to_rfc3339_opts(SecondsFormat::Nanos, true))
}

pub fn chat_source(message: &Value, broadcaster: &str) -> Option<ChatSource> {
    let event = &message["payload"]["event"];
    if event["broadcaster_user_id"].as_str()? != broadcaster {
        return None;
    }
    Some(ChatSource {
        message_id: required(&event["message_id"])?,
        user_id: required(&event["chatter_user_id"])?,
        broadcaster_user_id: required(&event["broadcaster_user_id"])?,
        sent_at: timestamp(message)?,
    })
}

pub fn parse(message: &Value, broadcaster: &str) -> Option<ChatModeration> {
    let event = &message["payload"]["event"];
    if event["broadcaster_user_id"].as_str()? != broadcaster {
        return None;
    }
    let action = match message["metadata"]["subscription_type"].as_str()? {
        "channel.chat.message_delete" => Action::DeleteMessage {
            message_id: required(&event["message_id"])?,
        },
        "channel.chat.clear_user_messages" => Action::ClearUser {
            user_id: required(&event["target_user_id"])?,
        },
        "channel.chat.clear" => Action::Clear,
        _ => return None,
    };
    Some(ChatModeration {
        broadcaster_user_id: required(&event["broadcaster_user_id"])?,
        sent_at: timestamp(message)?,
        action,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn notification(kind: &str) -> Value {
        json!({"metadata": {"subscription_type": kind, "message_timestamp": "2026-09-29T12:00:00.123456789+09:00"},
            "payload": {"event": {"broadcaster_user_id": "channel", "message_id": "message", "target_user_id": "target", "chatter_user_id": "author"}}})
    }

    #[test]
    fn maps_twitch_deletions_to_scoped_renderer_events() {
        for (kind, action) in [
            (
                SUBSCRIPTIONS[0],
                json!({"type": "deleteMessage", "messageId": "message"}),
            ),
            (
                SUBSCRIPTIONS[1],
                json!({"type": "clearUser", "userId": "target"}),
            ),
            (SUBSCRIPTIONS[2], json!({"type": "clear"})),
        ] {
            let parsed =
                serde_json::to_value(parse(&notification(kind), "channel").unwrap()).unwrap();
            assert_eq!(parsed["broadcasterUserId"], "channel");
            assert_eq!(parsed["sentAt"], "2026-09-29T03:00:00.123456789Z");
            for (key, value) in action.as_object().unwrap() {
                assert_eq!(&parsed[key], value);
            }
        }
    }

    #[test]
    fn rejects_unrelated_or_incomplete_moderation_events() {
        let mut message = notification(SUBSCRIPTIONS[0]);
        assert!(parse(&message, "other-channel").is_none());
        message["payload"]["event"]["message_id"] = json!("");
        assert!(parse(&message, "channel").is_none());
        message = notification(SUBSCRIPTIONS[1]);
        message["payload"]["event"]["target_user_id"] = Value::Null;
        assert!(parse(&message, "channel").is_none());
        message = notification(SUBSCRIPTIONS[2]);
        message["metadata"]["message_timestamp"] = json!("invalid");
        assert!(parse(&message, "channel").is_none());
        assert!(parse(&notification("channel.raid"), "channel").is_none());
    }

    #[test]
    fn chat_source_uses_stable_ids_and_normalizes_timestamp_precision() {
        let mut message = notification("channel.chat.message");
        message["metadata"]["message_timestamp"] = json!("2026-09-29T03:00:00Z");
        let source = serde_json::to_value(chat_source(&message, "channel").unwrap()).unwrap();
        assert_eq!(
            source,
            json!({"messageId":"message", "userId":"author", "broadcasterUserId":"channel", "sentAt":"2026-09-29T03:00:00.000000000Z"})
        );
        assert!(chat_source(&message, "other-channel").is_none());
    }
}
