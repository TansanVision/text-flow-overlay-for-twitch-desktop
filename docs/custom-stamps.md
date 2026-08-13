# カスタムスタンプ

カスタムスタンプは、実行ファイルと同じ場所に作られる`portable-data/custom-stamps`へ配置する。

## 設定例

`stamp.png`をフォルダへ置き、`stamps.json`を次のように編集する。

```json
[
  {
    "commandName": "stamp1",
    "fileName": "stamp.png"
  }
]
```

管理画面の「カスタムスタンプを再読み込み」を押した後、Twitchチャットで`stamp1`と投稿すると画像が表示される。通常の文章やTwitchエモートとの併用もできる。

対応形式はPNG、JPEG、GIF、WebP。安全のため、画像は`custom-stamps`直下に配置し、`fileName`にはフォルダを含めない。
