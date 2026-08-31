import { invoke } from '@tauri-apps/api/core';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Language } from '../i18n';

export type Raid = {
  id: string;
  displayName: string;
  login: string;
  broadcasterUserId?: string;
  viewerCount: number;
  profileImageUrl?: string;
  clips?: RaidClip[];
  presentation?: 'raid' | 'manual-clips';
};

export type RaidClip = {
  id: string;
  title: string;
  embedUrl: string;
  duration: number;
  viewCount: number;
};

type Props = {
  raid: Raid;
  duration: number;
  clipsEnabled: boolean;
  clipCount: number;
  autoShoutout: boolean;
  introductionMode: 'automatic' | 'manual';
  language: Language;
  initialPhase?: 'intro' | 'clips';
  clipsOnly?: boolean;
  onComplete: (id: string) => void;
};

type RaidPhase = 'intro' | 'clips' | 'manual-notify' | 'shoutout' | 'completed';

export function RaidIntro({
  raid,
  duration,
  clipsEnabled,
  clipCount,
  autoShoutout,
  introductionMode,
  language,
  initialPhase = 'intro',
  clipsOnly = false,
  onComplete,
}: Props): React.JSX.Element | null {
  const { t, i18n } = useTranslation();
  const [remaining, setRemaining] = useState(duration);
  const [phase, setPhase] = useState<RaidPhase>(initialPhase);
  const [clipIndex, setClipIndex] = useState(0);
  const introCompleted = useRef(false);
  const manualNotificationStarted = useRef(false);
  const clipPlaybackCompleted = useRef(false);
  const shoutoutStarted = useRef(false);
  const clips = useMemo(
    () => (clipsEnabled ? (raid.clips ?? []).slice(0, clipCount) : []),
    [clipCount, clipsEnabled, raid.clips],
  );
  useEffect(() => {
    void i18n.changeLanguage(language);
  }, [i18n, language]);
  useEffect(() => {
    void invoke('notify_raid_phase', { raidId: raid.id, phase }).catch((error: unknown) =>
      console.error('Failed to report the Raid phase', error),
    );
  }, [phase, raid.id]);
  const finishIntro = useCallback(() => {
    if (introCompleted.current) return;
    introCompleted.current = true;
    if (introductionMode === 'manual') {
      setPhase('manual-notify');
      return;
    }
    setPhase(clips.length > 0 ? 'clips' : 'shoutout');
  }, [clips.length, introductionMode]);

  useEffect(() => {
    if (phase !== 'manual-notify' || manualNotificationStarted.current) return;
    manualNotificationStarted.current = true;
    const notification = invoke('notify_manual_raid_ready', {
      raid: {
        ...raid,
        clips,
        clipsEnabled,
        shoutoutEnabled: autoShoutout,
      },
    });
    setPhase('completed');
    onComplete(raid.id);
    void notification.catch((error: unknown) =>
      console.error('Failed to notify the control panel about a manual Raid', error),
    );
  }, [autoShoutout, clips, clipsEnabled, onComplete, phase, raid]);

  const completeClipPlayback = useCallback(() => {
    if (!clipsOnly) {
      setPhase('shoutout');
      return;
    }
    if (clipPlaybackCompleted.current) return;
    clipPlaybackCompleted.current = true;
    setPhase('completed');
    onComplete(raid.id);
    void invoke('notify_manual_raid_clips_completed', { raidId: raid.id }).catch((error: unknown) =>
      console.error('Failed to report manual Raid clip completion', error),
    );
  }, [clipsOnly, onComplete, raid.id]);

  useEffect(() => {
    if (phase !== 'intro') return;
    if (remaining <= 0) {
      finishIntro();
      return;
    }
    const timer = window.setTimeout(
      () => setRemaining((current) => Math.max(current - 1, 0)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [finishIntro, phase, remaining]);

  useEffect(() => {
    if (phase !== 'clips') return;
    const clip = clips[clipIndex];
    if (!clip) {
      completeClipPlayback();
      return;
    }
    const timer = window.setTimeout(
      () => {
        if (clipIndex + 1 < clips.length) setClipIndex((current) => current + 1);
        else completeClipPlayback();
      },
      Math.max(clip.duration || 30, 1) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [clipIndex, clips, completeClipPlayback, phase]);

  useEffect(() => {
    if (phase !== 'shoutout' || shoutoutStarted.current) return;
    shoutoutStarted.current = true;
    const sendShoutoutAndComplete = async () => {
      try {
        if (autoShoutout) {
          await invoke('send_twitch_shoutout', {
            raiderUserId: raid.broadcasterUserId ?? '',
          });
        } else {
          await invoke('notify_raid_phase', {
            raidId: raid.id,
            phase: 'shoutout-disabled',
          });
        }
      } catch (error) {
        console.error(error);
      } finally {
        setPhase('completed');
        onComplete(raid.id);
      }
    };
    void sendShoutoutAndComplete();
  }, [autoShoutout, onComplete, phase, raid.broadcasterUserId, raid.id]);

  if (phase === 'clips') {
    const clip = clips[clipIndex];
    if (!clip) return null;
    const separator = clip.embedUrl.includes('?') ? '&' : '?';
    const parent = window.location.hostname || 'localhost';
    const source = `${clip.embedUrl}${separator}parent=${encodeURIComponent(parent)}&autoplay=true&muted=true`;
    return (
      <aside className="raid-clip-player">
        <header>
          <strong>{t('clipHeading', { name: raid.displayName })}</strong>
          <span>{clip.title}</span>
        </header>
        <iframe
          key={`${raid.id}-${clip.id}-${phase}`}
          src={source}
          title={`${raid.displayName}: ${clip.title}`}
          allow="autoplay; fullscreen"
          height="540"
          width="800"
          allowFullScreen
        />
      </aside>
    );
  }

  if (phase !== 'intro' && phase !== 'manual-notify') return null;

  return (
    <aside className="raid-intro">
      {raid.profileImageUrl && <img src={raid.profileImageUrl} alt="" />}
      <div>
        <strong>{raid.displayName}</strong>
        <p>{t('raidThanks')}</p>
        <small>
          {t('viewersRaid', { count: raid.viewerCount })} ·{' '}
          {t('secondsRemaining', { count: remaining })}
        </small>
      </div>
    </aside>
  );
}
