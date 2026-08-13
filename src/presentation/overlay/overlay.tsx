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

type ChatMessage = {
  id: string;
  fragments: ChatFragment[];
  lane: number;
  size: CommentSize;
  color?: string;
  alignment: string;
};

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

export function Overlay(): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState(defaultSettings);

  useEffect(() => {
    const unlisten = listen<ChatMessage>('twitch-chat-message', ({ payload }) => {
      const fullText = payload.fragments.map((fragment) => fragment.text).join('');
      const commands = parseCommands(fullText);
      const size = commands.size ?? settings.defaultSize;
      setMessages((current) => [
        ...current,
        {
          ...payload,
          fragments: trimFragments(payload.fragments, commands.removeLength),
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
  }, [settings.defaultSize]);

  useEffect(() => {
    void invoke<OverlaySettings>('get_overlay_settings').then(setSettings);
    const unlisten = listen<OverlaySettings>('overlay-settings-updated', ({ payload }) => {
      setSettings(payload);
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
            ) : (
              <span key={fragment.key}>{fragment.text}</span>
            ),
          )}
        </p>
      ))}
    </main>
  );
}
