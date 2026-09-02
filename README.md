# Text Flow Overlay for Twitch

[日本語](README.md) | [English](README.en.md)

Twitchチャットのコメント、エモート、カスタムスタンプ、エフェクト、Raid紹介をOBSへ表示するWindows向けデスクトップアプリです。

本アプリは非公式のサードパーティ製アプリであり、Twitch Interactive, Inc.の提供・承認を受けたものではありません。

Streamer.botやインストーラーは必要ありません。ZIPを展開してEXEを起動し、Twitchへ接続すると使用できます。

![コンパネとオーバーレイの画面](docs/images/app-overview-ja.png)

## できること

- Twitchコメントとエモートを画面上へ流す
- BTTV・7TVのエモートを表示する
- 桜、雪、風船、紙吹雪などのエフェクトを表示する
- 好きな画像をカスタムスタンプとして登録する
- 標準フォントや追加したフォントへ変更する
- Raidしてくれた配信者の名前、画像、クリップを紹介する
- 自動紹介と、レイダーごとにクリップ・シャウトアウトを選べる手動紹介を切り替える
- Raidしてくれた配信者をシャウトアウトする
- Twitch公式APIから広告を開始する
- Creator Dashboardをブラウザーで開く
- コメント、Bits、サブスク、ギフト、Raidへ反応したユーザーを記録する
- 日本語と英語を切り替える
- OBSでのキャプチャを維持したままオーバーレイを画面外へ移動する
- 設定や画像をEXEと一緒に持ち運ぶ

一度Twitchへ接続するとログイン情報が保存され、通常は次回起動時も接続が継続されます。

## 動作環境

- Windows 10またはWindows 11（x64）
- Microsoft Edge WebView2 Runtime
- Twitchアカウント
- OBS Studio（配信へ取り込む場合）

Windows 10・11の多くの環境にはWebView2 Runtimeが導入済みです。アプリが起動しない場合は、Microsoftが提供するWebView2 Runtimeを導入してください。

## ポータブル版の使い方

1. GitHub Releasesから`Text-Flow-Overlay-for-Twitch-*-windows-portable.zip`をダウンロードする
2. ZIPを任意の書き込み可能なフォルダへ展開する
3. `Text Flow Overlay for Twitch.exe`を実行する
4. コンパネの「Twitchに接続」から認証する
5. コメント、エフェクト、Raidなどを設定して保存する
6. OBSへオーバーレイウィンドウを追加する

![Twitch接続後のコンパネ初期設定](docs/images/control-panel-setup-ja.png)

初回起動時にEXEと同じ場所へ`portable-data`が作成されます。更新時は`portable-data`を残し、EXEを新しいバージョンへ差し替えてください。

アプリは多重起動されません。起動済みの状態でもう一度EXEを実行すると、新しいプロセスは終了し、既存のコンパネが前面へ表示されます。

## OBSへの追加

1. OBSのソースで「ウィンドウキャプチャ」を追加する
2. ウィンドウから`Text Flow Overlay for Twitch`を選択する
3. 必要に応じて変換やクロップでサイズを調整する
4. コンパネのオーバーレイテストでコメントやRaidイントロを確認する
5. 配信時はコンパネの「画面外へ移動」を使用する

![OBSのウィンドウキャプチャ設定](docs/images/obs-window-capture.png)

画面外への移動はウィンドウを閉じず、座標だけをデスクトップ外へ変更します。そのため、OBSは同じウィンドウを継続してキャプチャできます。

Twitchクリップは**常にミュート**で自動再生を要求します。Twitchの視聴確認などで停止する場合は、コンパネの「このクリップをスキップ」で次へ進めます。

![OBS設定2](docs/images/obs-settings2.png)

オーバーレイが真っ暗で何も映らない場合、キャプチャ方法を\\[Windows10 (1903以降)\\]に設定すると動く場合があります。

## Raid紹介

Raid紹介では、イントロ時間、クリップ再生、本数、シャウトアウトの使用有無を共通設定できます。

- 自動紹介では、イントロ → クリップ → シャウトアウトを設定に従って順番に実行します
- 手動紹介では、イントロ後にレイダーごとの操作カードをコンパネへ表示します
- 手動カードでは、クリップ再生とシャウトアウトを好きな順序で実行できます
- 有効な操作がすべて完了するとカードは自動で閉じます
- 操作を省略する場合は、カード右上の`×`で閉じられます

Twitchの制限に合わせ、シャウトアウトは全体で2分間隔、同じ相手には60分間隔で管理されます。手動カードでは待機中の残り秒数を表示し、制限中のAPI呼び出しを防ぎます。

詳しい動作は[Raid紹介](docs/raid-intro.md)を参照してください。

## Twitch操作

コンパネから30、60、90、180秒の広告を開始できます。配信中のアフィリエイトまたはパートナー向け機能で、初回利用時は追加権限のためTwitchへの再接続が必要になる場合があります。

