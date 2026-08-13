use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

const BTTV_GLOBAL_URL: &str = "https://api.betterttv.net/3/cached/emotes/global";
const SEVEN_TV_GLOBAL_URL: &str = "https://7tv.io/v3/emote-sets/global";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalEmoteResult {
    emotes: Vec<ExternalEmote>,
    providers: Vec<ProviderStatus>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalEmote {
    name: String,
    url: String,
    provider: &'static str,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderStatus {
    provider: &'static str,
    count: usize,
    error: Option<String>,
}

#[derive(Deserialize)]
struct BttvEmote {
    id: String,
    code: String,
}

#[tauri::command]
pub async fn get_external_emotes(app: AppHandle) -> ExternalEmoteResult {
    let client = reqwest::Client::new();
    let (bttv, seven_tv) = tokio::join!(load_bttv(&client), load_seven_tv(&client));
    let mut emotes = Vec::new();
    let mut providers = Vec::new();
    add_provider(&mut emotes, &mut providers, "BetterTTV", bttv);
    add_provider(&mut emotes, &mut providers, "7TV", seven_tv);
    let result = ExternalEmoteResult { emotes, providers };
    let _ = app.emit_to("overlay", "external-emotes-updated", result.clone());
    result
}

fn add_provider(
    all_emotes: &mut Vec<ExternalEmote>,
    statuses: &mut Vec<ProviderStatus>,
    provider: &'static str,
    result: Result<Vec<ExternalEmote>, String>,
) {
    match result {
        Ok(emotes) => {
            statuses.push(ProviderStatus {
                provider,
                count: emotes.len(),
                error: None,
            });
            all_emotes.extend(emotes);
        }
        Err(error) => statuses.push(ProviderStatus {
            provider,
            count: 0,
            error: Some(error),
        }),
    }
}

async fn load_bttv(client: &reqwest::Client) -> Result<Vec<ExternalEmote>, String> {
    let response = client
        .get(BTTV_GLOBAL_URL)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    response
        .json::<Vec<BttvEmote>>()
        .await
        .map_err(|error| error.to_string())
        .map(|emotes| {
            emotes
                .into_iter()
                .map(|emote| ExternalEmote {
                    name: emote.code,
                    url: format!("https://cdn.betterttv.net/emote/{}/3x", emote.id),
                    provider: "BetterTTV",
                })
                .collect()
        })
}

async fn load_seven_tv(client: &reqwest::Client) -> Result<Vec<ExternalEmote>, String> {
    let response = client
        .get(SEVEN_TV_GLOBAL_URL)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let value = response
        .json::<Value>()
        .await
        .map_err(|error| error.to_string())?;
    let emotes = value["emotes"]
        .as_array()
        .or_else(|| value["data"]["emotes"].as_array())
        .ok_or_else(|| "グローバルエモート一覧がありません".to_owned())?;
    Ok(emotes.iter().filter_map(convert_seven_tv_emote).collect())
}

fn convert_seven_tv_emote(value: &Value) -> Option<ExternalEmote> {
    let name = value["name"].as_str()?.to_owned();
    let data = value.get("data").unwrap_or(value);
    let host = &data["host"];
    let host_url = host["url"].as_str()?;
    let files = host["files"].as_array()?;
    let file = ["4x.webp", "3x.webp", "2x.webp"]
        .iter()
        .find_map(|wanted| {
            files
                .iter()
                .find(|file| file["name"].as_str() == Some(wanted))
        })
        .or_else(|| files.first())?;
    let file_name = file["name"].as_str()?;
    let base = if host_url.starts_with("//") {
        format!("https:{host_url}")
    } else {
        host_url.to_owned()
    };
    Some(ExternalEmote {
        name,
        url: format!("{base}/{file_name}"),
        provider: "7TV",
    })
}
