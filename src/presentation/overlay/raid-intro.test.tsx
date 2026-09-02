import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipPlaybackControls } from '../control-panel/clip-playback-controls';
import i18n from '../i18n';
import type { RaidClipPlayback } from '../shared/raid-clip-playback';
import { RaidIntro } from './raid-intro';
import overlayStyles from './style.css?raw';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

type Callback = (event: { event: string; id: number; payload: unknown }) => void;
const events = new Map<string, Set<Callback>>();
let current: RaidClipPlayback | null;
let root: Root;
let container: HTMLDivElement;
let rejectSkip: boolean;
let getSnapshot: (() => Promise<RaidClipPlayback | null>) | undefined;

function emit(event: string, payload: unknown) {
  for (const callback of [...(events.get(event) ?? [])]) callback({ event, id: 0, payload });
}

function calls(command: string) {
  return vi.mocked(invoke).mock.calls.filter(([name]) => name === command);
}

function props(overrides: Partial<ComponentProps<typeof RaidIntro>> = {}) {
  return {
    raid: {
      id: 'raid-1',
      displayName: 'Raider',
      login: 'raider',
      broadcasterUserId: '123',
      viewerCount: 10,
      clips: [1, 2, 3].map((number) => ({
        id: String(number),
        title: `Clip ${number}`,
        embedUrl: `https://clips.twitch.tv/embed?clip=clip${number}`,
        duration: 10,
        viewCount: 1,
      })),
    },
    duration: 60,
    clipsEnabled: true,
    clipCount: 3,
    autoShoutout: true,
    introductionMode: 'automatic' as const,
    language: 'ja' as const,
    initialPhase: 'clips' as const,
    onComplete: vi.fn(),
    ...overrides,
  };
}

async function render(raidProps = props(), controlsOnly = false) {
  await act(async () => {
    root.render(
      <>
        <ClipPlaybackControls />
        {!controlsOnly && <RaidIntro {...raidProps} />}
      </>,
    );
  });
}

