import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import type { PointsJob } from '../shared/channel-points';
import { type ChatModeration, ChatModerationHistory, type ChatSource } from './chat-moderation';
import { Overlay } from './overlay';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('./built-in-effect', () => ({
  BuiltInEffect: ({ id }: { id: string }) => <div data-effect={id} />,
}));
vi.mock('./falling-stamps', () => ({
  FallingStamps: ({ id }: { id: string }) => <div data-stamp={id} />,
}));
vi.mock('./raid-intro', () => ({ RaidIntro: () => <div data-raid="true" /> }));
vi.mock('./custom-command-help', () => ({
  CustomCommandHelp: ({ id, onComplete }: { id: string; onComplete: (id: string) => void }) => (
    <button type="button" data-help={id} onClick={() => onComplete(id)}>
      Finish help
    </button>
  ),
}));

type Callback = (event: { event: string; id: number; payload: unknown }) => void;
const events = new Map<string, Set<Callback>>();
let root: Root;
let container: HTMLDivElement;
let pointsJob: PointsJob | null = null;
const before = '2026-09-29T03:00:00.123456788Z';
const cutoff = '2026-09-29T03:00:00.123456789Z';
const after = '2026-09-29T03:00:00.123456790Z';

function source(messageId: string, userId = 'user-a', sentAt = before): ChatSource {
  return { messageId, userId, broadcasterUserId: 'channel', sentAt };
}

function emit(event: string, payload: unknown) {
  for (const callback of [...(events.get(event) ?? [])]) callback({ event, id: 0, payload });
}

function chat(id: string, text: string, userId = 'user-a', sentAt = before) {
  emit('twitch-chat-message', {
    id,
    fragments: [{ type: 'text', key: '0', text }],
    authorName: 'Same display name',
    interactionType: 'comment',
    source: source(id, userId, sentAt),
  });
}

function moderation(action: ChatModeration) {
  emit('twitch-chat-moderation', action);
}
function texts() {
  return [...container.querySelectorAll('.chat-message')].map((item) => item.textContent);
}
const scope = { broadcasterUserId: 'channel', sentAt: cutoff };

