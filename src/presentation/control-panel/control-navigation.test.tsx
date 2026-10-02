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

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  await i18n.changeLanguage('ja');
  vi.mocked(invoke).mockImplementation(async (command) => {
    switch (command) {
      case 'get_overlay_settings':
        return {
          language: 'ja',
          settingsVersion: 1,
          defaultSize: 'medium',
          commentFont: 'system',
          commentDurationSeconds: 5,
          enabledEffects: [],
          raidClipCount: 5,
          raidIntroSeconds: 60,
          raidClipsEnabled: true,
          raidAutoShoutout: true,
          raidIntroductionMode: 'automatic',
        };
      case 'get_custom_fonts':
        return [];
      case 'get_custom_stamp_editor_data':
        return { definitions: [], imageFiles: [], directoryPath: 'test-stamps' };
      case 'get_channel_points':
        return { authorized: true, rewards: [], jobs: [] };
      case 'restore_twitch_authorization':
        return { status: 'authorized', login: 'tester', displayName: 'Tester' };
      case 'get_raid_clip_playback':
        return null;
      default:
        return undefined;
    }
  });
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
async function selectPage(page: string) {
  const button = container.querySelector<HTMLButtonElement>(
    `nav button[aria-controls="control-page-${page}"]`,
  );
  expect(button).not.toBeNull();
  await act(async () => button?.click());
  expect(button?.getAttribute('aria-current')).toBe('page');
}
async function inputValue(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector);
  expect(input).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it('shows only the selected page and retains unsaved settings when switching pages', async () => {
  expect(container.querySelectorAll('.control-page:not([hidden])')).toHaveLength(1);
  await selectPage('comments');
  await inputValue('#comment-duration', '12');
  for (const page of ['raid', 'assets', 'tools', 'live', 'comments']) {
    await selectPage(page);
    expect(container.querySelectorAll('.control-page:not([hidden])')).toHaveLength(1);
    expect(container.querySelector(`#control-page-${page}`)?.hasAttribute('hidden')).toBe(false);
  }
  expect(container.querySelector<HTMLInputElement>('#comment-duration')?.value).toBe('12');
  expect(container.querySelector('.connection-summary')?.textContent).toContain('Tester');
  const save = [
    ...container.querySelectorAll<HTMLButtonElement>('#control-page-comments button'),
  ].find((button) => button.textContent === '設定を保存');
  await act(async () => save?.click());
  expect(invoke).toHaveBeenCalledWith('save_overlay_settings', {
    settings: expect.objectContaining({ commentDurationSeconds: 12 }),
  });
});
it('keeps one reward editor visible and retains its draft across effect, page, and polling changes', async () => {
  await selectPage('points');
  await inputValue('#points-cost-hearts', '750');
  const choose = async (effect: string) => {
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(`.points-choice[aria-controls="points-editor-${effect}"]`)
        ?.click(),
    );
  };
  await choose('meteors');
  expect(container.querySelectorAll('[id^="points-editor-"]:not([hidden])')).toHaveLength(1);
  expect(container.querySelector('#points-editor-meteors')?.hasAttribute('hidden')).toBe(false);
  await selectPage('live');
  await act(async () => vi.advanceTimersByTimeAsync(2500));
  await selectPage('points');
  await choose('hearts');
  expect(container.querySelector<HTMLInputElement>('#points-cost-hearts')?.value).toBe('750');
  await act(async () =>
    container
      .querySelector('#points-editor-hearts form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(invoke).toHaveBeenCalledWith('save_channel_point_reward', {
    effect: 'hearts',
    cost: 750,
    cooldownSeconds: 30,
    enabled: false,
  });
});
