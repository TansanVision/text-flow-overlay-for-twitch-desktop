# Twitch Text Flow Overlay

[日本語](README.md) | [English](README.en.md)

A Windows desktop application that displays Twitch chat messages, emotes, custom stamps, effects, and Raid introductions in OBS.

No Streamer.bot setup or installer is required. Extract the ZIP, launch the executable, and connect your Twitch account.

![Control panel and overlay](docs/images/app-overview.png)

## Features

- Flow Twitch chat messages and emotes across the screen
- Display BTTV and 7TV emotes
- Show built-in effects such as cherry blossoms, snow, balloons, and confetti
- Register your own images as custom stamps
- Choose from standard fonts or add custom fonts
- Introduce raiders with their name, profile image, and clips
- Switch between automatic and manual Raid introductions
- Send a shoutout to the raider
- Record users who interact through chat, Bits, subscriptions, gifts, or Raids
- Switch the interface between Japanese and English
- Move the overlay offscreen without interrupting OBS capture
- Keep settings and custom assets beside the executable for portability

After connecting to Twitch once, your login is saved and the connection will normally be restored the next time the app starts.

## Requirements

- Windows 10 or Windows 11 (x64)
- Microsoft Edge WebView2 Runtime
- A Twitch account
- OBS Studio, when using the overlay in a stream

WebView2 Runtime is already installed on many Windows 10 and Windows 11 systems. If the app does not start, install the WebView2 Runtime provided by Microsoft.

## Using the portable build

1. Download `Twitch-Text-Flow-Overlay-*-windows-portable.zip` from GitHub Releases.
2. Extract the ZIP into a writable folder.
3. Run `Twitch Text Flow Overlay.exe`.
4. Select **Connect to Twitch** in the control panel and complete authorization.
5. Configure and save the comment, effect, and Raid settings you need.
6. Add the overlay window to OBS.

![Initial control panel setup after connecting to Twitch](docs/images/control-panel-setup.png)

On first launch, the app creates `portable-data` beside the executable. When updating, keep `portable-data` and replace the executable with the new version.

## Adding the overlay to OBS

1. Add a **Window Capture** source in OBS.
2. Select the `Twitch Text Flow Overlay` window.
3. Adjust its transform or crop settings as needed.
4. Use the overlay tests in the control panel to check comments and the Raid introduction.
5. During a stream, use **Move offscreen** in the control panel.

![OBS Window Capture settings](docs/images/obs-window-capture.png)

Moving the overlay offscreen changes only its desktop coordinates; it does not close the window. OBS can therefore continue capturing the same window.

Twitch clips always play muted to provide reliable autoplay behavior.

## Comment commands

Place commands at the beginning of a chat message to control its size, color, position, and effect. Different command categories can be combined by separating them with spaces. The command portion is removed from the displayed message.

```text
big pink naka Large pink text in the center
small blue migi Small blue text on the right
sakura medium Medium text with the cherry blossom effect
```

![Comment command examples](docs/images/comment-command-example.png)

Commands must appear at the beginning of the message. Once normal text is encountered, subsequent words are not interpreted as commands. One size, color, and effect can be selected per message. Standard command names are case-insensitive.

### Text size

| Command | Display size |
| --- | --- |
| `small` | Small |
| `medium` | Medium |
| `big` | Large |

When no size command is present, the default size selected in the control panel is used.

### Basic colors

| Command | Color |
| --- | --- |
| `white` | White |
| `red` | Red |
| `orange` | Orange |
| `blue` | Blue |
| `green` | Green |
| `yellow` | Yellow |
| `pink` | Pink |
| `cyan` | Cyan |
| `purple` | Purple |
| `black` | Black |

### Additional colors and aliases

| Command | Alias for the same color |
| --- | --- |
| `white2` | `niconicowhite` |
| `red2` | `truered` |
| `pink2` | None |
| `orange2` | `passionorange` |
| `yellow2` | `madyellow` |
| `cyan2` | None |
| `blue2` | `marineblue` |
| `purple2` | `nobleviolet` |
| `black2` | None |
| `green2` | `elementalgreen` |

### Position

| Command | Position |
| --- | --- |
| No command | Flows from right to left |
| `ue` | Top center |
| `naka` | Center |
| `shita` | Bottom center |
| `migi` | Center right |
| `hidari` | Center left |
| `migiue` | Top right |
| `migishita` | Bottom right |
| `hidariue` | Top left |
| `hidarishita` | Bottom left |

