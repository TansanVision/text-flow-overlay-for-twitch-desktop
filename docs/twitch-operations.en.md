# Twitch operations

The **Twitch operations** panel can start commercials and open Creator Dashboard. These features use different mechanisms.

## Start a commercial

Commercials use Twitch's official [Start Commercial API](https://dev.twitch.tv/docs/api/reference#start-commercial).

1. Connect the app to Twitch.
2. Start streaming.
3. Select 30, 60, 90, or 180 seconds under **Twitch operations**.
4. Wait for the reported cooldown to finish before running another commercial.

The channel must be live and enrolled as a Twitch Affiliate or Partner. The selected value is the requested duration; Twitch may adjust the actual duration. Buttons remain disabled until the API's `retry_after` period expires.

This feature requires `channel:edit:commercial`. If Twitch was connected before this feature was added, reconnect once after updating. Refresh-token handling resumes normally after that authorization.


The cooldown is tracked from a successfully decoded response in this app. Ads started before the app launches or by other tools are not synchronized, so Twitch may still return 429. The app explains that you should wait and does not automatically retry starting an ad.

If the error says Twitch accepted the request but the result could not be confirmed, an ad may already have started. Check Creator Dashboard before pressing the button again.

## Open Creator Dashboard

1. Select **Open Creator Dashboard**.
2. Sign in to Twitch in your normal browser.
3. Perform the operation you need in Creator Dashboard.

When Twitch is connected, the app opens that channel's Stream Manager directly. Otherwise, it opens the Creator Dashboard home page. The app only opens your default browser; it does not inspect or operate anything inside Dashboard. Dashboard login state remains under the browser's control.

## Development notes

- Commercial: `POST /helix/channels/commercial`
- Decode API responses as snake_case (retry_after) and return camelCase (retryAfter) to the control panel.
- Run `cargo test --offline` in src-tauri to check success responses, unconfirmed results, and 429 errors.
- Run `npm test` for cooldown UI, repeated-click protection, and automatic/manual clip skips. These tests do not make real Twitch requests.
- Required scope: `channel:edit:commercial`
- Creator Dashboard: open it in the default browser for manual operation
- The app does not store Dashboard login information or manipulate Dashboard DOM

See Twitch's [Authentication Scopes](https://dev.twitch.tv/docs/authentication/scopes/) for current scope details.
