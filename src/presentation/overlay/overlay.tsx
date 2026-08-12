import type React from 'react';
import './style.css';

export function Overlay(): React.JSX.Element {
  return (
    <main className="overlay" aria-label="Twitch Text Flow Overlay">
      <p className="overlay__status">Overlay ready</p>
    </main>
  );
}
