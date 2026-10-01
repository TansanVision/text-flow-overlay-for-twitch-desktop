use super::*;
use serde_json::json;
use tokio::{net::TcpListener, sync::oneshot};
use tokio_tungstenite::{accept_async, accept_hdr_async};

fn welcome(id: &str, seconds: Option<u64>) -> Message {
    Message::Text(
        json!({
            "metadata": { "message_type": "session_welcome" },
            "payload": { "session": { "id": id, "keepalive_timeout_seconds": seconds } }
        })
        .to_string()
        .into(),
    )
}

fn notification(id: &str) -> Value {
    json!({ "metadata": { "message_type": "notification", "message_id": id } })
}

async fn server() -> (TcpListener, String) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("ws://{}", listener.local_addr().unwrap());
    (listener, url)
}

#[tokio::test]
async fn handoff_keeps_receiving_until_welcome_and_does_not_resubscribe() {
    let (listener, url) = server().await;
    let reconnect_url = format!("{url}/migration?ticket=a%2Fb&keep=exact");
    let (received_tx, received_rx) = oneshot::channel();
    let server_task = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let mut old = accept_async(stream).await.unwrap();
        old.send(welcome("old", Some(2))).await.unwrap();
        old.send(Message::Text(notification("first").to_string().into()))
            .await
            .unwrap();
        old.send(Message::Text(
            json!({
                "metadata": { "message_type": "session_reconnect" },
                "payload": { "session": { "reconnect_url": reconnect_url } }
            })
            .to_string()
            .into(),
        ))
        .await
        .unwrap();
        let (stream, _) = listener.accept().await.unwrap();
        let mut new = accept_hdr_async(
            stream,
            |request: &tokio_tungstenite::tungstenite::handshake::server::Request, response| {
                assert_eq!(
                    request.uri().to_string(),
                    "/migration?ticket=a%2Fb&keep=exact"
                );
                Ok(response)
            },
        )
        .await
        .unwrap();
        old.send(Message::Text(
            notification("during-handoff").to_string().into(),
        ))
        .await
        .unwrap();
        // The client must read the old socket while the new Welcome is delayed.
        timeout(Duration::from_secs(2), received_rx)
            .await
            .unwrap()
            .unwrap();
        new.send(welcome("new", None)).await.unwrap();
        assert!(matches!(
            timeout(Duration::from_secs(2), old.next())
                .await
                .unwrap()
                .unwrap()
                .unwrap(),
            Message::Close(_)
        ));
        new.send(Message::Text(notification("first").to_string().into()))
            .await
            .unwrap();
        new.send(Message::Text(
            notification("after-handoff").to_string().into(),
        ))
        .await
        .unwrap();
        new.close(None).await.unwrap();
    });
    let mut subscriptions = Vec::new();
    let mut messages = Vec::new();
    let mut statuses = Vec::new();
    let mut recent = RecentNotifications::default();
    let mut received_tx = Some(received_tx);
    let result = timeout(
        Duration::from_secs(5),
        run_session(
            &url,
            |id| {
                subscriptions.push(id);
                async { Ok(Vec::new()) }
            },
            |message| {
                let id = message["metadata"]["message_id"].as_str().unwrap();
                if id == "during-handoff" {
                    let _ = received_tx.take().unwrap().send(());
                }
                if recent.accept(&message) {
                    messages.push(id.to_owned());
                }
                Ok(())
            },
            |status| statuses.push(status),
        ),
    )
    .await
    .unwrap();
    server_task.await.unwrap();
    assert!(matches!(result, Err(ConnectionError::Retry(_))));
    assert_eq!(subscriptions, ["old"]);
    assert_eq!(messages, ["first", "during-handoff", "after-handoff"]);
    assert!(statuses.contains(&SessionStatus::Reconnecting));
    assert_eq!(statuses.last(), Some(&SessionStatus::Connected(Vec::new())));
}

