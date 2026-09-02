import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { ControlPanel } from './control-panel';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

it('starts login without passing a frontend Client ID', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  const verificationUri = 'https://www.twitch.tv/activate';
  vi.mocked(invoke).mockImplementation(async (command) => {
    switch (command) {
      case 'get_overlay_settings':
        return { language: 'ja', commentFont: 'system', enabledEffects: [] };
      case 'get_custom_fonts':
        return [];
      case 'get_custom_stamp_editor_data':
        return { definitions: [], imageFiles: [], directoryPath: 'test-stamps' };
      case 'restore_twitch_authorization':
        return { status: 'disconnected' };
      case 'get_runtime_info':
        return { operatingSystem: 'Windows', architecture: 'x64' };
      case 'get_raid_clip_playback':
        return null;
      case 'start_twitch_device_authorization':
        return { verificationUri, userCode: 'TESTCODE', interval: 5, expiresIn: 1800 };
      default:
        return undefined;
    }
  });
  await i18n.changeLanguage('ja');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ControlPanel />));
    const button = [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Twitchに接続',
    );
    expect(button).toBeDefined();
    await act(async () => button?.click());
    expect(
      vi
        .mocked(invoke)
        .mock.calls.filter(([command]) => command === 'start_twitch_device_authorization'),
    ).toEqual([['start_twitch_device_authorization']]);
    expect(openUrl).toHaveBeenCalledWith(verificationUri);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
