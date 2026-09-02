import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RaidClipPlayback } from '../shared/raid-clip-playback';

export function ClipPlaybackControls() {
  const { t } = useTranslation();
  const [playback, setPlayback] = useState<RaidClipPlayback | null>(null);
  const [pendingId, setPendingId] = useState<string>();
  const [skipError, setSkipError] = useState<{ playbackId: string; message: string }>();
  const [loadError, setLoadError] = useState<string>();
  const requestId = useRef<string | undefined>(undefined);

  useEffect(() => {
    let disposed = false;
    let receivedUpdate = false;
    let unlisten: (() => void) | undefined;
    void listen<RaidClipPlayback | null>('raid-clip-playback-updated', ({ payload }) => {
      if (disposed) return;
      receivedUpdate = true;
      setPlayback(payload);
      setLoadError(undefined);
    })
      .then(async (dispose) => {
        if (disposed) {
          dispose();
          return;
        }
        unlisten = dispose;
        const current = await invoke<RaidClipPlayback | null>('get_raid_clip_playback');
        // An event received while loading is newer than this snapshot.
        if (!disposed && !receivedUpdate) setPlayback(current);
      })
      .catch((error: unknown) => {
        if (!disposed) setLoadError(String(error));
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const skip = async () => {
    if (!playback || requestId.current === playback.playbackId || pendingId === playback.playbackId)
      return;
    const playbackId = playback.playbackId;
    requestId.current = playbackId;
    setPendingId(playbackId);
    setSkipError(undefined);
    try {
      const accepted = await invoke<boolean>('skip_raid_clip', { playbackId });
      if (!accepted) {
        const current = await invoke<RaidClipPlayback | null>('get_raid_clip_playback');
        setPlayback((previous) => (previous?.playbackId === playbackId ? current : previous));
      }
    } catch (error) {
      setSkipError({ playbackId, message: String(error) });
      setPendingId((current) => (current === playbackId ? undefined : current));
    } finally {
      if (requestId.current === playbackId) requestId.current = undefined;
    }
  };

  if (!playback && !loadError) return null;
  return (
    <section className="panel" aria-labelledby="clip-playback-title">
      <h2 id="clip-playback-title">{t('currentRaidClip')}</h2>
      {playback && (
        <>
          <p>
            <strong>{t('clipHeading', { name: playback.displayName })}</strong>
            {' · '}
            {t('clipPosition', { current: playback.clipNumber, total: playback.clipCount })}
          </p>
          <p>{playback.title}</p>
          <button
            type="button"
            onClick={() => void skip()}
            disabled={pendingId === playback.playbackId}
          >
            {pendingId === playback.playbackId ? t('skippingRaidClip') : t('skipRaidClip')}
          </button>
          <p className="help-text">{t('skipRaidClipHelp')}</p>
          {skipError?.playbackId === playback.playbackId && (
            <p className="error" role="alert">
              {t('skipRaidClipFailed', { error: skipError.message })}
            </p>
          )}
        </>
      )}
      {loadError && (
        <p className="error" role="alert">
          {t('clipPlaybackLoadFailed', { error: loadError })}
        </p>
      )}
    </section>
  );
}