#[tokio::test]
async fn handoff_finishes_even_if_old_socket_closes_early() {
    let (listener, url) = server().await;
    let target = format!("{url}/new");
    let task = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let mut old = accept_async(stream).await.unwrap();
        old.send(welcome("old", Some(2))).await.unwrap();
        old.send(Message::Text(json!({"metadata":{"message_type":"session_reconnect"},"payload":{"session":{"reconnect_url":target}}}).to_string().into())).await.unwrap();
        let (stream, _) = listener.accept().await.unwrap();
        let mut new = accept_async(stream).await.unwrap();
        old.close(None).await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;
        new.send(welcome("replacement", Some(2))).await.unwrap();
        new.send(Message::Text(notification("survived").to_string().into()))
            .await
            .unwrap();
        new.close(None).await.unwrap();
    });
    let mut received = false;
    let result = timeout(
        Duration::from_secs(5),
        run_session(
            &url,
            |_| async { Ok(Vec::new()) },
            |_| {
                received = true;
                Ok(())
            },
            |_| {},
        ),
    )
    .await
    .unwrap();
    task.await.unwrap();
    assert!(matches!(result, Err(ConnectionError::Retry(_))));
    assert!(received);
}

#[tokio::test]
async fn pongs_and_notifications_continue_while_subscription_request_is_pending() {
    let (listener, url) = server().await;
    let task = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let mut socket = accept_async(stream).await.unwrap();
        socket.send(welcome("pending", Some(2))).await.unwrap();
        socket
            .send(Message::Ping(vec![1, 2, 3].into()))
            .await
            .unwrap();
        assert_eq!(
            timeout(Duration::from_secs(1), socket.next())
                .await
                .unwrap()
                .unwrap()
                .unwrap(),
            Message::Pong(vec![1, 2, 3].into())
        );
        socket
            .send(Message::Text(notification("received").to_string().into()))
            .await
            .unwrap();
        socket.close(None).await.unwrap();
    });
    let mut received = false;
    let mut statuses = Vec::new();
    let _ = timeout(
        Duration::from_secs(5),
        run_session(
            &url,
            |_| std::future::pending::<Result<Vec<String>, ConnectionError>>(),
            |_| {
                received = true;
                Ok(())
            },
            |status| statuses.push(status),
        ),
    )
    .await
    .unwrap();
    task.await.unwrap();
    assert!(received);
    assert!(
        statuses.is_empty(),
        "must not report healthy before subscription succeeds"
    );
}

#[tokio::test]
async fn ping_traffic_does_not_hide_a_missing_keepalive() {
    let (listener, url) = server().await;
    let task = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let mut socket = accept_async(stream).await.unwrap();
        socket.send(welcome("silent", Some(1))).await.unwrap();
        loop {
            if socket.send(Message::Ping(vec![7].into())).await.is_err() {
                break;
            }
            if !matches!(socket.next().await, Some(Ok(Message::Pong(_)))) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    });
    let result = timeout(
        Duration::from_secs(3),
        run_session(&url, |_| async { Ok(Vec::new()) }, |_| Ok(()), |_| {}),
    )
    .await
    .unwrap();
    assert_eq!(
        result,
        Err(ConnectionError::Retry(
            "EventSub keepalive timed out".into()
        ))
    );
    task.abort();
}

#[tokio::test]
async fn regular_notifications_reset_the_keepalive_deadline() {
    let (listener, url) = server().await;
    let task = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let mut socket = accept_async(stream).await.unwrap();
        socket.send(welcome("active", Some(1))).await.unwrap();
        for id in ["one", "two", "three"] {
            tokio::time::sleep(Duration::from_millis(450)).await;
            socket
                .send(Message::Text(notification(id).to_string().into()))
                .await
                .unwrap();
        }
        socket.close(None).await.unwrap();
    });
    let mut count = 0;
    let _ = timeout(
        Duration::from_secs(4),
        run_session(
            &url,
            |_| async { Ok(Vec::new()) },
            |_| {
                count += 1;
                Ok(())
            },
            |_| {},
        ),
    )
    .await
    .unwrap();
    task.await.unwrap();
    assert_eq!(count, 3);
}

