import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
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
  | {
      status: 'authorized';
      login: string;
      displayName: string;
      profileImageUrl?: string;
      userId: string;
      scopes: string[];
    };

type RestoreResult =
  | { status: 'disconnected' }
  | {
      status: 'authorized';
      login: string;
      displayName: string;
      profileImageUrl?: string;
      userId: string;
      scopes: string[];
    };

type ConnectedUser = { login: string; displayName: string; profileImageUrl?: string };

type OverlaySettings = {
  commentDurationSeconds: number;
  defaultSize: 'small' | 'medium' | 'big';
  raidClipsEnabled: boolean;
  raidClipCount: number;
  raidClipMuted: boolean;
  raidIntroSeconds: number;
  raidAutoShoutout: boolean;
  enabledEffects: string[];
};
type CustomStamp = { commandName: string; dataUri: string };
type StampDefinition = { commandName: string; fileName: string; effectType: 'default' | 'falling' };
type StampEditorData = { definitions: StampDefinition[]; imageFiles: string[] };
type EditableStampDefinition = StampDefinition & { id: string };
type ExternalEmoteResult = {
  emotes: { name: string; url: string; provider: string }[];
  providers: { provider: string; count: number; error?: string }[];
};
type AudienceStatus = { total: number; path: string };

const TWITCH_CLIENT_ID = 'jj36zzmydbz142ux14kpbsw5w747ta';