「Creator Dashboardを開く」ボタンを押すと、通常のブラウザーで接続中のチャンネルのCreator Dashboardを開きます。アプリからDashboard内の操作や状態取得は行いません。

設定方法と制約は[Twitch操作](docs/twitch-operations.md)を参照してください。

## コメントコマンド

コメントの先頭にコマンドを書くと、文字の大きさ、色、位置、エフェクトを指定できます。複数の種類を半角スペースで区切って組み合わせられます。コマンド部分はオーバーレイには表示されません。

```text
big pink naka 中央に大きなピンク色で表示
small blue migi 右側に小さな青色で表示
sakura medium 桜エフェクトと一緒に表示
```

![コメントコマンドの表示例](docs/images/comment-command-example.png)

コマンドはコメントの先頭から記述してください。最初に通常の文章があると、それ以降はコマンドとして解釈されません。サイズ・色・エフェクトは1コメントにつき各1種類を指定でき、標準コマンドの英字は大文字と小文字を区別しません。

### 文字サイズ

| コマンド | 表示 |
| --- | --- |
| `small` | 小 |
| `medium` | 中 |
| `big` | 大 |

サイズを指定しない場合は、コンパネで選択した既定サイズを使用します。

### 基本色

| コマンド | 色 |
| --- | --- |
| `white` | 白 |
| `red` | 赤 |
| `orange` | オレンジ |
| `blue` | 青 |
| `green` | 緑 |
| `yellow` | 黄 |
| `pink` | ピンク |
| `cyan` | シアン |
| `purple` | 紫 |
| `black` | 黒 |

### 追加色と別名

| コマンド | 同じ色になる別名 |
| --- | --- |
| `white2` | `niconicowhite` |
| `red2` | `truered` |
| `pink2` | なし |
| `orange2` | `passionorange` |
| `yellow2` | `madyellow` |
| `cyan2` | なし |
| `blue2` | `marineblue` |
| `purple2` | `nobleviolet` |
| `black2` | なし |
| `green2` | `elementalgreen` |

### 表示位置

| コマンド | 表示位置 |
| --- | --- |
| 指定なし | 右から左へ流れる |
| `ue` | 上中央 |
| `naka` | 中央 |
| `shita` | 下中央 |
| `migi` | 右中央 |
| `hidari` | 左中央 |
| `migiue` | 右上 |
| `migishita` | 右下 |
| `hidariue` | 左上 |
| `hidarishita` | 左下 |

位置を指定したコメントは画面上を流れず、その位置へ一定時間表示されます。

### エフェクト

| コマンド | エフェクト |
| --- | --- |
| `sakura` | 桜 |
| `snow` | 雪 |
| `balloons` | 風船 |
| `kamifubuki` | 紙吹雪 |
| `rain` | 雨 |
| `maruta` | 丸太 |
| `chikuwa` | ちくわ |
| `marutai` | マルタイ |

コンパネで無効にしているエフェクトは表示されません。

### 改行とヘルプ

- コメント内へ文字列`U+2003`を入れると、その位置で改行します
- `!helpcs`だけを投稿すると、登録済みカスタムスタンプのコマンドを左下へ順番に表示します

```text
big pink 1行目 U+2003 2行目
```

## カスタムスタンプ

コンパネの「画像フォルダを開く」から`portable-data/custom-stamps`を開き、PNG、JPEG、GIF、WebPを配置します。画像を再読み込みした後、コマンド名、画像、表示方式を設定して保存してください。

![カスタムスタンプ設定画面](docs/images/custom-stamp-settings-ja.png)

詳細は[カスタムスタンプ](docs/custom-stamps.md)を参照してください。

## カスタムフォント

コンパネの「フォントフォルダを開く」から`portable-data/fonts`を開き、TTF、OTF、WOFF、WOFF2を配置します。「フォント一覧を再読み込み」を押すと、標準フォントと同じドロップダウンの「カスタムフォント」へ追加されます。

![カスタムフォント設定画面](docs/images/custom-font-settings-ja.png)

フォントをアプリと一緒に配布する場合は、各フォントの再配布ライセンスを確認してください。詳細は[カスタムフォント](docs/custom-fonts.md)を参照してください。

## データ保存場所

```text
portable-data/
├─ auth/           Twitchログイン情報
├─ config/         オーバーレイ設定
├─ custom-stamps/  カスタムスタンプ画像と設定
├─ fonts/          カスタムフォント
└─ audience/       反応ユーザー記録
```

`portable-data/auth`にはTwitchへ接続するための重要な情報が含まれます。認証済みの`portable-data`をGitHub Releasesや第三者へ配布しないでください。

別のPCへ移行する場合は、EXEだけではなくアプリのフォルダ全体をコピーしてください。

## 開発者向け情報

### 技術スタック

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

