# Windowsポータブル版

## 作成方法

ビルドする開発者は、先に[READMEのClient ID設定](../README.md#twitch-client-idの設定開発ビルド時のみ)を行う。プロジェクト直下の`.env.local`、またはビルド環境の`TWITCH_CLIENT_ID`に自分のアプリのIDを設定する。環境変数が優先され、未設定・空欄ではビルドを停止する。

公式配布版にはメンテナーが設定したIDが組み込まれる。利用者はIDの取得や入力をする必要がなく、`.env.local`も配布不要。別アプリとして配布する場合は自分のClient IDを使用する。

プロジェクト直下で次を実行する。

```powershell
npm run tauri:portable
```

生成先は次のとおり。

```text
release/portable/Text Flow Overlay for Twitch/
├─ Text Flow Overlay for Twitch.exe
└─ README.txt
```

GitHub Releasesへ登録するZIPも同時に生成される。ファイル名のバージョンには`package.json`の`version`が使用される。

```text
release/Text-Flow-Overlay-for-Twitch-v1.0.0-windows-portable.zip
```

GitHub Releasesにはフォルダ内のexe単体ではなく、このZIPを登録する。ZIPには`portable-data`は含まれない。

インストーラーは生成されない。フロントエンドはexeへ埋め込まれている。

## データ保存場所

初回起動時、exeと同じディレクトリへ`portable-data`が作成される。

```text
Text Flow Overlay for Twitch/
├─ Text Flow Overlay for Twitch.exe
├─ README.txt
└─ portable-data/
   ├─ auth/
   ├─ config/
   ├─ custom-stamps/
   ├─ fonts/
   └─ audience/
```

更新時は`portable-data`を残し、exeを新しいものへ差し替える。別PCへ移行する場合はフォルダ全体をコピーする。

## 多重起動

アプリは同時に1プロセスだけ起動する。すでに起動している状態でもう一度exeを実行した場合、新しいプロセスは終了し、既存のコンパネを最小化解除して前面へ表示する。

単一起動の判定にユーザーデータ領域のファイルは使用しない。設定や認証情報の保存場所は引き続きexe横の`portable-data`である。

## 実行要件

WindowsではMicrosoft Edge WebView2 Runtimeを使用する。Windows 10・11の多くの環境には導入済みだが、存在しない環境ではMicrosoftからWebView2 Runtimeを導入する必要がある。

認証情報もフォルダ内に含まれるため、認証済みの`portable-data`を第三者へ配布しないこと。
