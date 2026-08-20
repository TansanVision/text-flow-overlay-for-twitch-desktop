# Raid introductions

[日本語](raid-intro.md) | [English](raid-intro.en.md)

Raid introductions support automatic and manual modes. Both use the intro duration, clip playback, clip count, and shoutout options configured under **Raid clip settings** in the control panel.

## Shared settings

| Setting | Automatic mode | Manual mode |
| --- | --- | --- |
| Intro | Displayed automatically for the configured duration | Displayed automatically for the configured duration |
| Clips | Played automatically after the intro | Started from the raider's action card |
| Clip count | Configured maximum | Configured maximum |
| Shoutout | Sent automatically after clips | Started from the raider's action card |

The settings active when a Raid is received are used for that raider's introduction.

## Automatic mode

When a Raid is received, the app performs the following enabled actions in order:

1. Display the raider's profile image, display name, and viewer count.
2. If clip playback is enabled, play up to the configured number of clips returned by the Twitch Clips API.
3. If shoutouts are enabled, send a shoutout through the Twitch Shoutout API after clip playback.
4. Finish the introduction and process the next Raid.

If no clips are available, the app skips clip playback and proceeds to the shoutout step.

## Manual mode

The intro is still displayed automatically. When it finishes, the control panel adds a separate action card for that raider.

Depending on the saved settings and available clip data, the card contains:

- The raider's profile image, display name, login, and viewer count
- A **Play clips** button
- A **Shoutout** button
- An `×` button that closes the card

You may play clips and send the shoutout in either order. The card closes automatically after every enabled action finishes.

### Example workflows

- Play clips, then send the shoutout.
- Introduce the raider verbally, send only the shoutout, then select `×`.
- Play only the clips, then select `×`.
- Select `×` without running either action.

Manual clip requests enter the same presentation queue as normal Raid introductions. They play in request order without overlapping another Raid intro or manual clip request. While a request is queued or playing, the same card cannot request it again.

If no clips are available, the card reports that state. A failed shoutout leaves the card open so it can be retried after the cause is resolved.

## Shoutout limits

The Twitch Shoutout API allows:

- One channel shoutout every two minutes
- One shoutout to the same broadcaster every 60 minutes

The app records successful automatic and manual shoutouts made during the current session. Manual cards show the remaining cooldown and do not call the API during a known cooldown.

Cooldowns created before the app starts, or by Twitch and other tools, are not available to the app. Twitch may therefore still return HTTP 429. Wait for the applicable cooldown before retrying.

## Clip playback

- Each clip uses the duration reported by Twitch.
- The app plays up to the configured number of returned clips.
- Clips always play muted to provide reliable autoplay in distributed builds.
- Manually requested clips are displayed in the OBS overlay.

## Settings compatibility

An older `portable-data/config/overlay.json` is migrated to the current defaults when first loaded. Settings saved from the control panel after migration are preserved.
