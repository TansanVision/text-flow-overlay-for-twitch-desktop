//! EventSub transport. Network reads keep running while subscriptions and handoffs are pending.
use std::{
    collections::{HashSet, VecDeque},
    future::Future,
    pin::Pin,
    time::Duration,
};

use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::{
    net::TcpStream,
    time::{timeout, timeout_at, Instant},
};
use tokio_tungstenite::{connect_async, tungstenite::Message, MaybeTlsStream, WebSocketStream};

pub const ENDPOINT: &str = "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;
type Handoff = Pin<Box<dyn Future<Output = Result<ReadySocket, ConnectionError>> + Send>>;

#[cfg(test)]
#[path = "twitch_eventsub_tests.rs"]
mod tests;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ConnectionError {
    Retry(String),
    Unauthorized,
    ReauthorizationRequired,
    Unavailable,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SessionStatus {
    Connected(Vec<String>),
    Reconnecting,
}

struct ReadySocket {
    socket: Socket,
    session_id: String,
    keepalive: Option<Duration>,
}

/// Bounded, time-limited history survives reconnects and token replacement.
#[derive(Default)]
pub struct RecentNotifications {
    ids: HashSet<String>,
    entries: VecDeque<(String, Instant)>,
}

impl RecentNotifications {
    pub fn accept(&mut self, message: &Value) -> bool {
        self.accept_at(message, Instant::now())
    }

