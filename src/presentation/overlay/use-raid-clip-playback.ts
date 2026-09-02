import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import type { RaidClipPlayback, RaidClipSkipRequest } from '../shared/raid-clip-playback';
import type { RaidClip } from './raid-intro';

// One effect owns both timeout and skip, so a clip can only advance once.
export function useRaidClipPlayback(
  raidId: string,
  displayName: string,
  clip: RaidClip | undefined,
  clipNumber: number,
  clipCount: number,
  advance: () => void,
): void {
  useEffect(() => {
    if (!clip) return;
    const playbackId = crypto.randomUUID();
    const playback: RaidClipPlayback = {
      playbackId,
      raidId,
      displayName,
      title: clip.title,
      clipNumber,
      clipCount,
    };
    let disposed = false;
    let advanced = false;
    let unlisten: (() => void) | undefined;
    let publication: Promise<unknown> | undefined;
    const advanceOnce = () => {
      if (disposed || advanced) return;
      advanced = true;
      window.clearTimeout(timer);
      advance();
    };
    const timer = window.setTimeout(advanceOnce, Math.max(clip.duration || 30, 1) * 1000);
    void listen<RaidClipSkipRequest>('raid-clip-skip-requested', ({ payload }) => {
      if (payload.playbackId === playbackId) advanceOnce();
    })
      .then((dispose) => {
        if (disposed) {
          dispose();
          return;
        }
        unlisten = dispose;
        // Only enable the button after the skip listener is ready.
        publication = invoke('set_raid_clip_playback', { playbackId, playback }).catch(
          (error: unknown) => console.error('Failed to report current clip', error),
        );
      })
      .catch((error: unknown) => console.error('Failed to listen for clip skips', error));
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      unlisten?.();
      if (publication) {
        void publication
          .then(() => invoke('set_raid_clip_playback', { playbackId, playback: null }))
          .catch((error: unknown) => console.error('Failed to clear current clip', error));
      }
    };
  }, [advance, clip, clipCount, clipNumber, displayName, raidId]);
}
