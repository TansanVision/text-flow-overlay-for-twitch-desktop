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

## Creator Dashboardを開く

1. 「Creator Dashboardを開く」を押す
2. 通常のブラウザーでTwitchへログインする
3. Creator Dashboardで必要な操作を行う

Twitchへ接続済みの場合は、そのチャンネルのStream Managerを直接開きます。未接続の場合はCreator Dashboardのトップページを開きます。アプリからは既定のブラウザーを開くだけで、Dashboard内の状態取得や操作は行いません。ログイン状態は使用したブラウザー側で管理されます。

## 開発メモ

- 広告: `POST /helix/channels/commercial`
- 必要スコープ: `channel:edit:commercial`
- Creator Dashboard: 既定ブラウザーで開き、ユーザーが操作
- アプリ内WebViewへのログイン情報保存やDashboard DOM操作は行わない

Twitchの権限一覧は[Authentication Scopes](https://dev.twitch.tv/docs/authentication/scopes/)を参照してください。
