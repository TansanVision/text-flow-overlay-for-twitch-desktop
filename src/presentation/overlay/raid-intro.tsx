import { invoke } from '@tauri-apps/api/core';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  clipMuted: boolean;
  autoShoutout: boolean;
  introductionMode: 'automatic' | 'manual';
  language: Language;
  onComplete: (id: string) => void;
};

export function RaidIntro({
  raid,
  duration,
  clipsEnabled,
  clipCount,
  clipMuted,
  autoShoutout,
  introductionMode,
  language,
  onComplete,
}: Props): React.JSX.Element | null {
  const { t, i18n } = useTranslation();
  const [remaining, setRemaining] = useState(duration);
  const [clipIndex, setClipIndex] = useState<number>();
  const clips = useMemo(
    () => (clipsEnabled ? (raid.clips ?? []).slice(0, clipCount) : []),
    [clipCount, clipsEnabled, raid.clips],
  );
  useEffect(() => {
    void i18n.changeLanguage(language);
  }, [i18n, language]);
  const finish = useCallback(() => {
    if (autoShoutout && raid.broadcasterUserId) {
      void invoke('send_twitch_shoutout', { raiderUserId: raid.broadcasterUserId }).catch(
        (error: unknown) => console.error(error),
      );
    }
    onComplete(raid.id);
  }, [autoShoutout, onComplete, raid.broadcasterUserId, raid.id]);
  const finishIntro = useCallback(() => {
    if (introductionMode === 'manual') {
      void invoke('notify_manual_raid_ready', { raid }).catch((error: unknown) =>
        console.error(error),
      );
      onComplete(raid.id);
      return;
    }
    if (clips.length > 0) setClipIndex(0);
    else finish();
  }, [clips.length, finish, introductionMode, onComplete, raid]);
  useEffect(() => {
    if (clipIndex !== undefined) return;
    const timer = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          finishIntro();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [clipIndex, finishIntro]);

  useEffect(() => {
    if (clipIndex === undefined) return;
    const clip = clips[clipIndex];
    if (!clip) {
      finish();
      return;
    }
    const timer = window.setTimeout(
      () => setClipIndex((current) => (current ?? 0) + 1),
      Math.max(clip.duration || 30, 1) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [clipIndex, clips, finish]);

  if (clipIndex !== undefined) {
    const clip = clips[clipIndex];
    if (!clip) return null;
    const separator = clip.embedUrl.includes('?') ? '&' : '?';
    const parent = window.location.hostname || 'localhost';
    const source = `${clip.embedUrl}${separator}parent=${encodeURIComponent(parent)}&autoplay=true&muted=${clipMuted}`;
    return (
      <aside className="raid-clip-player">
        <header>
          <strong>{t('clipHeading', { name: raid.displayName })}</strong>
          <span>{clip.title}</span>
        </header>
        <iframe
          key={clip.id}
          src={source}
          title={`${raid.displayName}: ${clip.title}`}
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      </aside>
    );
  }

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