A positioned message remains at that position for the configured duration instead of flowing across the screen.

### Effects

| Command | Effect |
| --- | --- |
| `sakura` | Cherry blossoms |
| `snow` | Snow |
| `balloons` | Balloons |
| `kamifubuki` | Confetti |
| `rain` | Rain |
| `maruta` | Log |
| `chikuwa` | Chikuwa |
| `marutai` | Marutai |

Effects disabled in the control panel are not displayed.

### Line breaks and help

- Insert the literal text `U+2003` into a message to add a line break at that position.
- Send only `!helpcs` to display the registered custom stamp commands one by one in the lower-left corner.

```text
big pink Line one U+2003 Line two
```

## Custom stamps

Select **Open image folder** in the control panel to open `portable-data/custom-stamps`, then add PNG, JPEG, GIF, or WebP files. Reload the images, choose a command name, image, and display mode, and save the settings.

![Custom stamp settings](docs/images/custom-stamp-settings.png)

See [Custom stamps](docs/custom-stamps.md) for more information. This linked document is currently written in Japanese.

## Custom fonts

Select **Open font folder** in the control panel to open `portable-data/fonts`, then add TTF, OTF, WOFF, or WOFF2 files. Select **Reload fonts** to add them to the **Custom fonts** group in the same font dropdown as the standard fonts.

![Custom font settings](docs/images/custom-font-settings.png)

Check each font's redistribution license before distributing it with the app. See [Custom fonts](docs/custom-fonts.md) for more information. This linked document is currently written in Japanese.

## Data storage

```text
portable-data/
├─ auth/           Twitch login data
├─ config/         Overlay settings
├─ custom-stamps/  Custom stamp images and settings
├─ fonts/          Custom fonts
└─ audience/       Audience interaction records
```

`portable-data/auth` contains sensitive information used to connect to Twitch. Never include an authenticated `portable-data` folder in GitHub Releases or share it with another person.

To move the app to another computer, copy the entire application folder rather than only the executable.

## Developer information

### Technology stack

- Tauri 2
- Rust
- React 19
- TypeScript
- Vite
- Microsoft Edge WebView2
- i18next
- Biome
- Twitch OAuth Device Code Flow
- Twitch Helix API
- Twitch EventSub WebSocket

The Twitch access token and refresh token are stored in `portable-data/auth/twitch-token.json`. The app validates the token on startup and periodically while running, refreshes it when necessary, and then continues the Twitch connection.

See [Persistent Twitch login](docs/twitch-token-refresh.md) for implementation details. This linked document is currently written in Japanese.

### Development requirements

- Node.js and npm
- Rust stable and Cargo
- Microsoft C++ Build Tools
- Microsoft Edge WebView2 Runtime

Install dependencies:

```powershell
npm install
```

Start the Tauri development build:

```powershell
npm run dev:tauri
```

If `cargo metadata: program not found` appears, install Rust, open a new terminal, and confirm that `cargo --version` succeeds.

### Development commands

| Command | Description |
| --- | --- |
| `npm run dev:tauri` | Start the Tauri development build |
| `npm run build` | Build TypeScript and the renderer |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run check` | Run Biome checks |
| `npm run tauri:build` | Create a Tauri release build |
| `npm run tauri:portable` | Create the Windows portable build and Release ZIP |

### Building the portable release

```powershell
npm run tauri:portable
```

Outputs are written to:

```text
release/portable/Twitch Text Flow Overlay/
release/Twitch-Text-Flow-Overlay-v<version>-windows-portable.zip
```

Upload the generated ZIP—not the executable by itself—to GitHub Releases. See [Windows portable build](docs/portable-build.md) for details. This linked document is currently written in Japanese.

## Related documentation

- [Raid introduction](docs/raid-intro.md) — Japanese
- [Persistent Twitch login](docs/twitch-token-refresh.md) — Japanese
- [Custom stamps](docs/custom-stamps.md) — Japanese
- [Custom fonts](docs/custom-fonts.md) — Japanese
- [Windows portable build](docs/portable-build.md) — Japanese

## License

The project declares the MIT license in `package.json`. Custom images and fonts remain subject to their respective licenses.
