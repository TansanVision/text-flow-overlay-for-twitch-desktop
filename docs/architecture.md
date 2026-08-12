# アーキテクチャ

このアプリはClean Architectureの依存方向を採用する。

```text
presentation ─┐
              ├─> application ─> domain
infrastructure┘

bootstrapは各層の実装を組み立ててElectronを起動する。
```

## フォルダの責務

- `src/domain`: TwitchやElectronに依存しない業務ルールと型
  - `entities`: コメント、クリップ、配信者などのエンティティ
  - `value-objects`: チャンネルID、メッセージ本文などの値オブジェクト
  - `repositories`: 永続化に必要な抽象インターフェース
  - `services`: 複数エンティティにまたがるドメインサービス
- `src/application`: アプリが提供する操作と外部機能の抽象
  - `use-cases`: チャット受信、Raidイントロ開始などのユースケース
  - `ports`: Twitch、イベント通知、ファイル保存などの境界インターフェース
  - `dto`: 層をまたいで受け渡すデータ
- `src/infrastructure`: 外部技術を使用する具体的な実装
  - `electron`: BrowserWindow、IPC、preload
  - `http`: 内蔵ローカルHTTPサーバー
  - `twitch`: OAuth、Helix API、EventSub WebSocket
  - `persistence`: 設定やトークンの保存
- `src/presentation`: Reactによる表示
  - `control-panel`: 設定・接続状態を操作する管理画面
  - `overlay`: OBSがキャプチャする透明オーバーレイ
  - `shared`: 両画面で共有する表示部品と型
- `src/bootstrap`: 依存関係を組み立て、Electronアプリを起動するComposition Root

## 依存ルール

1. `domain`はほかの層をimportしない。
2. `application`は`domain`にのみ依存する。
3. `infrastructure`と`presentation`は`application`が定義したportを実装・利用する。
4. `bootstrap`だけが具象クラスを組み合わせる。
5. Electron、React、Twitch APIの型を`domain`へ持ち込まない。
