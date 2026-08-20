import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type CommentFont,
  type CustomFont,
  commentFonts,
  getCommentFontFamily,
  installCustomFonts,
} from '../comment-font';
import type { Language } from '../i18n';
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
  language: Language;
  settingsVersion: number;
  commentDurationSeconds: number;
  defaultSize: 'small' | 'medium' | 'big';
  commentFont: CommentFont;
  raidClipsEnabled: boolean;
  raidClipCount: number;
  raidIntroSeconds: number;
  raidAutoShoutout: boolean;
  raidIntroductionMode: 'automatic' | 'manual';
  enabledEffects: string[];
};
type CustomStamp = { commandName: string; dataUri: string };
type StampDefinition = { commandName: string; fileName: string; effectType: 'default' | 'falling' };
type StampEditorData = {
  definitions: StampDefinition[];
  imageFiles: string[];
  directoryPath: string;
};
type EditableStampDefinition = StampDefinition & { id: string };
type ExternalEmoteResult = {
  emotes: { name: string; url: string; provider: string }[];
  providers: { provider: string; count: number; error?: string }[];
};
type AudienceStatus = { total: number; path: string };
type ManualRaidClip = {
  id: string;
  title: string;
  embedUrl: string;
  duration: number;
  viewCount: number;
};
type ManualRaid = {
  id: string;
  displayName: string;
  login: string;
  broadcasterUserId?: string;
  viewerCount: number;
  profileImageUrl?: string;
  clips: ManualRaidClip[];
  clipsEnabled: boolean;
  shoutoutEnabled: boolean;
  clipsInProgress?: boolean;
  clipsCompleted?: boolean;
  shoutoutCompleted?: boolean;
};
type ShoutoutResult = { success: boolean; error?: string; raiderUserId?: string };
type RaidPhaseStatus = { raidId: string; phase: string };
type RuntimeInfo = { operatingSystem: string; architecture: string };

const SHOUTOUT_COOLDOWN_MS = 2 * 60 * 1000;
const SHOUTOUT_TARGET_COOLDOWN_MS = 60 * 60 * 1000;

const TWITCH_CLIENT_ID = 'jj36zzmydbz142ux14kpbsw5w747ta';

