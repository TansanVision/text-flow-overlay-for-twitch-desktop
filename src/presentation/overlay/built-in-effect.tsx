import type React from 'react';
import { useEffect, useMemo } from 'react';
import type { EffectCommand } from './comment-command';

const definitions: Record<EffectCommand, { count: number; lifetime: number }> = {
  sakura: { count: 50, lifetime: 30 },
  snow: { count: 80, lifetime: 30 },
  balloons: { count: 35, lifetime: 15 },
  kamifubuki: { count: 80, lifetime: 16 },
  rain: { count: 9, lifetime: 30 },
  maruta: { count: 8, lifetime: 23 },
  chikuwa: { count: 8, lifetime: 23 },
  marutai: { count: 8, lifetime: 23 },
};

type Props = { id: string; type: EffectCommand; onComplete: (id: string) => void };

function ObjectGraphic({ type }: { type: EffectCommand }): React.JSX.Element | null {
  if (type === 'maruta')
    return (
      <svg viewBox="0 0 200 60">
        <title>丸太</title>
        <rect x="10" y="10" width="160" height="40" rx="20" fill="#8b5a2b" />
        <circle cx="10" cy="30" r="20" fill="#deb887" />
        <circle cx="10" cy="30" r="13" fill="none" stroke="#c09060" strokeWidth="3" />
        <path
          d="M30 20 Q80 10 150 25 M30 40 Q90 55 150 35"
          stroke="#5a3a1a"
          strokeWidth="3"
          fill="none"
        />
      </svg>
    );
  if (type === 'chikuwa')
    return (
      <svg viewBox="0 0 260 80">
        <title>ちくわ</title>
        <defs>
          <linearGradient id="chikuwa-body" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fdf5e6" />
            <stop offset="50%" stopColor="#f5e0b8" />
            <stop offset="100%" stopColor="#fdf5e6" />
          </linearGradient>
        </defs>
        <rect x="10" y="15" width="240" height="50" rx="25" fill="url(#chikuwa-body)" />
        <circle cx="10" cy="40" r="25" fill="#fdf5e6" />
        <circle cx="10" cy="40" r="13" fill="#f5e0b8" />
        <circle cx="10" cy="40" r="7" fill="#fdf5e6" />
        <circle cx="250" cy="40" r="25" fill="#fdf5e6" />
        <circle cx="250" cy="40" r="13" fill="#f5e0b8" />
        <circle cx="250" cy="40" r="7" fill="#fdf5e6" />
        <g fill="#b5652a" opacity=".7">
          <ellipse cx="70" cy="30" rx="14" ry="8" />
          <ellipse cx="120" cy="50" rx="16" ry="9" />
          <ellipse cx="170" cy="32" rx="12" ry="7" />
          <ellipse cx="210" cy="48" rx="10" ry="6" />
        </g>
      </svg>
    );
  if (type === 'marutai')
    return (
      <svg viewBox="0 0 50 50">
        <title>棒ラーメン</title>
        <circle cx="25" cy="25" r="24" fill="#e5e5e5" stroke="#aaa" />
        <circle cx="25" cy="25" r="19" fill="#c78b50" />
        <path
          d="M15 25q10-10 20 0q-10 10-20 0q10-10 20 0"
          fill="none"
          stroke="#f7e7b5"
          strokeWidth="2"
        />
        <circle cx="33" cy="30" r="6" fill="#c48a6a" />
        <circle cx="18" cy="20" r="4" fill="#fff" stroke="#ff7aa2" />
      </svg>
    );
  return null;
}

export function BuiltInEffect({ id, type, onComplete }: Props): React.JSX.Element {
  const definition = definitions[type];
  const particles = useMemo(
    () =>
      Array.from({ length: definition.count }, (_, index) => ({
        id: `${id}-${index}`,
        left:
          type === 'sakura'
            ? (index / definition.count) * 100
            : type === 'rain'
              ? (index + 1) * 10
              : Math.random() * 100,
        delay:
          type === 'sakura'
            ? [0, 9, 2, 5, 6, 7, 3, 1, 2, 11, 10][index % 11]
            : type === 'rain'
              ? Math.random() * 3
              : Math.random() * 5,
        duration:
          type === 'rain'
            ? 3
            : ['maruta', 'chikuwa', 'marutai'].includes(type)
              ? 2 + ((index * 13) % 20) / 10
              : type === 'sakura'
                ? [5, 12, 8, 6][index % 4]
                : 5 + Math.random() * 8,
        size: type === 'sakura' ? [1, 0.8, 0.6][index % 3] : 0.3 + Math.random() * 0.7,
        color: ['#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#5f27cd'][index % 5],
        drift: index % 2 === 0 ? '15vw' : '-15vw',
      })),
    [definition.count, id, type],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => onComplete(id), definition.lifetime * 1000);
    return () => window.clearTimeout(timeout);
  }, [definition.lifetime, id, onComplete]);

  return (
    <div className="built-in-effect" data-effect={type} aria-hidden="true">
      {particles.map((particle) => (
        <span
          key={particle.id}
          style={
            {
              left: `${particle.left}%`,
              animationDelay: `${particle.delay}s`,
              animationDuration: `${particle.duration}s`,
              '--particle-size': `${particle.size}vw`,
              '--particle-color': particle.color,
              '--particle-drift': particle.drift,
            } as React.CSSProperties
          }
        >
          <ObjectGraphic type={type} />
        </span>
      ))}
    </div>
  );
}
