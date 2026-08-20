# アーキテクチャ

このアプリの現行デスクトップランタイムはTauri 2である。Reactによる表示とRustによるTwitch接続・ファイル保存・ウィンドウ制御を、Tauri commandとイベントで接続する。

```text
src/presentation (React)
        ↕ Tauri command / event
src-tauri/src (Rust: Twitch・保存・ウィンドウ・ローカルサーバー)
```

`src/domain`、`src/application`、`src/infrastructure`、`src/bootstrap`には、ElectronからTauriへ移行する前に作成したClean Architectureの土台が残っている。現在配布するTauri版のComposition Rootは`src-tauri/src/lib.rs`である。

## フォルダの責務

- `src/domain`: 外部技術に依存しない業務ルールと型の配置先
  - `entities`: コメント、クリップ、配信者などのエンティティ
  - `value-objects`: チャンネルID、メッセージ本文などの値オブジェクト
  - `repositories`: 永続化に必要な抽象インターフェース
  - `services`: 複数エンティティにまたがるドメインサービス
- `src/application`: アプリが提供する操作と外部機能の抽象
  - `use-cases`: チャット受信、Raidイントロ開始などのユースケース
  - `ports`: Twitch、イベント通知、ファイル保存などの境界インターフェース
  - `dto`: 層をまたいで受け渡すデータ
- `src/infrastructure`: Electron版で使用していた外部技術の実装。現行Tauri版の起動経路では使用しない
- `src/presentation`: Reactによる表示
  - `control-panel`: 設定・接続状態を操作する管理画面
  - `overlay`: OBSがキャプチャする透明オーバーレイ
  - `shared`: 両画面で共有する表示部品と型
- `src/bootstrap`: Electron版のComposition Root。移行確認用として残している
- `src-tauri/src`: 現行Tauri版のバックエンド
  - `lib.rs`: プラグイン、状態、コマンド、2ウィンドウを組み立てるComposition Root
  - `twitch_auth.rs`: OAuth、トークン更新、Shoutout API
  - `twitch_chat.rs`: Twitchチャット、Raid、クリップ情報の取得
  - `overlay_settings.rs`: オーバーレイ設定の永続化
  - `audience.rs`: 反応ユーザー記録
  - `custom_stamps.rs`、`custom_fonts.rs`: ポータブル素材の管理

## 依存ルール

1. `domain`はほかの層をimportしない。
2. `application`は`domain`にのみ依存する。
3. ReactからOS・Twitch・ファイルシステムを直接操作せず、Tauri commandまたはイベントを使用する。
4. Tauriプラグイン、共有状態、ウィンドウの組み立ては`src-tauri/src/lib.rs`へ集約する。
5. React、Tauri、Twitch APIの型を`domain`へ持ち込まない。

## ウィンドウと単一起動

- `control-panel`: Twitch接続、設定、手動Raid操作を行う通常ウィンドウ
- `overlay`: OBSがキャプチャする透明・クリック透過ウィンドウ
- `tauri-plugin-localhost`: オーバーレイをlocalhostから読み込む
- `tauri-plugin-single-instance`: 2回目の起動を終了し、既存のコンパネを前面へ戻す

単一起動プラグインは、ほかのTauriプラグインより先に登録する。