export function ControlPanel(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [authorization, setAuthorization] = useState<DeviceAuthorization>();
  const [connectedUser, setConnectedUser] = useState<ConnectedUser>();
  const [error, setError] = useState<string>();
  const [isStarting, setIsStarting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>({
    language: 'ja',
    settingsVersion: 1,
    commentDurationSeconds: 5,
    defaultSize: 'medium',
    commentFont: 'system',
    raidClipsEnabled: true,
    raidClipCount: 5,
    raidIntroSeconds: 60,
    raidAutoShoutout: true,
    raidIntroductionMode: 'automatic',
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
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const [customFontFamilies, setCustomFontFamilies] = useState<Map<string, string>>(new Map());
  const [customFontsLoaded, setCustomFontsLoaded] = useState(false);
  const [customFontErrors, setCustomFontErrors] = useState<string[]>([]);
  const [customStampCount, setCustomStampCount] = useState(0);
  const [stampDefinitions, setStampDefinitions] = useState<EditableStampDefinition[]>([]);
  const [stampImageFiles, setStampImageFiles] = useState<string[]>([]);
  const [stampDirectoryPath, setStampDirectoryPath] = useState('');
  const [stampsSaved, setStampsSaved] = useState(false);
  const [externalEmoteStatus, setExternalEmoteStatus] = useState<ExternalEmoteResult>();
  const [isLoadingExternalEmotes, setIsLoadingExternalEmotes] = useState(false);
  const [testComment, setTestComment] = useState(() => t('testCommentValue'));
  const [testClipId, setTestClipId] = useState('');
  const [testClipDuration, setTestClipDuration] = useState(30);
  const [audienceStatus, setAudienceStatus] = useState<AudienceStatus>();
  const [overlayWindowVisible, setOverlayWindowVisible] = useState(true);
  const [manualRaids, setManualRaids] = useState<ManualRaid[]>([]);
  const [shoutoutInProgress, setShoutoutInProgress] = useState<string>();
  const manualShoutoutRequest = useRef<string | undefined>(undefined);
  const [shoutoutResult, setShoutoutResult] = useState<ShoutoutResult>();
  const [shoutoutClock, setShoutoutClock] = useState(() => Date.now());
  const [shoutoutCooldowns, setShoutoutCooldowns] = useState<{
    globalUntil: number;
    targets: Record<string, number>;
  }>({ globalUntil: 0, targets: {} });
  const [raidPhaseStatus, setRaidPhaseStatus] = useState<RaidPhaseStatus>();
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo>();
  const port = new URLSearchParams(window.location.search).get('port') ?? window.location.port;

  const registerSuccessfulShoutout = useCallback((raiderUserId?: string) => {
    const sentAt = Date.now();
    setShoutoutClock(sentAt);
    setShoutoutCooldowns((current) => ({
      globalUntil: Math.max(current.globalUntil, sentAt + SHOUTOUT_COOLDOWN_MS),
      targets: raiderUserId
        ? {
            ...current.targets,
            [raiderUserId]: Math.max(
              current.targets[raiderUserId] ?? 0,
              sentAt + SHOUTOUT_TARGET_COOLDOWN_MS,
            ),
          }
        : current.targets,
    }));
  }, []);

  const completeManualRaidAction = useCallback((raidId: string, action: 'clips' | 'shoutout') => {
    setManualRaids((current) =>
      current.flatMap((raid) => {
        if (raid.id !== raidId) return [raid];
        const updated: ManualRaid = {
          ...raid,
          clipsInProgress: action === 'clips' ? false : raid.clipsInProgress,
          clipsCompleted: action === 'clips' ? true : raid.clipsCompleted,
          shoutoutCompleted: action === 'shoutout' ? true : raid.shoutoutCompleted,
        };
        const clipsFinished =
          !updated.clipsEnabled || updated.clips.length === 0 || updated.clipsCompleted;
        const shoutoutFinished = !updated.shoutoutEnabled || updated.shoutoutCompleted;
        return clipsFinished && shoutoutFinished ? [] : [updated];
      }),
    );
  }, []);

  useEffect(() => {
    void i18n.changeLanguage(overlaySettings.language);
    document.documentElement.lang = overlaySettings.language;
  }, [i18n, overlaySettings.language]);

  const changeLanguage = async (language: Language) => {
    const settings = { ...overlaySettings, language };
    setOverlaySettings(settings);
    try {
      await invoke('save_overlay_settings', { settings });
      setError(undefined);
    } catch (reason) {
      setError(String(reason));
    }
  };

  useEffect(() => {
    void invoke<OverlaySettings>('get_overlay_settings')
      .then(setOverlaySettings)
      .catch((reason: unknown) => setError(String(reason)));
  }, []);

  const applyCustomFonts = useCallback(async (fonts: CustomFont[]) => {
    const result = await installCustomFonts(fonts);
    setCustomFonts(result.availableFonts);
    setCustomFontFamilies(result.families);
    setCustomFontErrors(result.errors);
    setCustomFontsLoaded(true);
  }, []);

  useEffect(() => {
    void invoke<CustomFont[]>('get_custom_fonts')
      .then(applyCustomFonts)
      .catch((reason: unknown) => {
        setCustomFontsLoaded(true);
        setError(String(reason));
      });
  }, [applyCustomFonts]);

  useEffect(() => {
    if (
      !customFontsLoaded ||
      !overlaySettings.commentFont.startsWith('custom:') ||
      customFontFamilies.has(overlaySettings.commentFont)
    ) {
      return;
    }
    const settings: OverlaySettings = { ...overlaySettings, commentFont: 'system' };
    setOverlaySettings(settings);
    void invoke('save_overlay_settings', { settings }).catch((reason: unknown) =>
      setError(String(reason)),
    );
  }, [customFontFamilies, customFontsLoaded, overlaySettings]);

  useEffect(() => {
    const unlisten = listen<ManualRaid>('manual-raid-ready', ({ payload }) => {
      setManualRaids((current) =>
        current.some((raid) => raid.id === payload.id) ? current : [...current, payload],
      );
    });
    return () => void unlisten.then((dispose) => dispose());
  }, []);

  useEffect(() => {
    const unlisten = listen<{ raidId: string }>('manual-raid-clips-completed', ({ payload }) => {
      completeManualRaidAction(payload.raidId, 'clips');
    });
    return () => void unlisten.then((dispose) => dispose());
  }, [completeManualRaidAction]);

  useEffect(() => {
    const unlisten = listen<ShoutoutResult>('shoutout-result', ({ payload }) => {
      setShoutoutResult(payload);
      if (payload.success) registerSuccessfulShoutout(payload.raiderUserId);
    });
    return () => void unlisten.then((dispose) => dispose());
  }, [registerSuccessfulShoutout]);

  useEffect(() => {
    if (manualRaids.length === 0) return;
    const timer = window.setInterval(() => setShoutoutClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [manualRaids.length]);

  useEffect(() => {
    const unlisten = listen<RaidPhaseStatus>('raid-phase-updated', ({ payload }) => {
      setRaidPhaseStatus(payload);
    });
    return () => void unlisten.then((dispose) => dispose());
  }, []);

  useEffect(() => {
    void invoke<RuntimeInfo>('get_runtime_info')
      .then(setRuntimeInfo)
      .catch((reason: unknown) => setError(String(reason)));
  }, []);

  useEffect(() => {
    void invoke<boolean>('get_overlay_window_visibility')
      .then(setOverlayWindowVisible)
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
        displayName: t('testStreamer'),
        login: 'test_streamer',
        broadcasterUserId: '',
        viewerCount: 123,
        clips:
          withClip && clipId
            ? [
                {
                  id: clipId,
                  title: t('testClipTitle'),
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
        setStampDirectoryPath(data.directoryPath);
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

  const reloadCustomFonts = async () => {
    try {
      setCustomFontsLoaded(false);
      await applyCustomFonts(await invoke<CustomFont[]>('reload_custom_fonts'));
      setError(undefined);
    } catch (reason) {
      setCustomFontsLoaded(true);
      setError(String(reason));
    }
  };

  const openCustomFontDirectory = async () => {
    try {
      await invoke('open_custom_font_directory');
      setError(undefined);
    } catch (reason) {
      setError(String(reason));
    }
  };

  const changeRaidIntroductionMode = async (mode: 'automatic' | 'manual') => {
    const previousMode = overlaySettings.raidIntroductionMode;
    const settings = { ...overlaySettings, raidIntroductionMode: mode };
    setOverlaySettings(settings);
    try {
      await invoke('save_overlay_settings', { settings });
      setSettingsSaved(true);
      setError(undefined);
      window.setTimeout(() => setSettingsSaved(false), 2000);
    } catch (reason) {
      setOverlaySettings((current) =>
        current.raidIntroductionMode === mode
          ? { ...current, raidIntroductionMode: previousMode }
          : current,
      );
      setError(String(reason));
    }
  };

  const changeRaidAutoShoutout = async (enabled: boolean) => {
    const previousValue = overlaySettings.raidAutoShoutout;
    const settings = { ...overlaySettings, raidAutoShoutout: enabled };
    setOverlaySettings(settings);
    try {
      await invoke('save_overlay_settings', { settings });
      setSettingsSaved(true);
      setError(undefined);
      window.setTimeout(() => setSettingsSaved(false), 2000);
    } catch (reason) {
      setOverlaySettings((current) =>
        current.raidAutoShoutout === enabled
          ? { ...current, raidAutoShoutout: previousValue }
          : current,
      );
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
      setStampDirectoryPath(data.directoryPath);
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

  const openCustomStampDirectory = async () => {
    try {
      if (!stampDirectoryPath) throw new Error(t('imageFolderUnavailable'));
      await invoke('open_custom_stamp_directory');
      setError(undefined);
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

  const openAudienceDirectory = async () => {
    try {
      await invoke('open_audience_directory');
      setError(undefined);
    } catch (reason) {
      setError(String(reason));
    }
  };

  const clearAudience = async () => {
    await invoke('clear_audience_interactions');
    setAudienceStatus(undefined);
  };

  const changeOverlayWindowVisibility = async (visible: boolean) => {
    try {
      const actualVisibility = await invoke<boolean>('set_overlay_window_visibility', { visible });
      setOverlayWindowVisible(actualVisibility);
      setError(undefined);
    } catch (reason) {
      setError(String(reason));
    }
  };

  const sendManualShoutout = async (raid: ManualRaid) => {
    if (!raid.broadcasterUserId) {
      setError(t('missingUserId'));
      return;
    }
    if (manualShoutoutRequest.current) return;
    const cooldownUntil = Math.max(
      shoutoutCooldowns.globalUntil,
      shoutoutCooldowns.targets[raid.broadcasterUserId] ?? 0,
    );
    if (cooldownUntil > Date.now()) {
      setError(
        t('shoutoutCooldown', {
          seconds: Math.ceil((cooldownUntil - Date.now()) / 1000),
        }),
      );
      return;
    }
    manualShoutoutRequest.current = raid.id;
    setShoutoutInProgress(raid.id);
    try {
      await invoke('send_twitch_shoutout', { raiderUserId: raid.broadcasterUserId });
      completeManualRaidAction(raid.id, 'shoutout');
      setError(undefined);
    } catch (reason) {
      setError(String(reason));
    } finally {
      if (manualShoutoutRequest.current === raid.id) {
        manualShoutoutRequest.current = undefined;
      }
      setShoutoutInProgress((current) => (current === raid.id ? undefined : current));
    }
  };

  const playManualRaidClips = async (raid: ManualRaid) => {
    if (raid.clips.length === 0 || raid.clipsInProgress || raid.clipsCompleted) return;
    setManualRaids((current) =>
      current.map((item) => (item.id === raid.id ? { ...item, clipsInProgress: true } : item)),
    );
    try {
      await invoke('play_manual_raid_clips', { raid });
      setError(undefined);
    } catch (reason) {
      setManualRaids((current) =>
        current.map((item) => (item.id === raid.id ? { ...item, clipsInProgress: false } : item)),
      );
      setError(String(reason));
    }
  };

  const closeManualRaid = (raidId: string) => {
    setManualRaids((current) => current.filter((raid) => raid.id !== raidId));
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
        <div>
          <p className="eyebrow">Desktop control panel</p>
          <h1>Twitch Text Flow Overlay</h1>
        </div>
        <label className="language-selector">
          <span>{t('language')}</span>
          <select
            value={overlaySettings.language}
            onChange={(event) => void changeLanguage(event.target.value as Language)}
          >
            <option value="ja">日本語</option>
            <option value="en">English</option>
          </select>
        </label>
      </header>

      <section className="panel" aria-labelledby="connection-title">
        <h2 id="connection-title">{t('connection')}</h2>
        {isRestoring && <p className="connection-status">{t('restoring')}</p>}
        {!isRestoring && !connectedUser && !authorization && (
          <button type="button" onClick={() => void startAuthorization()} disabled={isStarting}>
            {isStarting ? t('connecting') : t('connect')}
          </button>
        )}

        {authorization && (
          <div className="authorization" role="status">
            <p>{t('deviceInstruction')}</p>
            <strong>{authorization.userCode}</strong>
            <button type="button" onClick={() => void openUrl(authorization.verificationUri)}>
              {t('openAuth')}
            </button>
          </div>
        )}

        {connectedUser && (
          <div className="authorization">
            {connectedUser.profileImageUrl && (
              <img className="connected-user-avatar" src={connectedUser.profileImageUrl} alt="" />
            )}
            <div className="connected-user-details">
              <p className="success">{t('connected', { name: connectedUser.displayName })}</p>
              <small>@{connectedUser.login}</small>
            </div>
            <button type="button" onClick={() => void logout()}>
              {t('logout')}
            </button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel" aria-labelledby="external-emotes-title">
        <h2 id="external-emotes-title">{t('externalEmotes')}</h2>
        {externalEmoteStatus?.providers.map((status) => (
          <p key={status.provider} className={status.error ? 'provider-error' : undefined}>
            {status.provider}:{' '}
            {status.error
              ? t('loadFailed', { error: status.error })
              : t('items', { count: status.count })}
          </p>
        ))}
        <p className="help-text">
          {t('total', { count: externalEmoteStatus?.emotes.length ?? 0 })}
        </p>
        <button
          type="button"
          onClick={() => void loadExternalEmotes()}
          disabled={isLoadingExternalEmotes}
        >
          {isLoadingExternalEmotes ? t('loading') : t('reloadExternal')}
        </button>
      </section>

      <section className="panel" aria-labelledby="overlay-settings-title">
        <h2 id="overlay-settings-title">{t('commentSettings')}</h2>
        <div className="settings-grid">
          <label htmlFor="default-size">{t('defaultSize')}</label>
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
            <option value="small">{t('small')}</option>
            <option value="medium">{t('medium')}</option>
            <option value="big">{t('big')}</option>
          </select>
          <label htmlFor="comment-duration">{t('durationSeconds')}</label>
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
          <label htmlFor="comment-font">{t('commentFont')}</label>
          <select
            id="comment-font"
            value={overlaySettings.commentFont}
            onChange={(event) =>
              setOverlaySettings((current) => ({
                ...current,
                commentFont: event.target.value as CommentFont,
              }))
            }
          >
            <optgroup label={t('standardFonts')}>
              {commentFonts.map((font) => (
                <option key={font} value={font}>
                  {t(`commentFont_${font}`)}
                </option>
              ))}
            </optgroup>
            {customFonts.length > 0 && (
              <optgroup label={t('customFonts')}>
                {customFonts.map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <p
          className="font-preview"
          style={{
            fontFamily: getCommentFontFamily(overlaySettings.commentFont, customFontFamilies),
          }}
        >
          {t('fontPreview')}
        </p>
        <p className="help-text">{t('customFontHelp', { count: customFonts.length })}</p>
        {customFontErrors.map((fontError) => (
          <p className="provider-error" key={fontError}>
            {t('customFontLoadFailed', { error: fontError })}
          </p>
        ))}
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={openCustomFontDirectory}>
            {t('openFontFolder')}
          </button>
          <button type="button" className="secondary-button" onClick={reloadCustomFonts}>
            {t('reloadFonts')}
          </button>
        </div>
        <button type="button" onClick={() => void saveSettings()}>
          {t('saveSettings')}
        </button>
        {settingsSaved && <span className="saved-message">{t('saved')}</span>}
      </section>

      <section className="panel" aria-labelledby="effect-settings-title">
        <h2 id="effect-settings-title">{t('effectSettings')}</h2>
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
          {t('saveEffects')}
        </button>
        {settingsSaved && <span className="saved-message">{t('saved')}</span>}
      </section>

      <section className="panel" aria-labelledby="raid-settings-title">
        <h2 id="raid-settings-title">{t('raidSettings')}</h2>
        <p className="help-text">{t('raidHelp')}</p>
        <div className="settings-grid">
          <label htmlFor="raid-introduction-mode">{t('introductionMode')}</label>
          <select
            id="raid-introduction-mode"
            value={overlaySettings.raidIntroductionMode}
            onChange={(event) =>
              void changeRaidIntroductionMode(event.target.value as 'automatic' | 'manual')
            }
          >
            <option value="automatic">{t('automatic')}</option>
            <option value="manual">{t('manual')}</option>
          </select>
          <label htmlFor="raid-intro-seconds">{t('introSeconds')}</label>
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
          <label htmlFor="raid-clips-enabled">{t('clipPlayback')}</label>
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
          <label htmlFor="raid-clip-count">{t('clipCount')}</label>
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
                {t('items', { count })}
              </option>
            ))}
          </select>
          <label htmlFor="raid-auto-shoutout">
            {overlaySettings.raidIntroductionMode === 'manual'
              ? t('manualShoutoutAction')
              : t('autoShoutout')}
          </label>
          <input
            id="raid-auto-shoutout"
            type="checkbox"
            checked={overlaySettings.raidAutoShoutout}
            onChange={(event) => void changeRaidAutoShoutout(event.target.checked)}
          />
        </div>
        <p className="help-text">{t('clipHelp')}</p>
        <button type="button" onClick={() => void saveSettings()}>
          {t('saveRaid')}
        </button>
        {settingsSaved && <span className="saved-message">{t('saved')}</span>}
        {raidPhaseStatus && (
          <p className="help-text" role="status">
            {t('raidPhase', { phase: raidPhaseStatus.phase })}
          </p>
        )}
        {shoutoutResult && (
          <p className={shoutoutResult.success ? 'success' : 'error'} role="status">
            {shoutoutResult.success
              ? t('shoutoutSucceeded')
              : t('shoutoutFailed', { error: shoutoutResult.error ?? t('unknownError') })}
          </p>
        )}
      </section>

      {manualRaids.length > 0 && (
        <section className="panel manual-raid-panel" aria-labelledby="manual-raid-title">
          <h2 id="manual-raid-title">{t('manualRaid')}</h2>
          <p className="help-text">{t('manualRaidHelp')}</p>
          {manualRaids.map((raid) => {
            const cooldownUntil = raid.broadcasterUserId
              ? Math.max(
                  shoutoutCooldowns.globalUntil,
                  shoutoutCooldowns.targets[raid.broadcasterUserId] ?? 0,
                )
              : shoutoutCooldowns.globalUntil;
            const cooldownSeconds = Math.max(Math.ceil((cooldownUntil - shoutoutClock) / 1000), 0);
            return (
              <article className="manual-raid-card" key={raid.id}>
                <button
                  className="manual-raid-close"
                  type="button"
                  aria-label={t('closeManualRaid', { name: raid.displayName })}
                  title={t('closeManualRaid', { name: raid.displayName })}
                  onClick={() => closeManualRaid(raid.id)}
                >
                  ×
                </button>
                <div className="manual-raid-user">
                  {raid.profileImageUrl && <img src={raid.profileImageUrl} alt="" />}
                  <div className="manual-raid-user-info">
                    <strong>{raid.displayName}</strong>
                    <small>
                      @{raid.login} · {t('viewersRaid', { count: raid.viewerCount })}
                    </small>
                  </div>
                </div>
                <div className="manual-raid-actions">
                  {raid.clipsEnabled && raid.clips.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void playManualRaidClips(raid)}
                      disabled={raid.clipsInProgress || raid.clipsCompleted}
                    >
                      {raid.clipsCompleted
                        ? t('raidClipsPlayed')
                        : raid.clipsInProgress
                          ? t('playingRaidClips')
                          : t('playRaidClips', { count: raid.clips.length })}
                    </button>
                  )}
                  {raid.clipsEnabled && raid.clips.length === 0 && (
                    <span className="manual-raid-status">{t('noRaidClips')}</span>
                  )}
                  {raid.shoutoutEnabled && (
                    <button
                      type="button"
                      onClick={() => void sendManualShoutout(raid)}
                      disabled={
                        raid.shoutoutCompleted ||
                        !raid.broadcasterUserId ||
                        shoutoutInProgress !== undefined ||
                        cooldownSeconds > 0
                      }
                    >
                      {raid.shoutoutCompleted
                        ? t('shoutoutSent')
                        : shoutoutInProgress === raid.id
                          ? t('sending')
                          : cooldownSeconds > 0
                            ? t('shoutoutCooldownButton', { seconds: cooldownSeconds })
                            : t('shoutout')}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      <section className="panel" aria-labelledby="custom-stamps-title">
        <h2 id="custom-stamps-title">{t('customStamps')}</h2>
        <p>{t('loaded', { count: customStampCount })}</p>
        <p className="help-text">{t('stampHelp')}</p>
        <div className="button-row">
          <button
            className="secondary-button"
            type="button"
            onClick={() => void openCustomStampDirectory()}
            disabled={!stampDirectoryPath}
          >
            {t('openImageFolder')}
          </button>
          <button type="button" onClick={() => void reloadCustomStamps()}>
            {t('reloadImages')}
          </button>
        </div>
        <div className="stamp-editor">
          {stampDefinitions.map((definition) => (
            <div className="stamp-row" key={definition.id}>
              <input
                aria-label={t('commandName')}
                placeholder={t('commandName')}
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
                aria-label={t('imageFile')}
                value={definition.fileName}
                onChange={(event) =>
                  setStampDefinitions((current) =>
                    current.map((item) =>
                      item.id === definition.id ? { ...item, fileName: event.target.value } : item,
                    ),
                  )
                }
              >
                <option value="">{t('selectImage')}</option>
                {stampImageFiles.map((fileName) => (
                  <option key={fileName} value={fileName}>
                    {fileName}
                  </option>
                ))}
              </select>
              <select
                aria-label={t('displayMode')}
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
                <option value="default">{t('inline')}</option>
                <option value="falling">{t('falling')}</option>
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
                {t('remove')}
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
            {t('addStamp')}
          </button>
          <button type="button" onClick={() => void saveCustomStamps()}>
            {t('saveStamps')}
          </button>
          {stampsSaved && <span className="saved-message">{t('saved')}</span>}
        </div>
      </section>

      <section className="panel" aria-labelledby="runtime-title">
        <h2 id="runtime-title">{t('runtime')}</h2>
        <dl>
          <dt>{t('environment')}</dt>
          <dd>
            {runtimeInfo
              ? `${runtimeInfo.operatingSystem} (${runtimeInfo.architecture})`
              : t('unavailable')}
          </dd>
          <dt>localhost</dt>
          <dd>{port ? `localhost:${port}` : t('unavailable')}</dd>
          <dt>{t('portSetting')}</dt>
          <dd>{t('autoPort')}</dd>
          <dt>{t('overlay')}</dt>
          <dd>{overlayWindowVisible ? t('onDesktop') : t('offscreen')}</dd>
        </dl>
        <div className="button-row">
          <button
            type="button"
            onClick={() => void changeOverlayWindowVisibility(true)}
            disabled={overlayWindowVisible}
          >
            {t('restoreDesktop')}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void changeOverlayWindowVisibility(false)}
            disabled={!overlayWindowVisible}
          >
            {t('moveOffscreen')}
          </button>
        </div>
        <p className="help-text">{t('offscreenHelp')}</p>
      </section>

      <section className="panel" aria-labelledby="audience-title">
        <h2 id="audience-title">{t('audience')}</h2>
        <p className="help-text">{t('audienceHelp')}</p>
        <div className="button-row">
          <button type="button" onClick={() => void saveAudience()}>
            {t('saveAudience')}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void openAudienceDirectory()}
          >
            {t('openAudienceFolder')}
          </button>
          <button className="secondary-button" type="button" onClick={() => void clearAudience()}>
            {t('clearAudience')}
          </button>
        </div>
        {audienceStatus && (
          <p className="success">
            {t('audienceSaved', { count: audienceStatus.total, path: audienceStatus.path })}
          </p>
        )}
      </section>

      <section className="panel" aria-labelledby="overlay-test-title">
        <h2 id="overlay-test-title">{t('overlayTest')}</h2>
        <div className="test-comment-row">
          <input
            value={testComment}
            onChange={(event) => setTestComment(event.target.value)}
            aria-label={t('testComment')}
          />
          <button
            type="button"
            onClick={() => void sendTestComment()}
            disabled={!testComment.trim()}
          >
            {t('showComment')}
          </button>
        </div>
        <div className="effect-buttons">
          <button
            className="secondary-button"
            type="button"
            onClick={() => void sendTestComment('!helpcs')}
          >
            {t('showStampHelp')}
          </button>
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
          {t('showRaidIntro')}
        </button>
        <div className="test-comment-row">
          <input
            value={testClipId}
            onChange={(event) => setTestClipId(event.target.value)}
            aria-label={t('testClip')}
            placeholder={t('clipPlaceholder')}
          />
          <button
            type="button"
            onClick={() => void sendTestRaid(true)}
            disabled={!extractClipId(testClipId)}
          >
            {t('showRaidClip')}
          </button>
        </div>
        <div className="settings-grid test-clip-duration">
          <label htmlFor="test-clip-duration">{t('testDuration')}</label>
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
