import { invoke } from '@tauri-apps/api/core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PointsJob } from '../shared/channel-points';
import { useChannelPointEffects } from './use-channel-point-effects';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
let root: Root;
let container: HTMLDivElement;
let result: ReturnType<typeof useChannelPointEffects>;
let job: PointsJob | null;
const source = {
  userId: 'viewer',
  broadcasterUserId: 'channel',
  messageId: 'message',
  sentAt: '2026-09-29T00:00:00Z',
};
function Harness({ blocked = false }: { blocked?: boolean }) {
  result = useChannelPointEffects(blocked);
  return <div>{result.view?.phase}</div>;
}
async function advance(ms: number) {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  job = {
    id: 'redemption',
    broadcasterId: 'channel',
    userId: 'viewer',
    effect: 'hearts',
    status: 'playing',
    createdAt: Date.now(),
    startedAt: Date.now(),
    preview: false,
    error: null,
  };
  vi.mocked(invoke).mockImplementation(async (command) =>
    command === 'claim_channel_point_effect' ? job : undefined,
  );
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
it('plays hearts immediately without decorating comments and acknowledges only once after ten seconds', async () => {
  await act(async () => root.render(<Harness />));
  expect(result.view?.phase).toBe('active');
  expect(result.decorate(source)).toBeUndefined();
  await advance(9900);
  expect(result.view?.phase).toBe('active');
  expect(
    vi.mocked(invoke).mock.calls.some(([command]) => command === 'finish_channel_point_effect'),
  ).toBe(false);
  await advance(100);
  expect(invoke).toHaveBeenCalledWith('finish_channel_point_effect', {
    id: 'redemption',
    success: true,
  });
  await advance(5000); // A stale playing response must not restart or re-acknowledge the effect.
  expect(
    vi.mocked(invoke).mock.calls.filter(([command]) => command === 'finish_channel_point_effect'),
  ).toHaveLength(1);
});
it.each(['hearts', 'gravity', 'fireworks', 'bubbles', 'paint', 'meteors'] as const)(
  'pauses %s during a raid and resumes its ten-second window',
  async (effect) => {
    if (job) job.effect = effect;
    await act(async () => root.render(<Harness />));
    await advance(4000);
    await act(async () => root.render(<Harness blocked />));
    expect(result.decorate(source)).toBeUndefined();
    await advance(20_000);
    expect(result.view?.phase).toBe('active');
    await act(async () => root.render(<Harness />));
    expect(result.decorate(source)?.type).toBe(effect === 'gravity' ? 'gravity' : undefined);
    await advance(6000);
    expect(result.view).toBeUndefined();
  },
);
it('stops a canceled effect and never acknowledges it', async () => {
  await act(async () => root.render(<Harness />));
  job = null;
  await advance(500);
  expect(result.view).toBeUndefined();
  await advance(35_000);
  expect(
    vi.mocked(invoke).mock.calls.some(([command]) => command === 'finish_channel_point_effect'),
  ).toBe(false);
});
it('previews without waiting for a comment and retries a lost completion response', async () => {
  if (job) job.preview = true;
  let attempts = 0;
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'claim_channel_point_effect') return job;
    if (command === 'finish_channel_point_effect' && ++attempts === 1) throw new Error('offline');
    return undefined;
  });
  await act(async () => root.render(<Harness />));
  expect(result.view?.phase).toBe('active');
  await advance(12_000);
  expect(attempts).toBe(2);
  expect(result.view).toBeUndefined();
});
it('cleans up timers on unmount', async () => {
  await act(async () => root.render(<Harness />));
  await act(async () => root.render(null));
  const calls = vi.mocked(invoke).mock.calls.length;
  await advance(60_000);
  expect(vi.mocked(invoke).mock.calls).toHaveLength(calls);
});

it.each([false, true])(
  'finishes the fountain after eight seconds (preview=%s)',
  async (preview) => {
    if (job) {
      job.effect = 'emoteFountain';
      job.preview = preview;
    }
    await act(async () => root.render(<Harness />));
    await advance(7900);
    expect(result.view?.phase).toBe('active');
    expect(
      vi.mocked(invoke).mock.calls.some(([command]) => command === 'finish_channel_point_effect'),
    ).toBe(false);
    await advance(100);
    expect(result.view).toBeUndefined();
    expect(invoke).toHaveBeenCalledWith('finish_channel_point_effect', {
      id: 'redemption',
      success: true,
    });
  },
);
