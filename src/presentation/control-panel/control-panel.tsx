import type React from 'react';
import './style.css';

export function ControlPanel(): React.JSX.Element {
  const port = window.location.port;

  return (
    <main className="control-panel">
      <h1>Twitch Text Flow Overlay</h1>
      <p>Tauri localhostサーバーから実行しています。</p>
      <dl>
        <dt>実行環境</dt>
        <dd>{navigator.platform}</dd>
        <dt>localhost</dt>
        <dd>{port ? `localhost:${port}` : '取得できませんでした'}</dd>
        <dt>ポート設定</dt>
        <dd>起動時に未使用ポートを自動選択</dd>
        <dt>オーバーレイ</dt>
        <dd>別ウィンドウで起動中</dd>
      </dl>
    </main>
  );
}