#[tokio::test]
async fn revocation_requires_reauthorization_but_optional_version_removal_preserves_chat() {
    for (kind, reason, expected) in [
        (
            "channel.chat.message",
            "authorization_revoked",
            ConnectionError::ReauthorizationRequired,
        ),
        (
            "channel.chat.message",
            "version_removed",
            ConnectionError::Unavailable,
        ),
        (
            "channel.cheer",
            "version_removed",
            ConnectionError::Retry("EventSub closed (1006)".into()),
        ),
    ] {
        let (listener, url) = server().await;
        let (ready_sender, ready_receiver) = tokio::sync::oneshot::channel();
        let mut ready_sender = Some(ready_sender);
        let task = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = accept_async(stream).await.unwrap();
            socket.send(welcome("revoked", Some(2))).await.unwrap();
            socket.send(Message::Text(json!({"metadata":{"message_type":"revocation"},"payload":{"subscription":{"type":kind,"status":reason}}}).to_string().into())).await.unwrap();
            let _ = socket
                .send(Message::Text(
                    notification("still-alive").to_string().into(),
                ))
                .await;
            if kind == "channel.cheer" {
                timeout(Duration::from_secs(3), ready_receiver)
                    .await
                    .unwrap()
                    .unwrap();
            }
            let _ = socket.close(None).await;
        });
        let mut received = false;
        let mut statuses = Vec::new();
        let result = timeout(
            Duration::from_secs(4),
            run_session(
                &url,
                |_| async { Ok(Vec::new()) },
                |_| {
                    received = true;
                    Ok(())
                },
                |status| {
                    if status == SessionStatus::Connected(vec![kind.to_owned()]) {
                        if let Some(sender) = ready_sender.take() {
                            let _ = sender.send(());
                        }
                    }
                    statuses.push(status);
                },
            ),
        )
        .await
        .unwrap();
        task.await.unwrap();
        assert_eq!(result, Err(expected));
        assert_eq!(received, kind == "channel.cheer");
        if received {
            assert!(statuses.contains(&SessionStatus::Connected(vec![kind.to_owned()])));
        }
    }
}

#[tokio::test]
async fn a_lost_connection_requires_new_subscriptions_and_retains_dedup_history() {
    let (listener, url) = server().await;
    let task = tokio::spawn(async move {
        for id in ["first-session", "second-session"] {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = accept_async(stream).await.unwrap();
            socket.send(welcome(id, Some(2))).await.unwrap();
            socket
                .send(Message::Text(notification("same-event").to_string().into()))
                .await
                .unwrap();
            socket.close(None).await.unwrap();
        }
    });
    let mut sessions = Vec::new();
    let mut recent = RecentNotifications::default();
    let mut count = 0;
    for _ in 0..2 {
        let _ = timeout(
            Duration::from_secs(4),
            run_session(
                &url,
                |id| {
                    sessions.push(id);
                    async { Ok(Vec::new()) }
                },
                |message| {
                    if recent.accept(&message) {
                        count += 1;
                    }
                    Ok(())
                },
                |_| {},
            ),
        )
        .await
        .unwrap();
    }
    task.await.unwrap();
    assert_eq!(sessions, ["first-session", "second-session"]);
    assert_eq!(count, 1);
}

#[test]
fn duplicate_history_expires_and_is_bounded() {
    let mut recent = RecentNotifications::default();
    let now = Instant::now();
    assert!(recent.accept_at(&notification("event"), now));
    assert!(!recent.accept_at(&notification("event"), now + Duration::from_secs(599)));
    assert!(recent.accept_at(&notification("event"), now + Duration::from_secs(600)));
    for id in 0..10_001 {
        assert!(recent.accept_at(
            &notification(&id.to_string()),
            now + Duration::from_secs(600)
        ));
    }
    assert_eq!(recent.ids.len(), 10_000);
    assert_eq!(recent.entries.len(), 10_000);
    assert!(!recent.accept(&json!({})));
}

#[test]
fn retry_delay_grows_and_caps_and_subscription_errors_are_classified() {
    for (attempt, base) in [
        (0, 1000),
        (1, 2000),
        (2, 4000),
        (5, 30000),
        (u32::MAX, 30000),
    ] {
        let delay = retry_delay(attempt).as_millis();
        assert!((base..base + 500).contains(&delay));
    }
    assert_eq!(
        subscription_error(reqwest::StatusCode::UNAUTHORIZED),
        ConnectionError::Unauthorized
    );
    assert_eq!(
        subscription_error(reqwest::StatusCode::FORBIDDEN),
        ConnectionError::ReauthorizationRequired
    );
    assert_eq!(
        subscription_error(reqwest::StatusCode::BAD_REQUEST),
        ConnectionError::Unavailable
    );
    assert!(matches!(
        subscription_error(reqwest::StatusCode::TOO_MANY_REQUESTS),
        ConnectionError::Retry(_)
    ));
}
