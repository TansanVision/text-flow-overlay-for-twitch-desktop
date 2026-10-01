import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointsJob } from '../shared/channel-points';
import type { ChatSource } from './chat-moderation';

export type PointsDecoration = { type: 'gravity'; jobId: string };
export type PlaybackView = { job: PointsJob; phase: 'active' | 'done' };
type Playback = PlaybackView & {
  elapsed: number;
  duration: number;
  finishing: boolean;
  acknowledged: boolean;
  retryAt: number;
};

export function useChannelPointEffects(blocked: boolean) {
  const [view, setView] = useState<PlaybackView>();
  const current = useRef<Playback | undefined>(undefined);
  const isBlocked = useRef(blocked);
  isBlocked.current = blocked;

  const decorate = useCallback((source: ChatSource | undefined): PointsDecoration | undefined => {
    const active = current.current;
    if (!active || isBlocked.current || !source || active.phase === 'done') return undefined;
    if (active.job.effect === 'gravity') return { type: 'gravity', jobId: active.job.id };
    return undefined;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout>;
    let previous = Date.now();
    const finish = async (active: Playback) => {
      active.finishing = true;
      try {
        await invoke('finish_channel_point_effect', { id: active.job.id, success: true });
        active.acknowledged = true;
        if (!cancelled && current.current === active) setView(undefined);
      } catch {
        active.retryAt = Date.now() + 1000;
      } finally {
        active.finishing = false;
      }
    };
    const poll = async () => {
      try {
        const job = await invoke<PointsJob | null>('claim_channel_point_effect', {
          blocked: isBlocked.current,
        });
        if (cancelled) return;
        if (!job) {
          current.current = undefined;
          setView(undefined);
        } else if (current.current?.job.id !== job.id) {
          current.current = {
            job,
            phase: 'active',
            elapsed: 0,
            duration: job.effect === 'flower' ? 12_000 : 10_000,
            finishing: false,
            acknowledged: false,
            retryAt: 0,
          };
          previous = Date.now();
          setView({ job, phase: current.current.phase });
        }
      } catch {
        /* The backend times out and refunds a job if the overlay loses contact. */
      }
      if (!cancelled) pollTimer = setTimeout(() => void poll(), 500);
    };
    void poll();
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.max(0, now - previous);
      previous = now;
      const active = current.current;
      if (!active) return;
      if (!isBlocked.current) active.elapsed += elapsed;
      if (active.phase !== 'done' && active.elapsed >= active.duration) {
        active.phase = 'done';
        setView({ job: active.job, phase: active.phase });
      }
      if (
        active.phase === 'done' &&
        !active.finishing &&
        !active.acknowledged &&
        now >= active.retryAt
      )
        void finish(active);
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
      clearInterval(timer);
    };
  }, []);

  return { view, decorate, paused: blocked };
}
