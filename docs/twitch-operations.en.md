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

## Open Creator Dashboard

1. Select **Open Creator Dashboard**.
2. Sign in to Twitch in your normal browser.
3. Perform the operation you need in Creator Dashboard.

When Twitch is connected, the app opens that channel's Stream Manager directly. Otherwise, it opens the Creator Dashboard home page. The app only opens your default browser; it does not inspect or operate anything inside Dashboard. Dashboard login state remains under the browser's control.

## Development notes

- Commercial: `POST /helix/channels/commercial`
- Required scope: `channel:edit:commercial`
- Creator Dashboard: open it in the default browser for manual operation
- The app does not store Dashboard login information or manipulate Dashboard DOM

See Twitch's [Authentication Scopes](https://dev.twitch.tv/docs/authentication/scopes/) for current scope details.
