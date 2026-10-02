# Twitchログインの継続

このアプリはTwitch Device Code Flowで取得したuser access tokenとrefresh tokenを、実行ファイル横の`portable-data/auth/twitch-token.json`へ保存する。

## 更新処理

- 起動時にaccess tokenを`/validate`で検証する
- access tokenが期限切れの場合は、保存したrefresh tokenで更新してからEventSubへ接続する
- 起動中は最大1時間ごとにトークンを検証する
- 有効期限が10分以内、またはトークンが無効な場合はrefresh tokenで更新する
- 更新レスポンスの新しいaccess tokenとrefresh tokenを保存する
- EventSubを新しいaccess tokenで再接続する

起動時の認証確認が通信障害やTwitchの一時的なエラーで失敗した場合、保存情報を残して15秒後に再試行する。起動中の検証・更新の一時エラーは60秒後に再試行する。更新で受け取ったrefresh tokenは、次の検証リクエストより先に保存する。

EventSubの購読が401を返した場合はトークン更新を要求する。更新が拒否された場合は無限に再試行せず、コンパネに再認証が必要な状態を表示する。詳しくは[接続の復旧動作](twitch-connection.md)を参照。

Device Code Flowのrefresh tokenは一度使用すると旧トークンが無効になるため、更新のたびに新しいrefresh tokenへ置き換える。

## 再認証が必要な場合

- 旧形式の保存ファイルにrefresh tokenがない
- Twitch側でアプリ連携を解除した
- Twitchパスワード変更などでトークンが失効した
- 必要な権限が追加・変更された
- Public Clientのrefresh token自体が期限切れになった

refresh token対応前にログインした環境では、一度ログアウトしてTwitchへ再接続する。

`portable-data/auth`には認証情報が含まれるため、GitHub Releasesや第三者へ配布しない。