export function ControlPanel(): React.JSX.Element {
  const [authorization, setAuthorization] = useState<DeviceAuthorization>();
  const [connectedUser, setConnectedUser] = useState<ConnectedUser>();
  const [error, setError] = useState<string>();
  const [isStarting, setIsStarting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>({
    commentDurationSeconds: 5,
    defaultSize: 'medium',
    raidClipsEnabled: true,
    raidClipCount: 1,
    raidClipMuted: false,
    raidIntroSeconds: 15,
    raidAutoShoutout: false,
    enabledEffects: [
      'sakura',
      'snow',
      'balloons',
      'kamifubuki',
      'rain',
      'maruta',
      'chikuwa',
      'marutai',
    ],
  });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [customStampCount, setCustomStampCount] = useState(0);
  const [stampDefinitions, setStampDefinitions] = useState<EditableStampDefinition[]>([]);
  const [stampImageFiles, setStampImageFiles] = useState<string[]>([]);
  const [stampsSaved, setStampsSaved] = useState(false);
  const [externalEmoteStatus, setExternalEmoteStatus] = useState<ExternalEmoteResult>();
  const [isLoadingExternalEmotes, setIsLoadingExternalEmotes] = useState(false);
  const [testComment, setTestComment] = useState('medium white テストコメント');
  const [testClipId, setTestClipId] = useState('');
  const [testClipDuration, setTestClipDuration] = useState(30);
  const [audienceStatus, setAudienceStatus] = useState<AudienceStatus>();
  const port = new URLSearchParams(window.location.search).get('port') ?? window.location.port;

  useEffect(() => {
    void invoke<OverlaySettings>('get_overlay_settings')
      .then(setOverlaySettings)
      .catch((reason: unknown) => setError(String(reason)));
  }, []);

  useEffect(() => {
    const unlisten = listen<AudienceStatus>('audience-auto-saved', ({ payload }) => {
      setAudienceStatus(payload);
    });
    return () => void unlisten.then((dispose) => dispose());
  }, []);

  const sendTestComment = async (text = testComment) => {
    await invoke('emit_overlay_test', {
      event: 'twitch-chat-message',
      payload: {
        id: crypto.randomUUID(),
        fragments: [{ type: 'text', key: '0', text }],
      },
    });
  };

  const sendTestRaid = async (withClip = false) => {
    const clipId = extractClipId(testClipId);
    await invoke('emit_overlay_test', {
      event: 'twitch-raid',
      payload: {
        id: crypto.randomUUID(),
        displayName: 'テスト配信者',
        login: 'test_streamer',
        broadcasterUserId: '',
        viewerCount: 123,
        clips:
          withClip && clipId
            ? [
                {
                  id: clipId,
                  title: 'コンパネからのテストクリップ',
                  embedUrl: `https://clips.twitch.tv/embed?clip=${encodeURIComponent(clipId)}`,
                  duration: testClipDuration,
                  viewCount: 0,
                },
              ]
            : [],
      },
    });
  };

  useEffect(() => {
    void invoke<StampEditorData>('get_custom_stamp_editor_data')
      .then((data) => {
        setStampDefinitions(
          data.definitions.map((definition) => ({ ...definition, id: crypto.randomUUID() })),
        );
        setStampImageFiles(data.imageFiles);
        setCustomStampCount(data.definitions.length);
      })
      .catch((reason: unknown) => setError(String(reason)));
  }, []);

  useEffect(() => {
    void invoke<RestoreResult>('restore_twitch_authorization')
      .then((result) => {
        if (result.status === 'authorized') {
          setConnectedUser({
            login: result.login,
            displayName: result.displayName,
            profileImageUrl: result.profileImageUrl,
          });
        }
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
            setConnectedUser({
              login: result.login,
              displayName: result.displayName,
              profileImageUrl: result.profileImageUrl,
            });
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

  const reloadCustomStamps = async () => {
    try {
      const data = await invoke<StampEditorData>('get_custom_stamp_editor_data');
      setStampDefinitions(
        data.definitions.map((definition) => ({ ...definition, id: crypto.randomUUID() })),
      );
      setStampImageFiles(data.imageFiles);
      await invoke<CustomStamp[]>('reload_custom_stamps');
      setCustomStampCount(data.definitions.length);
      setError(undefined);
    } catch (reason) {
      setError(String(reason));
    }
  };

  const saveCustomStamps = async () => {
    try {
      const stamps = await invoke<CustomStamp[]>('save_custom_stamp_definitions', {
        definitions: stampDefinitions.map(({ commandName, fileName, effectType }) => ({
          commandName,
          fileName,
          effectType,
        })),
      });
      setCustomStampCount(stamps.length);
      setStampsSaved(true);
      setError(undefined);
      window.setTimeout(() => setStampsSaved(false), 2000);
    } catch (reason) {
      setError(String(reason));
    }
  };

  const loadExternalEmotes = async () => {
    setIsLoadingExternalEmotes(true);
    try {
      const result = await invoke<ExternalEmoteResult>('get_external_emotes');
      setExternalEmoteStatus(result);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setIsLoadingExternalEmotes(false);
    }
  };

  const saveAudience = async () => {
    try {
      setAudienceStatus(await invoke<AudienceStatus>('save_audience_interactions'));
      setError(undefined);
    } catch (reason) {
      setError(String(reason));
    }
  };

  const clearAudience = async () => {
    await invoke('clear_audience_interactions');
    setAudienceStatus(undefined);
  };

  useEffect(() => {
    setIsLoadingExternalEmotes(true);
    void invoke<ExternalEmoteResult>('get_external_emotes')
      .then(setExternalEmoteStatus)
      .catch((reason: unknown) => setError(String(reason)))
      .finally(() => setIsLoadingExternalEmotes(false));
  }, []);

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
            {connectedUser.profileImageUrl && (
              <img className="connected-user-avatar" src={connectedUser.profileImageUrl} alt="" />
            )}
            <div className="connected-user-details">
              <p className="success">接続済み: {connectedUser.displayName}</p>
              <small>@{connectedUser.login}</small>
            </div>
            <button type="button" onClick={() => void logout()}>
              ログアウト
            </button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel" aria-labelledby="external-emotes-title">
        <h2 id="external-emotes-title">外部エモート</h2>
        {externalEmoteStatus?.providers.map((status) => (
          <p key={status.provider} className={status.error ? 'provider-error' : undefined}>
            {status.provider}: {status.error ? `取得失敗 (${status.error})` : `${status.count}件`}
          </p>
        ))}
        <p className="help-text">合計: {externalEmoteStatus?.emotes.length ?? 0}件</p>
        <button
          type="button"
          onClick={() => void loadExternalEmotes()}
          disabled={isLoadingExternalEmotes}
        >
          {isLoadingExternalEmotes ? '読み込み中…' : '外部エモートを再読み込み'}
        </button>
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

      <section className="panel" aria-labelledby="effect-settings-title">
        <h2 id="effect-settings-title">内蔵エフェクト設定</h2>
        <div className="effect-buttons">
          {['sakura', 'snow', 'balloons', 'kamifubuki', 'rain', 'maruta', 'chikuwa', 'marutai'].map(
            (effect) => (
              <label key={effect} className="effect-toggle">
                <input
                  type="checkbox"
                  checked={overlaySettings.enabledEffects.includes(effect)}
                  onChange={(event) =>
                    setOverlaySettings((current) => ({
                      ...current,
                      enabledEffects: event.target.checked
                        ? [...current.enabledEffects, effect]
                        : current.enabledEffects.filter((value) => value !== effect),
                    }))
                  }
                />
                {effect}
              </label>
            ),
          )}
        </div>
        <button type="button" onClick={() => void saveSettings()}>
          エフェクト設定を保存
        </button>
        {settingsSaved && <span className="saved-message">保存しました</span>}
      </section>

      <section className="panel" aria-labelledby="raid-settings-title">
        <h2 id="raid-settings-title">Raidクリップ設定</h2>
        <div className="settings-grid">
          <label htmlFor="raid-clips-enabled">クリップ再生</label>
          <input
            id="raid-clips-enabled"
            type="checkbox"
            checked={overlaySettings.raidClipsEnabled}
            onChange={(event) =>
              setOverlaySettings((current) => ({
                ...current,
                raidClipsEnabled: event.target.checked,
              }))
            }
          />
          <label htmlFor="raid-intro-seconds">イントロ表示（秒）</label>
          <input
            id="raid-intro-seconds"
            type="number"
            min="1"
            max="60"
            value={overlaySettings.raidIntroSeconds}
            onChange={(event) =>
              setOverlaySettings((current) => ({
                ...current,
                raidIntroSeconds: Number(event.target.value),
              }))
            }
          />
          <label htmlFor="raid-clip-count">再生本数</label>
          <select
            id="raid-clip-count"
            value={overlaySettings.raidClipCount}
            onChange={(event) =>
              setOverlaySettings((current) => ({
                ...current,
                raidClipCount: Number(event.target.value),
              }))
            }
          >
            {[1, 2, 3, 4, 5].map((count) => (
              <option key={count} value={count}>
                {count}件
              </option>
            ))}
          </select>
          <label htmlFor="raid-clip-muted">クリップ音声</label>
          <select
            id="raid-clip-muted"
            value={overlaySettings.raidClipMuted ? 'muted' : 'sound'}
            onChange={(event) =>
              setOverlaySettings((current) => ({
                ...current,
                raidClipMuted: event.target.value === 'muted',
              }))
            }
          >
            <option value="sound">音声あり</option>
            <option value="muted">ミュート</option>
          </select>
          <label htmlFor="raid-auto-shoutout">終了後シャウトアウト</label>
          <input
            id="raid-auto-shoutout"
            type="checkbox"
            checked={overlaySettings.raidAutoShoutout}
            onChange={(event) =>
              setOverlaySettings((current) => ({
                ...current,
                raidAutoShoutout: event.target.checked,
              }))
            }
          />
        </div>
        <p className="help-text">
          再生時間はTwitchから取得した各クリップの実時間を使用します。公式プレイヤーの制約により、音量は数値ではなく音声あり／ミュートで設定します。
        </p>
        <button type="button" onClick={() => void saveSettings()}>
          Raid設定を保存
        </button>
        {settingsSaved && <span className="saved-message">保存しました</span>}
      </section>

      <section className="panel" aria-labelledby="custom-stamps-title">
        <h2 id="custom-stamps-title">カスタムスタンプ</h2>
        <p>読み込み済み: {customStampCount}件</p>
        <p className="help-text">
          portable-data/custom-stamps に画像を配置してから再読み込みしてください。
        </p>
        <div className="stamp-editor">
          {stampDefinitions.map((definition) => (
            <div className="stamp-row" key={definition.id}>
              <input
                aria-label="コマンド名"
                placeholder="コマンド名"
                value={definition.commandName}
                onChange={(event) =>
                  setStampDefinitions((current) =>
                    current.map((item) =>
                      item.id === definition.id
                        ? { ...item, commandName: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <select
                aria-label="画像ファイル"
                value={definition.fileName}
                onChange={(event) =>
                  setStampDefinitions((current) =>
                    current.map((item) =>
                      item.id === definition.id ? { ...item, fileName: event.target.value } : item,
                    ),
                  )
                }
              >
                <option value="">画像を選択</option>
                {stampImageFiles.map((fileName) => (
                  <option key={fileName} value={fileName}>
                    {fileName}
                  </option>
                ))}
              </select>
              <select
                aria-label="表示方式"
                value={definition.effectType}
                onChange={(event) =>
                  setStampDefinitions((current) =>
                    current.map((item) =>
                      item.id === definition.id
                        ? { ...item, effectType: event.target.value as 'default' | 'falling' }
                        : item,
                    ),
                  )
                }
              >
                <option value="default">コメント内</option>
                <option value="falling">画面上から落下</option>
              </select>
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  setStampDefinitions((current) =>
                    current.filter((item) => item.id !== definition.id),
                  )
                }
              >
                削除
              </button>
            </div>
          ))}
        </div>
        <div className="button-row">
          <button
            className="secondary-button"
            type="button"
            onClick={() =>
              setStampDefinitions((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  commandName: '',
                  fileName: stampImageFiles[0] ?? '',
                  effectType: 'default',
                },
              ])
            }
            disabled={stampImageFiles.length === 0}
          >
            スタンプを追加
          </button>
          <button type="button" onClick={() => void saveCustomStamps()}>
            スタンプ設定を保存
          </button>
          {stampsSaved && <span className="saved-message">保存しました</span>}
        </div>
        <button type="button" onClick={() => void reloadCustomStamps()}>
          画像一覧を再読み込み
        </button>
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

      <section className="panel" aria-labelledby="audience-title">
        <h2 id="audience-title">反応ユーザー記録</h2>
        <p className="help-text">
          コメント、Bits、サブスク、ギフト、Raidを種類別に重複なしで記録します。自分が別チャンネルへRaidすると自動的にaudience.mdへ保存します。
        </p>
        <div className="button-row">
          <button type="button" onClick={() => void saveAudience()}>
            audience.mdへ保存
          </button>
          <button className="secondary-button" type="button" onClick={() => void clearAudience()}>
            記録をクリア
          </button>
        </div>
        {audienceStatus && (
          <p className="success">
            {audienceStatus.total}件を保存しました: {audienceStatus.path}
          </p>
        )}
      </section>

      <section className="panel" aria-labelledby="overlay-test-title">
        <h2 id="overlay-test-title">オーバーレイテスト</h2>
        <div className="test-comment-row">
          <input
            value={testComment}
            onChange={(event) => setTestComment(event.target.value)}
            aria-label="テストコメント"
          />
          <button
            type="button"
            onClick={() => void sendTestComment()}
            disabled={!testComment.trim()}
          >
            コメント表示
          </button>
        </div>
        <div className="effect-buttons">
          {['sakura', 'snow', 'balloons', 'kamifubuki', 'rain', 'maruta', 'chikuwa', 'marutai'].map(
            (effect) => (
              <button
                className="secondary-button"
                type="button"
                key={effect}
                onClick={() => void sendTestComment(effect)}
              >
                {effect}
              </button>
            ),
          )}
        </div>
        <button type="button" onClick={() => void sendTestRaid()}>
          Raidイントロを表示
        </button>
        <div className="test-comment-row">
          <input
            value={testClipId}
            onChange={(event) => setTestClipId(event.target.value)}
            aria-label="テストするTwitchクリップURLまたはID"
            placeholder="TwitchクリップURLまたはクリップID"
          />
          <button
            type="button"
            onClick={() => void sendTestRaid(true)}
            disabled={!extractClipId(testClipId)}
          >
            Raid＋クリップを表示
          </button>
        </div>
        <div className="settings-grid test-clip-duration">
          <label htmlFor="test-clip-duration">テスト再生時間（秒）</label>
          <input
            id="test-clip-duration"
            type="number"
            min="1"
            max="60"
            step="1"
            value={testClipDuration}
            onChange={(event) => setTestClipDuration(Number(event.target.value))}
          />
        </div>
      </section>
    </main>
  );
}

function extractClipId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    if (url.hostname === 'clips.twitch.tv') return url.pathname.split('/').filter(Boolean)[0] ?? '';
    const segments = url.pathname.split('/').filter(Boolean);
    const clipIndex = segments.indexOf('clip');
    return clipIndex >= 0 ? (segments[clipIndex + 1] ?? '') : '';
  } catch {
    return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : '';
  }
}