    fn accept_at(&mut self, message: &Value, now: Instant) -> bool {
        while self
            .entries
            .front()
            .is_some_and(|(_, time)| now.duration_since(*time) >= Duration::from_secs(600))
        {
            if let Some((id, _)) = self.entries.pop_front() {
                self.ids.remove(&id);
            }
        }
        let Some(id) = message["metadata"]["message_id"]
            .as_str()
            .filter(|id| !id.is_empty())
        else {
            return false;
        };
        if !self.ids.insert(id.to_owned()) {
            return false;
        }
        self.entries.push_back((id.to_owned(), now));
        if self.entries.len() > 10_000 {
            if let Some((id, _)) = self.entries.pop_front() {
                self.ids.remove(&id);
            }
        }
        true
    }
}

pub fn retry_delay(attempt: u32) -> Duration {
    // Small jitter prevents clients from reconnecting in lockstep after an outage.
    Duration::from_millis((1_000u64 << attempt.min(5)).min(30_000) + rand::random::<u64>() % 500)
}

pub fn subscription_error(status: reqwest::StatusCode) -> ConnectionError {
    match status.as_u16() {
        401 => ConnectionError::Unauthorized,
        403 => ConnectionError::ReauthorizationRequired,
        400 | 404 => ConnectionError::Unavailable,
        _ => ConnectionError::Retry(format!("EventSub subscription HTTP {status}")),
    }
}

async fn read_message(socket: &mut Socket, deadline: Instant) -> Result<Value, ConnectionError> {
    loop {
        let frame = timeout_at(deadline, socket.next())
            .await
            .map_err(|_| ConnectionError::Retry("EventSub keepalive timed out".into()))?
            .ok_or_else(|| ConnectionError::Retry("EventSub stream ended".into()))?
            .map_err(|_| ConnectionError::Retry("EventSub socket read failed".into()))?;
        match frame {
            Message::Text(text) => {
                return serde_json::from_str(&text)
                    .map_err(|_| ConnectionError::Retry("Invalid EventSub message".into()))
            }
            Message::Ping(payload) => {
                // Pong is the only application frame permitted by EventSub. It does not reset keepalive.
                timeout_at(deadline, socket.send(Message::Pong(payload)))
                    .await
                    .map_err(|_| ConnectionError::Retry("EventSub pong timed out".into()))?
                    .map_err(|_| ConnectionError::Retry("EventSub pong failed".into()))?;
            }
            Message::Close(frame) => {
                return Err(ConnectionError::Retry(format!(
                    "EventSub closed ({})",
                    frame.map_or(1006, |frame| u16::from(frame.code))
                )))
            }
            _ => {}
        }
    }
}

async fn connect_welcome(url: &str) -> Result<ReadySocket, ConnectionError> {
    timeout(CONNECT_TIMEOUT, async {
        // Do not log errors containing the reconnect URL or credentials.
        let (mut socket, _) = connect_async(url)
            .await
            .map_err(|_| ConnectionError::Retry("EventSub connection failed".into()))?;
        let welcome = read_message(&mut socket, Instant::now() + CONNECT_TIMEOUT).await?;
        if welcome["metadata"]["message_type"] != "session_welcome" {
            return Err(ConnectionError::Retry(
                "EventSub welcome was missing".into(),
            ));
        }
        let session = &welcome["payload"]["session"];
        let session_id = session["id"]
            .as_str()
            .filter(|id| !id.is_empty())
            .ok_or_else(|| ConnectionError::Retry("EventSub session ID was missing".into()))?
            .to_owned();
        let keepalive = session["keepalive_timeout_seconds"]
            .as_u64()
            .filter(|seconds| *seconds > 0)
            .map(Duration::from_secs);
        Ok(ReadySocket {
            socket,
            session_id,
            keepalive,
        })
    })
    .await
    .map_err(|_| ConnectionError::Retry("EventSub welcome timed out".into()))?
}

/// Connect and subscribe once. A server-directed handoff inherits the subscriptions.
/// Callbacks must be quick; slow API lookups belong in a separate worker.
pub async fn run_session<S, F, N, U>(
    endpoint: &str,
    subscribe: S,
    mut notify: N,
    mut update: U,
) -> Result<(), ConnectionError>
where
    S: FnOnce(String) -> F,
    F: Future<Output = Result<Vec<String>, ConnectionError>>,
    N: FnMut(Value) -> Result<(), ConnectionError>,
    U: FnMut(SessionStatus),
{
    let ready = connect_welcome(endpoint).await?;
    let mut keepalive = ready
        .keepalive
        .ok_or_else(|| ConnectionError::Retry("EventSub keepalive interval was missing".into()))?;
    let mut socket = ready.socket;
    let mut deadline = Instant::now() + keepalive;
    let mut subscribing = Some(Box::pin(subscribe(ready.session_id)));
    let mut handoff: Option<Handoff> = None;
    let mut unavailable = Vec::new();
    let mut subscribed = false;
    let mut readable = true;
    loop {
        tokio::select! {
            result = async { subscribing.as_mut().unwrap().await }, if subscribing.is_some() => {
                unavailable.extend(result?);
                unavailable.sort();
                unavailable.dedup();
                subscribing = None;
                subscribed = true;
                if handoff.is_none() { update(SessionStatus::Connected(unavailable.clone())); }
            }
            result = async { handoff.as_mut().unwrap().await }, if handoff.is_some() => {
                let next = result?;
                handoff = None;
                readable = true;
                keepalive = next.keepalive.unwrap_or(keepalive);
                let mut old = std::mem::replace(&mut socket, next.socket);
                deadline = Instant::now() + keepalive;
                // Close the old socket only after the replacement's Welcome.
                let _ = timeout(Duration::from_secs(1), old.close(None)).await;
                if subscribed { update(SessionStatus::Connected(unavailable.clone())); }
            }
            result = read_message(&mut socket, deadline), if readable => {
                let message = match result {
                    Ok(message) => message,
                    Err(_) if handoff.is_some() => { readable = false; continue; }
                    Err(error) => return Err(error),
                };
                match message["metadata"]["message_type"].as_str() {
                    Some("session_keepalive") => deadline = Instant::now() + keepalive,
                    Some("notification") => {
                        deadline = Instant::now() + keepalive;
                        notify(message)?;
                    }
                    Some("session_reconnect") if handoff.is_none() => {
                        let url = message["payload"]["session"]["reconnect_url"].as_str()
                            .ok_or_else(|| ConnectionError::Retry("EventSub reconnect URL was missing".into()))?;
                        let target = reqwest::Url::parse(url).map_err(|_| ConnectionError::Retry("Invalid EventSub reconnect URL".into()))?;
                        let origin = reqwest::Url::parse(endpoint).map_err(|_| ConnectionError::Unavailable)?;
                        if target.scheme() != origin.scheme() || target.host_str() != origin.host_str()
                            || !target.username().is_empty() || target.password().is_some() {
                            return Err(ConnectionError::Retry("Unexpected EventSub reconnect endpoint".into()));
                        }
                        let url = url.to_owned();
                        update(SessionStatus::Reconnecting);
                        handoff = Some(Box::pin(async move { connect_welcome(&url).await }));
                    }
                    Some("revocation") => {
                        let subscription = &message["payload"]["subscription"];
                        match subscription["status"].as_str() {
                            Some("authorization_revoked" | "user_removed") => return Err(ConnectionError::ReauthorizationRequired),
                            _ if subscription["type"] == "channel.chat.message" => return Err(ConnectionError::Unavailable),
                            _ => {
                                if let Some(kind) = subscription["type"].as_str() {
                                    unavailable.push(kind.to_owned());
                                    unavailable.sort();
                                    unavailable.dedup();
                                    if subscribed && handoff.is_none() { update(SessionStatus::Connected(unavailable.clone())); }
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}
