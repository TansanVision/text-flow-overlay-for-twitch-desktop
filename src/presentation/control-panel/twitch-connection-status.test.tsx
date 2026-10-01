import { invoke } from '@tauri-apps/api/core';
import { type Event, listen } from '@tauri-apps/api/event';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { type TwitchConnection, TwitchConnectionStatus } from './twitch-connection-status';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

let container: HTMLDivElement;
let root: Root;
let notify: (event: Event<TwitchConnection>) => void;
const dispose = vi.fn();
const authorize = vi.fn(async () => {});

function state(phase: TwitchConnection['phase'], revision: number): TwitchConnection {
  return { phase, revision, retryInSeconds: null, unavailableSubscriptions: [] };
}

async function emit(payload: TwitchConnection) {
  await act(async () => notify({ event: 'twitch-connection-updated', id: 1, payload }));
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  await i18n.changeLanguage('ja');
  vi.mocked(listen).mockImplementation(async (_event, callback) => {
    notify = callback as typeof notify;
    return dispose;
  });
  vi.mocked(invoke).mockImplementation(async (command) =>
    command === 'get_twitch_connection' ? state('connecting', 1) : undefined,
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('shows transport health, retry wait, and recovery without requiring login again', async () => {
  await act(async () => root.render(<TwitchConnectionStatus onReauthorize={authorize} />));
  expect(container.textContent).toContain('コメント受信の準備中');
  await emit(state('connected', 2));
  expect(container.textContent).toContain('接続正常');
  await emit({ ...state('reconnecting', 3), retryInSeconds: 5 });
  expect(container.textContent).toContain('約5秒');
  await act(async () => container.querySelector('button')?.click());
  expect(invoke).toHaveBeenCalledWith('reconnect_twitch');
  expect(authorize).not.toHaveBeenCalled();
  await emit(state('connected', 4));
  expect(container.textContent).not.toContain('約5秒');
  expect(container.querySelector('button')).toBeNull();
});

it('keeps a newer pushed status when the initial snapshot arrives late', async () => {
  let resolve: (value: TwitchConnection) => void = () => {};
  vi.mocked(invoke).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await act(async () => root.render(<TwitchConnectionStatus onReauthorize={authorize} />));
  await emit(state('reauthorizationRequired', 5));
  await act(async () => resolve(state('connected', 2)));
  expect(container.textContent).toContain('再認証が必要');
  await emit(state('connecting', 3));
  expect(container.textContent).toContain('再認証が必要');
});

it('clears the expired session before opening reauthorization and disposes its listener', async () => {
  await act(async () => root.render(<TwitchConnectionStatus onReauthorize={authorize} />));
  await emit(state('reauthorizationRequired', 2));
  await act(async () => container.querySelector('button')?.click());
  expect(invoke).toHaveBeenCalledWith('logout_twitch');
  expect(authorize).toHaveBeenCalledOnce();
  expect(vi.mocked(invoke).mock.invocationCallOrder.at(-1)).toBeLessThan(
    authorize.mock.invocationCallOrder[0],
  );
  await act(async () => root.render(null));
  expect(dispose).toHaveBeenCalledOnce();
});

it('shows unavailable optional notifications while keeping chat healthy', async () => {
  await act(async () => root.render(<TwitchConnectionStatus onReauthorize={authorize} />));
  await emit({
    ...state('connected', 2),
    unavailableSubscriptions: ['channel.cheer', 'channel.raid'],
  });
  expect(container.textContent).toContain('接続正常');
  expect(container.textContent).toContain('Bits / Raid');
  expect(container.textContent).toContain('今すぐ再接続');
  expect(container.textContent).not.toContain('再認証が必要');
});

it('identifies a failed moderation subscription instead of calling it a subscription gift event', async () => {
  await act(async () => root.render(<TwitchConnectionStatus onReauthorize={authorize} />));
  await emit({
    ...state('connected', 2),
    unavailableSubscriptions: ['channel.chat.clear', 'channel.chat.message_delete'],
  });
  expect(container.textContent).toContain('コメント削除・モデレーション同期');
  expect(container.textContent).not.toContain('サブスク・ギフト');
  expect(container.textContent).toContain('今すぐ再接続');
});
