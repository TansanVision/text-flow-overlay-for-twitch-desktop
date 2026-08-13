import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import type React from 'react';
import { useEffect, useState } from 'react';
import './style.css';

type DeviceAuthorization = {
  expiresIn: number;
  interval: number;
  userCode: string;
  verificationUri: string;
};

type PollResult =
  | { status: 'pending' }
  | { status: 'authorized'; login: string; userId: string; scopes: string[] };

type RestoreResult =
  | { status: 'disconnected' }
  | { status: 'authorized'; login: string; userId: string; scopes: string[] };

type OverlaySettings = {
  commentDurationSeconds: number;
  defaultSize: 'small' | 'medium' | 'big';
};

const TWITCH_CLIENT_ID = 'jj36zzmydbz142ux14kpbsw5w747ta';

export function ControlPanel(): React.JSX.Element {
  const [authorization, setAuthorization] = useState<DeviceAuthorization>();
  const [connectedUser, setConnectedUser] = useState<string>();
  const [error, setError] = useState<string>();
  const [isStarting, setIsStarting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>({
    commentDurationSeconds: 5,
    defaultSize: 'medium',
  });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const port = new URLSearchParams(window.location.search).get('port') ?? window.location.port;

  useEffect(() => {
    void invoke<OverlaySettings>('get_overlay_settings')
      .then(setOverlaySettings)
      .catch((reason: unknown) => setError(String(reason)));
  }, []);

  useEffect(() => {
    void invoke<RestoreResult>('restore_twitch_authorization')
      .then((result) => {
        if (result.status === 'authorized') setConnectedUser(result.login);
      })
      .catch((reason: unknown) => setError(String(reason)))
      .finally(() => setIsRestoring(false));
  }, []);

  useEffect(() => {
    if (!authorization || connectedUser) return;

    let cancelled = false;
    const intervalId = window.setInterval(() => {
      void invoke<PollResult>('poll_twitch_device_authorization')
        .then((result) => {
          if (!cancelled && result.status === 'authorized') {
            setConnectedUser(result.login);
            setAuthorization(undefined);
            setError(undefined);
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            setAuthorization(undefined);
            setError(String(reason));
          }
        });
    }, Math.max(authorization.interval, 1) * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [authorization, connectedUser]);

  const startAuthorization = async () => {
    setIsStarting(true);
    setError(undefined);
    setConnectedUser(undefined);
    try {
      const result = await invoke<DeviceAuthorization>('start_twitch_device_authorization', {
        clientId: TWITCH_CLIENT_ID,
      });
      setAuthorization(result);
      await openUrl(result.verificationUri);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setIsStarting(false);
    }
  };

  const logout = async () => {
    try {
      await invoke('logout_twitch');
      setConnectedUser(undefined);
      setAuthorization(undefined);
      setError(undefined);
    } catch (reason) {
      setError(String(reason));
    }
  };

  const saveSettings = async () => {
    try {
      await invoke('save_overlay_settings', { settings: overlaySettings });
      setSettingsSaved(true);
      window.setTimeout(() => setSettingsSaved(false), 2000);
    } catch (reason) {
      setError(String(reason));
    }
  };

  return (
    <main className="control-panel">
      <header>
        <p className="eyebrow">Desktop control panel</p>
        <h1>Twitch Text Flow Overlay</h1>
      </header>

      <section className="panel" aria-labelledby="connection-title">
        <h2 id="connection-title">Twitch接続</h2>
        {isRestoring && <p className="connection-status">接続状態を確認中…</p>}
        {!isRestoring && !connectedUser && !authorization && (
          <button type="button" onClick={() => void startAuthorization()} disabled={isStarting}>
            {isStarting ? '接続中…' : 'Twitchに接続'}
          </button>
        )}

        {authorization && (
          <div className="authorization" role="status">
            <p>Twitchの認証ページで次のコードを入力してください。</p>
            <strong>{authorization.userCode}</strong>
            <button type="button" onClick={() => void openUrl(authorization.verificationUri)}>
              認証ページを開く
            </button>
          </div>
        )}

        {connectedUser && (
          <div className="authorization">
            <p className="success">接続済み: {connectedUser}</p>
            <button type="button" onClick={() => void logout()}>
              ログアウト
            </button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel" aria-labelledby="overlay-settings-title">
        <h2 id="overlay-settings-title">コメント表示設定</h2>
        <div className="settings-grid">
          <label htmlFor="default-size">既定サイズ</label>
          <select
            id="default-size"
            value={overlaySettings.defaultSize}
            onChange={(event) =>
              setOverlaySettings((current) => ({
                ...current,
                defaultSize: event.target.value as OverlaySettings['defaultSize'],
              }))
            }
          >
            <option value="small">小</option>
            <option value="medium">中</option>
            <option value="big">大</option>
          </select>
          <label htmlFor="comment-duration">表示時間（秒）</label>
          <input
            id="comment-duration"
            type="number"
            min="1"
            max="30"
            step="0.5"
            value={overlaySettings.commentDurationSeconds}
            onChange={(event) =>
              setOverlaySettings((current) => ({
                ...current,
                commentDurationSeconds: Number(event.target.value),
              }))
            }
          />
        </div>
        <button type="button" onClick={() => void saveSettings()}>
          設定を保存
        </button>
        {settingsSaved && <span className="saved-message">保存しました</span>}
      </section>

      <section className="panel" aria-labelledby="runtime-title">
        <h2 id="runtime-title">実行状態</h2>
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
      </section>
    </main>
  );
}
