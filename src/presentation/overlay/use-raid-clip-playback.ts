import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { type RefObject, useEffect } from 'react';
import type {
  RaidClipPlayback,
  RaidClipPlaybackStatus,
  RaidClipSkipRequest,
} from '../shared/raid-clip-playback';
import type { RaidClip } from './raid-intro';

const CHANNEL = 'text-flow:clip-player';
const CLIP_ORIGIN = 'https://clips.twitch.tv';
const START_OR_STALL_TIMEOUT = 30_000;

// One effect owns media events, timeout and skip, so a clip can only advance once.
export function useRaidClipPlayback(
  raidId: string,
  displayName: string,
  clip: RaidClip | undefined,
  clipNumber: number,
  clipCount: number,
  advance: () => void,
  frameRef: RefObject<HTMLIFrameElement | null>,
): void {
  useEffect(() => {
    if (!clip) return;
    const iframe = frameRef.current;
    const playbackId = crypto.randomUUID();
    const playback: RaidClipPlayback = {
      playbackId,
      raidId,
      displayName,
      title: clip.title,
      clipNumber,
      clipCount,
      status: 'loading',
    };
    let disposed = false;
    let advanced = false;
    let bridgeReady = false;
    let started = false;
    let lastProgress = -1;
    let lastMediaId: number | undefined;
    let loaded = false;
    let timer: number | undefined;
    let fallbackTimer: number | undefined;
    let unlisten: (() => void) | undefined;
    let publication: Promise<unknown> | undefined;
    const publish = () => {
      if (!unlisten || disposed || advanced) return;
      const snapshot = { ...playback };
      publication = (publication ?? Promise.resolve())
        .then(() => {
          if (!disposed)
            return invoke('set_raid_clip_playback', { playbackId, playback: snapshot });
        })
        .catch((error: unknown) => console.error('Failed to report current clip', error));
    };
    const setStatus = (status: RaidClipPlaybackStatus) => {
      if (playback.status === status) return;
      playback.status = status;
      publish();
    };
    const advanceOnce = () => {
      if (disposed || advanced) return;
      advanced = true;
      window.clearTimeout(timer);
      window.clearTimeout(fallbackTimer);
      advance();
    };
    const expire = () => {
      if (disposed || advanced) return;
      setStatus('unavailable');
      console.warn('Clip playback did not start or stopped progressing', {
        raidId,
        clipId: clip.id,
        bridgeReady,
        started,
        visibility: document.visibilityState,
      });
      // Briefly show the failure in the control panel before moving on.
      timer = window.setTimeout(advanceOnce, 2000);
    };
    const armWatchdog = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(expire, START_OR_STALL_TIMEOUT);
    };
    const observe = () => {
      iframe?.contentWindow?.postMessage(
        { channel: CHANNEL, command: 'observe', playbackId },
        CLIP_ORIGIN,
      );
    };
    const receive = (event: MessageEvent) => {
      if (
        disposed ||
        advanced ||
        event.origin !== CLIP_ORIGIN ||
        event.source !== iframe?.contentWindow ||
        event.data?.channel !== CHANNEL ||
        event.data?.playbackId !== playbackId
      )
        return;
      const { state, currentTime, mediaId } = event.data;
      if (
        ![
          'ready',
          'playing',
          'progress',
          'waiting',
          'ended',
          'play-rejected',
          'media-error',
        ].includes(state)
      ) {
        return;
      }
      if (!bridgeReady) {
        bridgeReady = true;
        window.clearTimeout(fallbackTimer);
        window.clearInterval(handshake);
        armWatchdog();
      }
      if (state === 'playing' || state === 'progress') {
        if (
          !Number.isFinite(currentTime) ||
          currentTime < 0 ||
          !Number.isSafeInteger(mediaId) ||
          mediaId < 1
        )
          return;
        if (mediaId !== lastMediaId) {
          lastMediaId = mediaId;
          started = false;
          lastProgress = -1;
        }
        // Repeated "playing" events alone must not keep a stuck player alive.
        if (!started || currentTime > lastProgress) {
          started = true;
          lastProgress = currentTime;
          setStatus('playing');
          armWatchdog();
        }
      } else if (state === 'ended' && started && mediaId === lastMediaId) {
        advanceOnce();
      } else if (state === 'waiting' || state === 'play-rejected' || state === 'media-error') {
        setStatus('waiting');
        if (state !== 'waiting') {
          console.warn('Clip player reported a playback problem', {
            clipId: clip.id,
            state,
            error: event.data.error,
          });
        }
      }
    };
    const handleLoad = () => {
      observe();
      if (loaded || bridgeReady) return;
      loaded = true;
      // Browser-only previews do not have the native media observer. Keep an
      // explicitly unconfirmed, duration-based fallback after frame load.
      fallbackTimer = window.setTimeout(() => {
        if (disposed || advanced || bridgeReady) return;
        setStatus('unconfirmed');
        const seconds = Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 30;
        window.clearTimeout(timer);
        timer = window.setTimeout(advanceOnce, seconds * 1000 + 3000);
      }, 2000);
    };
    window.addEventListener('message', receive);
    iframe?.addEventListener('load', handleLoad);
    const handshake = window.setInterval(observe, 500);
    observe();
    armWatchdog();
    void listen<RaidClipSkipRequest>('raid-clip-skip-requested', ({ payload }) => {
      if (payload.playbackId === playbackId) advanceOnce();
    })
      .then((dispose) => {
        if (disposed) {
          dispose();
          return;
        }
        unlisten = dispose;
        publish();
      })
      .catch((error: unknown) => console.error('Failed to listen for clip skips', error));
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.clearTimeout(fallbackTimer);
      window.clearInterval(handshake);
      window.removeEventListener('message', receive);
      iframe?.removeEventListener('load', handleLoad);
      unlisten?.();
      if (publication) {
        void publication
          .then(() => invoke('set_raid_clip_playback', { playbackId, playback: null }))
          .catch((error: unknown) => console.error('Failed to clear current clip', error));
      }
    };
  }, [advance, clip, clipCount, clipNumber, displayName, frameRef, raidId]);
}
