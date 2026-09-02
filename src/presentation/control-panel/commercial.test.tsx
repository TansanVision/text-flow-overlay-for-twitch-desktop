import { invoke } from '@tauri-apps/api/core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { ControlPanel } from './control-panel';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

let root: Root;
let container: HTMLDivElement;
let commercialError: string | undefined;

function adButtons() {
  return [...container.querySelectorAll<HTMLButtonElement>('.commercial-buttons button')];
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  commercialError = undefined;
  vi.mocked(invoke).mockImplementation(async (command) => {
    switch (command) {
      case 'get_overlay_settings':
        return {
          language: 'ja',
          settingsVersion: 1,
          commentDurationSeconds: 5,
          defaultSize: 'medium',
          commentFont: 'system',
          raidClipsEnabled: true,
          raidClipCount: 5,
          raidIntroSeconds: 60,
          raidAutoShoutout: true,
          raidIntroductionMode: 'automatic',
          enabledEffects: [],
        };
      case 'get_custom_fonts':
        return [];
      case 'get_custom_stamp_editor_data':
        return { definitions: [], imageFiles: [], directoryPath: 'test-stamps' };
      case 'restore_twitch_authorization':
        return { status: 'authorized', login: 'tester', displayName: 'Tester' };
      case 'get_overlay_window_visibility':
        return true;
      case 'get_runtime_info':
        return { operatingSystem: 'Windows', architecture: 'x64' };
      case 'get_raid_clip_playback':
        return null;
      case 'start_twitch_commercial':
        if (commercialError) throw commercialError;
        return { length: 60, message: 'Twitch response detail', retryAfter: 480 };
      default:
        return undefined;
    }
  });
  await i18n.changeLanguage('ja');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<ControlPanel />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('reads the IPC result, displays success, and disables all ad buttons for retryAfter', async () => {
  await act(async () => adButtons()[1].click());
  expect(container.textContent).toContain('60秒の広告を開始しました');
  expect(container.textContent).toContain('Twitch response detail');
  expect(adButtons().every((button) => button.disabled)).toBe(true);
  await act(async () => vi.advanceTimersByTime(479_000));
  expect(container.textContent).toContain('次の広告まであと1秒');
  expect(adButtons().every((button) => button.disabled)).toBe(true);
  await act(async () => vi.advanceTimersByTime(1000));
  expect(adButtons().every((button) => !button.disabled)).toBe(true);
});

it('sends only one ad request when buttons are clicked before the next render', async () => {
  const buttons = adButtons();
  await act(async () => {
    buttons[0].click();
    buttons[1].click();
  });
  expect(
    vi.mocked(invoke).mock.calls.filter(([name]) => name === 'start_twitch_commercial'),
  ).toHaveLength(1);
});

it('displays a rejected ad request without success or an automatic retry', async () => {
  commercialError = '広告を開始できませんでした (429 Too Many Requests)。しばらく待ってください。';
  await act(async () => adButtons()[0].click());
  expect(container.textContent).toContain(commercialError);
  expect(container.textContent).not.toContain('秒の広告を開始しました');
  await act(async () => vi.advanceTimersByTime(600_000));
  expect(
    vi.mocked(invoke).mock.calls.filter(([name]) => name === 'start_twitch_commercial'),
  ).toHaveLength(1);
});
