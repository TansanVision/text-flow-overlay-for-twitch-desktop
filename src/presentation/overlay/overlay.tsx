import { listen } from '@tauri-apps/api/event';
import type React from 'react';
import { useEffect, useState } from 'react';
import './style.css';

type ChatMessage = { id: string; userName: string; text: string; color: string };

export function Overlay(): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const unlisten = listen<ChatMessage>('twitch-chat-message', ({ payload }) => {
      setMessages((current) => [...current.slice(-19), payload]);
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  return (
    <main className="overlay" aria-label="Twitch Text Flow Overlay">
      <div className="chat-flow">
        {messages.map((message) => (
          <p className="chat-message" key={message.id}>
            <strong style={{ color: message.color }}>{message.userName}</strong>
            <span>{message.text}</span>
          </p>
        ))}
      </div>
    </main>
  );
}