async function skip() {
  const button = container.querySelector('button');
  expect(button?.textContent).toBe('このクリップをスキップ');
  await act(async () => button?.click());
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  current = null;
  rejectSkip = false;
  getSnapshot = undefined;
  events.clear();
  vi.mocked(listen).mockImplementation(async (event, callback) => {
    const callbacks = events.get(event) ?? new Set<Callback>();
    callbacks.add(callback);
    events.set(event, callbacks);
    return () => {
      callbacks.delete(callback);
    };
  });
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    const request = args as { playbackId: string; playback: RaidClipPlayback | null };
    if (command === 'get_raid_clip_playback') return getSnapshot ? getSnapshot() : current;
    if (command === 'set_raid_clip_playback') {
      if (request.playback || current?.playbackId === request.playbackId) {
        current = request.playback;
        emit('raid-clip-playback-updated', current);
      }
    }
    if (command === 'skip_raid_clip') {
      if (rejectSkip) throw new Error('IPC failed');
      if (current?.playbackId !== request.playbackId) return false;
      emit('raid-clip-skip-requested', { playbackId: request.playbackId });
      return true;
    }
    return undefined;
  });
  await i18n.changeLanguage('ja');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('clip skip controls and Raid progression', () => {
  it('keeps the clip stacking context above every comment and effect layer', async () => {
    const style = document.createElement('style');
    style.textContent = overlayStyles;
    document.head.append(style);
    try {
      await render();
      const player = container.querySelector('.raid-clip-player');
      expect(player).not.toBeNull();
      if (!player) throw new Error('Clip player is missing');
      const playerStyle = window.getComputedStyle(player);
      expect(playerStyle.zIndex).toBe('2000');
      const playerZ = Number(playerStyle.zIndex);
      for (const className of [
        'chat-message',
        'falling-stamps',
        'built-in-effect',
        'custom-command-help',
        'raid-intro',
      ]) {
        const sibling = document.createElement('div');
        sibling.className = className;
        player.parentElement?.append(sibling);
        const siblingZ = Number.parseInt(window.getComputedStyle(sibling).zIndex, 10) || 0;
        expect(playerZ, className).toBeGreaterThan(siblingZ);
        sibling.remove();
      }
    } finally {
      style.remove();
    }
  });

  it('creates a visible iframe after the intro instead of revealing a hidden iframe', async () => {
    await render(props({ initialPhase: 'intro', duration: 1 }));
    expect(container.querySelector('iframe')).toBeNull();
    await act(async () => vi.advanceTimersByTime(1000));
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    if (!iframe) throw new Error('Clip iframe is missing');
    expect(iframe.width).toBe('800');
    expect(iframe.height).toBe('540');
    expect(window.getComputedStyle(iframe).display).not.toBe('none');
    expect(window.getComputedStyle(iframe).visibility).toBe('visible');
  });

  it('shows only during clips and skips exactly one clip even on a double click', async () => {
    await render(props(), true);
    expect(container.querySelector('button')).toBeNull();
    await render();
    expect(container.textContent).toContain('1 / 3本目');
    const oldId = current?.playbackId;
    const button = container.querySelector('button');
    await act(async () => {
      button?.click();
      button?.click();
    });
    expect(calls('skip_raid_clip')).toHaveLength(1);
    expect(current?.clipNumber).toBe(2);
    expect(container.querySelector('iframe')?.src).toContain('clip=clip2');
    await act(async () => emit('raid-clip-skip-requested', { playbackId: oldId }));
    expect(current?.clipNumber).toBe(2);
  });

  it('continues automatic shoutout exactly once after skipping the last clip', async () => {
    const raidProps = props();
    await render(raidProps);
    await skip();
    await skip();
    await skip();
    expect(calls('send_twitch_shoutout')).toEqual([
      ['send_twitch_shoutout', { raiderUserId: '123' }],
    ]);
    expect(raidProps.onComplete).toHaveBeenCalledExactlyOnceWith('raid-1');
    expect(current).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('does not send an automatic shoutout when the setting is off', async () => {
    await render(props({ clipCount: 1, autoShoutout: false }));
    await skip();
    expect(calls('send_twitch_shoutout')).toHaveLength(0);
    expect(calls('notify_raid_phase')).toContainEqual([
      'notify_raid_phase',
      { raidId: 'raid-1', phase: 'shoutout-disabled' },
    ]);
  });

  it('finishes manual clip playback without sending a shoutout', async () => {
    const raidProps = props({ clipsOnly: true, clipCount: 1 });
    await render(raidProps);
    await skip();
    expect(calls('notify_manual_raid_clips_completed')).toEqual([
      ['notify_manual_raid_clips_completed', { raidId: 'raid-1' }],
    ]);
    expect(calls('send_twitch_shoutout')).toHaveLength(0);
    expect(raidProps.onComplete).toHaveBeenCalledOnce();
    expect(current).toBeNull();
  });

  it('preserves manual intro behavior and does not show a skip button during intro', async () => {
    const raidProps = props({ initialPhase: 'intro', introductionMode: 'manual', duration: 1 });
    await render(raidProps);
    expect(container.querySelector('button')).toBeNull();
    await act(async () => vi.advanceTimersByTime(1000));
    expect(calls('notify_manual_raid_ready')).toHaveLength(1);
    expect(calls('send_twitch_shoutout')).toHaveLength(0);
    expect(calls('set_raid_clip_playback')).toHaveLength(0);
    expect(raidProps.onComplete).toHaveBeenCalledOnce();
  });

  it('does not advance twice when skip and the clip timeout overlap', async () => {
    await render();
    const playbackId = current?.playbackId;
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      emit('raid-clip-skip-requested', { playbackId });
    });
    expect(current?.clipNumber).toBe(2);
    await act(async () => vi.advanceTimersByTime(9999));
    expect(current?.clipNumber).toBe(2);
    await act(async () => vi.advanceTimersByTime(1));
    expect(current?.clipNumber).toBe(3);
  });

  it('shows an error and allows retry if sending a skip fails', async () => {
    await render();
    rejectSkip = true;
    await skip();
    expect(current?.clipNumber).toBe(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('IPC failed');
    expect(container.querySelector('button')?.disabled).toBe(false);
    rejectSkip = false;
    await skip();
    expect(current?.clipNumber).toBe(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('restores current controls after a control-panel reload', async () => {
    current = {
      playbackId: 'existing',
      raidId: 'raid-2',
      displayName: 'Existing Raider',
      title: 'Already playing',
      clipNumber: 2,
      clipCount: 5,
    };
    await render(props(), true);
    expect(container.textContent).toContain('Already playing');
    expect(container.textContent).toContain('2 / 5本目');
  });

  it('does not overwrite a newer event with a delayed initial snapshot', async () => {
    let resolve: (playback: RaidClipPlayback | null) => void = () => {};
    getSnapshot = () =>
      new Promise((complete) => {
        resolve = complete;
      });
    await render(props(), true);
    await act(async () => {
      emit('raid-clip-playback-updated', {
        playbackId: 'new',
        raidId: 'raid',
        displayName: 'Raider',
        title: 'New clip',
        clipNumber: 1,
        clipCount: 1,
      });
      resolve(null);
    });
    expect(container.textContent).toContain('New clip');
  });

  it('keeps the button disabled until the overlay advances, even after IPC returns', async () => {
    current = {
      playbackId: 'waiting',
      raidId: 'raid',
      displayName: 'Raider',
      title: 'Current clip',
      clipNumber: 1,
      clipCount: 1,
    };
    await render(props(), true);
    await skip();
    expect(container.querySelector('button')?.disabled).toBe(true);
    expect(container.querySelector('button')?.textContent).toBe('スキップ中…');
  });
});
