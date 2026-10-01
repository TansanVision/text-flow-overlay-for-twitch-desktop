import { invoke } from '@tauri-apps/api/core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { ChannelPointsPanel } from './channel-points-panel';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
let root: Root;
let container: HTMLDivElement;
let authorized: boolean;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  await i18n.changeLanguage('ja');
  authorized = false;
  vi.mocked(invoke).mockImplementation(async (command) =>
    command === 'get_channel_points' ? { authorized, rewards: [], jobs: [] } : undefined,
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
it('allows previews without authorization and disables reward creation', async () => {
  const authorize = vi.fn(async () => {});
  await act(async () =>
    root.render(<ChannelPointsPanel onAuthorize={authorize} authorizationBusy={false} />),
  );
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  const preview = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'テスト表示',
  );
  await act(async () => preview?.click());
  expect(invoke).toHaveBeenCalledWith('preview_channel_point_effect', { effect: 'hearts' });
  for (const [label, effect] of [['エモート噴水', 'emoteFountain']]) {
    const form = [...container.querySelectorAll('form')].find(
      (candidate) => candidate.querySelector('h3')?.textContent === label,
    );
    await act(async () => form?.querySelector<HTMLButtonElement>('button[type="button"]')?.click());
    expect(invoke).toHaveBeenCalledWith('preview_channel_point_effect', { effect });
  }
  expect(
    vi.mocked(invoke).mock.calls.some(([command]) => command === 'save_channel_point_reward'),
  ).toBe(false);
  const connect = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'ポイント管理を許可して接続',
  );
  await act(async () => connect?.click());
  expect(authorize).toHaveBeenCalledOnce();
});
it('creates an initially disabled reward and shows API errors', async () => {
  authorized = true;
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'get_channel_points') return { authorized, rewards: [], jobs: [] };
    if (command === 'save_channel_point_reward') throw new Error('Twitch API unavailable');
    return undefined;
  });
  await act(async () =>
    root.render(<ChannelPointsPanel onAuthorize={async () => {}} authorizationBusy={false} />),
  );
  await act(async () =>
    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(invoke).toHaveBeenCalledWith('save_channel_point_reward', {
    effect: 'hearts',
    cost: 100,
    cooldownSeconds: 30,
    enabled: false,
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'Twitch API unavailable',
  );
});