Twitchのアクセストークンとrefresh tokenは`portable-data/auth/twitch-token.json`へ保存します。起動時と起動中にトークンを検証し、必要に応じて更新してからTwitch接続を継続します。

認証処理の詳細は[Twitchログインの継続](docs/twitch-token-refresh.md)を参照してください。

### 開発環境

開発には次の環境が必要です。

- Node.js 24 LTSとnpm
- Rust stableとCargo
- Microsoft C++ Build Tools
- Microsoft Edge WebView2 Runtime

依存関係をインストールします。

```powershell
npm install
```

### Twitch Client IDの設定（開発・ビルド時のみ）

GitHub Releasesの公式配布版を使うだけの場合、この設定は不要です。Client IDはビルド時にEXEへ組み込み、利用者は従来どおり「Twitchに接続」からログインできます。

ソースから開発・ビルドする場合は、[Twitch Developer Console](https://dev.twitch.tv/console/apps)で自分のアプリを登録し、Device Code Flowを利用する**Public**クライアントのClient IDを用意してください。別アプリとして配布する場合、公式配布版のIDを使い回さず、自分のIDを使用してください。[Twitchの登録ガイド](https://dev.twitch.tv/docs/authentication/register-app/)と[Device Code Flowの説明](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow)も参照してください。

初回のみ、プロジェクト直下で設定例をコピーします。既存の`.env.local`がある場合は上書きせず編集してください。

```powershell
Copy-Item .env.example .env.local
```

`.env.local`の`TWITCH_CLIENT_ID=`の右側に自分のClient IDを入力してください。このファイルはGit管理対象外です。Client Secretやアクセストークン、refresh tokenは記載しないでください。

Tauri開発版を起動します。

```powershell
npm run dev:tauri
```

`cargo metadata: program not found`と表示される場合はRustを導入し、新しいターミナルで`cargo --version`が成功することを確認してください。

`npm run dev:tauri`、`npm run tauri:build`、`npm run tauri:portable`は`.env.local`を読み込みます。環境変数`TWITCH_CLIENT_ID`を明示的に設定した場合は、そちらを優先します。未設定・空欄の場合はエラーで停止し、既定のIDへのフォールバックはしません。設定変更後は開発プロセスを再起動、またはビルドし直してください。

CIではGitHub ActionsのRepository variableなどから、ビルドステップの環境変数`TWITCH_CLIENT_ID`へ値を渡します。`.env.local`をCIへアップロードする必要はありません。CargoやTauri CLIを直接実行する場合も、環境変数を明示してください（直接実行時は`.env.local`を自動で読み込みません）。

```powershell
$env:TWITCH_CLIENT_ID = 'YOUR_OWN_CLIENT_ID'
cargo test --manifest-path src-tauri/Cargo.toml
```

認証開始、APIリクエスト、トークン更新は同じClient IDを使用します。同じIDの更新版では既存のログインを引き継ぎますが、別のIDでビルドしたアプリでは再ログインが必要です。異なるIDの保存済みトークンはTwitchへ送信せず、再ログインするまでは元の認証ファイルを変更しません。

Client IDは公開識別子です。この構成は別アプリでの意図しない使い回しを防ぐためのもので、EXE内のIDを秘密にする仕組みではありません。過去のGit履歴にあるClient IDも自動では削除されません。Client Secretや認証トークンは公開・配布しないでください。

### 開発用コマンド

| コマンド | 内容 |
| --- | --- |
| `npm run dev:tauri` | Tauri開発版を起動 |
| `npm run build` | TypeScriptとrendererをビルド |
| `npm run typecheck` | TypeScript型チェック |
| `npm test` | ビルド設定と画面処理のテスト |
| `npm run check` | Biomeチェック |
| `npm run tauri:build` | Tauriリリースビルド |
| `npm run tauri:portable` | Windowsポータブル版とRelease用ZIPを作成 |

### ポータブル版のビルド

```powershell
npm run tauri:portable
```

生成物は次の場所へ出力されます。

```text
release/portable/Text Flow Overlay for Twitch/
release/Text-Flow-Overlay-for-Twitch-v<version>-windows-portable.zip
```

GitHub ReleasesにはEXE単体ではなく、生成されたZIPを登録してください。詳細は[Windowsポータブル版](docs/portable-build.md)を参照してください。

## 関連ドキュメント

- [Raid紹介](docs/raid-intro.md)
- [Twitch操作](docs/twitch-operations.md)
- [Twitchログインの継続](docs/twitch-token-refresh.md)
- [カスタムスタンプ](docs/custom-stamps.md)
- [カスタムフォント](docs/custom-fonts.md)
- [Windowsポータブル版](docs/portable-build.md)

## ライセンス

このプロジェクトの`package.json`ではMITライセンスを指定しています。使用するカスタム画像やフォントには、それぞれのライセンスが適用されます。
