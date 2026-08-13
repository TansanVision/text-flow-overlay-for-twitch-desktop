import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type React from 'react';
import { useEffect, useState } from 'react';
import { type CommentSize, parseCommands } from './comment-command';
import './style.css';

type ChatFragment =
  | { type: 'text'; key: string; text: string }
  | {
      type: 'emote';
      key: string;
      text: string;
      url: string;
    };
type RenderFragment =
  | ChatFragment
  | { type: 'customStamp'; key: string; text: string; dataUri: string };
type CustomStamp = { commandName: string; dataUri: string };

type ChatMessage = {
  id: string;
  fragments: RenderFragment[];
  lane: number;
  size: CommentSize;
  color?: string;
  alignment: string;
};
type IncomingChatMessage = { id: string; fragments: ChatFragment[] };

type OverlaySettings = { commentDurationSeconds: number; defaultSize: CommentSize };
const defaultSettings: OverlaySettings = { commentDurationSeconds: 5, defaultSize: 'medium' };
const maxLanes = { small: 25, medium: 16, big: 7 };

function trimFragments(fragments: ChatFragment[], removeLength: number): ChatFragment[] {
  let remaining = removeLength;
  return fragments.flatMap((fragment) => {
    if (remaining <= 0) return [fragment];
    if (remaining >= fragment.text.length) {
      remaining -= fragment.text.length;
      return [];
    }
    if (fragment.type === 'emote') return [fragment];
    const trimmed = { ...fragment, text: fragment.text.slice(remaining) };
    remaining = 0;
    return [trimmed];
  });
}

function expandCustomStamps(
  fragments: ChatFragment[],
  stamps: Map<string, string>,
): RenderFragment[] {
  const expanded: RenderFragment[] = [];
  for (const fragment of fragments) {
    if (fragment.type === 'emote') {
      expanded.push(fragment);
      continue;
    }
    for (const [index, text] of fragment.text.split(/(\s+)/).filter(Boolean).entries()) {
      const dataUri = stamps.get(text);
      expanded.push(
        dataUri
          ? { type: 'customStamp', key: `${fragment.key}-${index}`, text, dataUri }
          : { ...fragment, key: `${fragment.key}-${index}`, text },
      );
    }
  }
  return expanded;
}

export function Overlay(): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [customStamps, setCustomStamps] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const unlisten = listen<IncomingChatMessage>('twitch-chat-message', ({ payload }) => {
      const fullText = payload.fragments.map((fragment) => fragment.text).join('');
      const commands = parseCommands(fullText);
      const size = commands.size ?? settings.defaultSize;
      setMessages((current) => [
        ...current,
        {
          ...payload,
          fragments: expandCustomStamps(
            trimFragments(payload.fragments, commands.removeLength),
            customStamps,
          ),
          size,
          color: commands.color,
          alignment: commands.alignment,
          lane: Math.floor(Math.random() * Math.max(maxLanes[size] - 2, 1)),
        },
      ]);
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [settings.defaultSize, customStamps]);

  useEffect(() => {
    void invoke<OverlaySettings>('get_overlay_settings').then(setSettings);
    const unlisten = listen<OverlaySettings>('overlay-settings-updated', ({ payload }) => {
      setSettings(payload);
    });
    return () => void unlisten.then((dispose) => dispose());
  }, []);

  useEffect(() => {
    const applyStamps = (stamps: CustomStamp[]) => {
      setCustomStamps(new Map(stamps.map((stamp) => [stamp.commandName, stamp.dataUri])));
    };
    void invoke<CustomStamp[]>('get_custom_stamps').then(applyStamps);
    const unlisten = listen<CustomStamp[]>('custom-stamps-updated', ({ payload }) => {
      applyStamps(payload);
    });
    return () => void unlisten.then((dispose) => dispose());
  }, []);

  const removeMessage = (id: string) => {
    setMessages((current) => current.filter((message) => message.id !== id));
  };

  return (
    <main className="overlay" aria-label="Twitch Text Flow Overlay">
      {messages.map((message) => (
        <p
          className="chat-message"
          key={message.id}
          data-size={message.size}
          data-alignment={message.alignment}
          style={{
            top:
              message.alignment === 'flow'
                ? `${message.lane * { small: 4, medium: 6, big: 18 }[message.size]}vh`
                : undefined,
            color: message.color,
            animationDuration: `${settings.commentDurationSeconds}s`,
          }}
          onAnimationEnd={() => removeMessage(message.id)}
        >
          {message.fragments.map((fragment) =>
            fragment.type === 'emote' ? (
              <img key={fragment.key} src={fragment.url} alt={fragment.text} />
            ) : fragment.type === 'customStamp' ? (
              <img key={fragment.key} src={fragment.dataUri} alt={fragment.text} />
            ) : (
              <span key={fragment.key}>{fragment.text}</span>
            ),
          )}
        </p>
      ))}
    </main>
  );
}