beforeEach(async () => {
  pointsJob = null;
  await i18n.changeLanguage('ja');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  events.clear();
  vi.mocked(listen).mockImplementation(async (event, callback) => {
    const callbacks = events.get(event) ?? new Set<Callback>();
    callbacks.add(callback as Callback);
    events.set(event, callbacks);
    return () => {
      callbacks.delete(callback as Callback);
    };
  });
  vi.mocked(invoke).mockImplementation(async (command) => {
    switch (command) {
      case 'claim_channel_point_effect':
        return pointsJob;
      case 'get_overlay_settings':
        return {
          language: 'ja',
          settingsVersion: 1,
          commentDurationSeconds: 5,
          defaultSize: 'medium',
          commentFont: 'system',
          enabledEffects: ['snow'],
          raidClipsEnabled: true,
          raidClipCount: 5,
          raidIntroSeconds: 60,
          raidAutoShoutout: true,
          raidIntroductionMode: 'automatic',
        };
      case 'get_custom_fonts':
        return [];
      case 'get_custom_stamps':
        return [
          { commandName: 'drop', dataUri: 'data:image/png;base64,AA==', effectType: 'falling' },
        ];
      case 'get_external_emotes':
        return { emotes: [] };
      default:
        return undefined;
    }
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Overlay />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('renders consecutive emotes without separator spans and preserves text and line breaks', async () => {
  await act(async () => {
    emit('twitch-chat-message', {
      id: 'emotes',
      fragments: [
        { type: 'text', key: '0', text: 'hello  world ' },
        { type: 'emote', key: '1', text: 'Kappa', url: 'kappa.png' },
        { type: 'text', key: '2', text: '  ' },
        { type: 'emote', key: '3', text: 'Kappa', url: 'kappa.png' },
        { type: 'text', key: '4', text: ' U+2003 ' },
        { type: 'emote', key: '5', text: 'Kappa', url: 'kappa.png' },
        { type: 'text', key: '6', text: ' goodbye' },
      ],
    });
  });
  const lines = [...container.querySelectorAll('.chat-line')];
  expect(lines).toHaveLength(2);
  expect([...lines[0].children].map((element) => element.tagName)).toEqual(['SPAN', 'IMG', 'IMG']);
  expect(lines[0].textContent).toBe('hello  world ');
  expect([...lines[1].children].map((element) => element.tagName)).toEqual(['IMG', 'SPAN']);
  expect(lines[1].textContent).toBe(' goodbye');
});

it('removes a deleted message and its effects and stamps while preserving other messages', async () => {
  await act(async () => {
    chat('removed', 'snow drop remove-me');
    chat('kept', 'keep-me', 'user-b');
  });
  expect(container.querySelector('[data-effect]')).not.toBeNull();
  expect(container.querySelector('[data-stamp]')).not.toBeNull();
  await act(async () =>
    moderation({
      ...scope,
      broadcasterUserId: 'other-channel',
      type: 'deleteMessage',
      messageId: 'removed',
    }),
  );
  expect(texts()).toHaveLength(2);
  await act(async () => moderation({ ...scope, type: 'deleteMessage', messageId: 'removed' }));
  expect(texts()).toEqual(['keep-me']);
  expect(container.querySelector('[data-effect]')).toBeNull();
  expect(container.querySelector('[data-stamp]')).toBeNull();
});

it('plays hearts independently of chat and keeps them when a comment is moderated', async () => {
  pointsJob = {
    id: 'points',
    broadcasterId: 'channel',
    userId: 'user-a',
    effect: 'hearts',
    status: 'playing',
    createdAt: Date.now(),
    startedAt: Date.now(),
    preview: false,
    error: null,
  };
  await act(async () => root.render(<Overlay key="points-test" />));
  await act(async () => {
    chat('filtered', '!command');
    chat('empty', '   ');
    chat('other', 'other viewer', 'user-b');
    chat('decorated', 'my next comment');
    chat('later', 'later comment');
  });
  expect(container.querySelectorAll('.points-heart')).toHaveLength(72);
  expect(container.querySelector('.points-trail')).toBeNull();
  await act(async () => moderation({ ...scope, type: 'deleteMessage', messageId: 'decorated' }));
  expect(container.querySelector('.points-trail')).toBeNull();
  expect(container.querySelectorAll('.points-heart')).toHaveLength(72);
  expect(texts()).toEqual(['other viewer', 'later comment']);
});

it('clears by user ID including active and queued help, and allows later posts from that user', async () => {
  await act(async () => {
    chat('one', 'first');
    chat('two', 'second');
    chat('other', 'same-name-different-user', 'user-b');
    chat('help-active', '!helpcs');
    chat('help-pending', '!helpcs');
    chat('help-kept', '!helpcs', 'user-b');
  });
  expect(container.querySelector('[data-help]')?.getAttribute('data-help')).toBe('help-active');
  await act(async () => moderation({ ...scope, type: 'clearUser', userId: 'user-a' }));
  expect(texts()).toEqual(['same-name-different-user']);
  expect(container.querySelector('[data-help]')?.getAttribute('data-help')).toBe('help-kept');
  await act(async () => {
    chat('delayed', 'old-post', 'user-a', before);
    chat('new', 'new-post', 'user-a', after);
  });
  expect(texts()).toEqual(['same-name-different-user', 'new-post']);
});

it('clears all chat-origin content without removing Raid or independent support notices', async () => {
  await act(async () => {
    chat('one', 'snow drop old-one');
    chat('two', 'old-two', 'user-b');
    chat('help', '!helpcs');
    emit('twitch-raid', { id: 'raid', displayName: 'Raider', login: 'raider', viewerCount: 1 });
    emit('twitch-chat-message', {
      id: 'support',
      interactionType: 'cheer',
      fragments: [{ type: 'text', key: '0', text: 'Bits notice' }],
    });
    moderation({ ...scope, type: 'clear' });
    chat('late', 'snow drop delayed');
    chat('new', 'after-clear', 'user-b', after);
  });
  expect(texts()).toEqual(['Bits notice', 'after-clear']);
  expect(container.querySelector('[data-effect]')).toBeNull();
  expect(container.querySelector('[data-stamp]')).toBeNull();
  expect(container.querySelector('[data-help]')).toBeNull();
  expect(container.querySelector('[data-raid]')).not.toBeNull();
});

it('blocks chat arriving after its deletion, including duplicate events and help requests', async () => {
  await act(async () => {
    for (let i = 0; i < 2; i += 1) {
      moderation({ ...scope, type: 'deleteMessage', messageId: 'late' });
      moderation({ ...scope, type: 'deleteMessage', messageId: 'help' });
      chat('late', 'snow drop deleted');
      chat('help', '!helpcs');
    }
  });
  expect(texts()).toEqual([]);
  expect(container.querySelector('[data-effect], [data-stamp], [data-help]')).toBeNull();
});

it('does not roll back a newer user clear when an older event arrives late', () => {
  const history = new ChatModerationHistory();
  history.record({ ...scope, type: 'clearUser', userId: 'user-a', sentAt: after }, 1);
  history.record({ ...scope, type: 'clearUser', userId: 'user-a', sentAt: before }, 2);
  expect(history.removes(source('between', 'user-a', cutoff), 3)).toBe(true);
  expect(history.removes(source('different', 'user-b', cutoff), 3)).toBe(false);
  expect(history.removes({ ...source('other-channel'), broadcasterUserId: 'other' }, 3)).toBe(
    false,
  );
});

it('bounds deletion history by count and lifetime', () => {
  const history = new ChatModerationHistory();
  for (let i = 0; i <= 10_000; i += 1)
    history.record({ ...scope, type: 'deleteMessage', messageId: String(i) }, 0);
  expect(history.removes(source('0'), 0)).toBe(false);
  expect(history.removes(source('10000'), 0)).toBe(true);
  expect(history.removes(source('10000'), 600_000)).toBe(false);
});

it('disposes moderation and chat listeners when the overlay unmounts', async () => {
  await act(async () => root.render(null));
  expect(events.get('twitch-chat-moderation')?.size).toBe(0);
  expect(events.get('twitch-chat-message')?.size).toBe(0);
});
