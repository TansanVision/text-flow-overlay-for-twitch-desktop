import { listen } from '@tauri-apps/api/event';
import type React from 'react';
import { useEffect, useState } from 'react';
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
};

const MAX_LANES = 12;

export function Overlay(): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const unlisten = listen<ChatMessage>('twitch-chat-message', ({ payload }) => {
      setMessages((current) => [
        ...current,
        { ...payload, lane: Math.floor(Math.random() * MAX_LANES) },
      ]);
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
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
          style={{ top: `${message.lane * 8}vh` }}
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
