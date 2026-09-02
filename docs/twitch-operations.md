# Twitch操作

コンパネの「Twitch操作」では、広告の開始とCreator Dashboardを開く操作ができます。この2機能は仕組みが異なります。

## 広告を開始

広告はTwitch公式の[Start Commercial API](https://dev.twitch.tv/docs/api/reference#start-commercial)を使用します。

1. アプリでTwitchへ接続する
2. 配信を開始する
3. 「Twitch操作」で30、60、90、180秒のいずれかを押す
4. 成功後に表示される待機時間が終わるまで待つ

利用できるのは、配信中のTwitchアフィリエイトまたはパートナーのチャンネルです。選択値は要求時間であり、実際の広告時間はTwitch側で変わる場合があります。APIから返された`retry_after`に基づき、次に実行できるまでボタンを無効化します。

この機能には`channel:edit:commercial`権限が必要です。機能追加前に接続済みだった場合、更新後の初回起動ではTwitchへ再接続してください。以後は通常どおりrefresh tokenで接続を維持します。


広告の待機時間は、このアプリが成功応答を読み取った時点から管理します。アプリ起動前や別ツールで開始した広告の状態は取得していないため、Twitchから429が返る場合があります。429では待機を案内し、広告開始を自動再試行しません。

「Twitchは広告開始要求を受け付けましたが、結果を確認できませんでした」と表示された場合、広告は開始済みの可能性があります。すぐに押し直さず、Creator Dashboardで確認してください。

## Creator Dashboardを開く

1. 「Creator Dashboardを開く」を押す
2. 通常のブラウザーでTwitchへログインする
3. Creator Dashboardで必要な操作を行う

Twitchへ接続済みの場合は、そのチャンネルのStream Managerを直接開きます。未接続の場合はCreator Dashboardのトップページを開きます。アプリからは既定のブラウザーを開くだけで、Dashboard内の状態取得や操作は行いません。ログイン状態は使用したブラウザー側で管理されます。

## 開発メモ

- 広告: `POST /helix/channels/commercial`
- API応答はsnake_case（retry_after）、コンパネへの返却はcamelCase（retryAfter）として扱う
- `cargo test --offline`（src-tauri内）で正常応答・読み取り不能な成功応答・429を検証
- `npm test`で広告ボタンの待機表示、連打防止、自動・手動クリップのスキップを検証（Twitchへの実リクエストなし）
- 必要スコープ: `channel:edit:commercial`
- Creator Dashboard: 既定ブラウザーで開き、ユーザーが操作
- アプリ内WebViewへのログイン情報保存やDashboard DOM操作は行わない

Twitchの権限一覧は[Authentication Scopes](https://dev.twitch.tv/docs/authentication/scopes/)を参照してください。
