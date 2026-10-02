import { type CSSProperties, useMemo, useState } from 'react';
import './emote-fountain.css';

export type FountainStamp = { dataUri: string };

const particles = Array.from({ length: 84 }, (_, id) => ({
  id,
  origin: [28, 50, 72][id % 3],
  drift: ((id * 17) % 41) - 20,
  rise: 38 + ((id * 13) % 35),
  size: 4.5 + (id % 5) * 0.65,
  delay: (id / 83) * 4.4,
  duration: 2.5 + (id % 4) * 0.3,
  rotation: (id % 2 ? 1 : -1) * (90 + ((id * 19) % 180)),
}));

function FountainIcon({ source, variant }: { source?: string; variant: number }) {
  const [failed, setFailed] = useState(false);
  if (source && !failed) {
    return <img src={source} alt="" draggable={false} onError={() => setFailed(true)} />;
  }
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle
        cx="32"
        cy="32"
        r="28"
        fill={['#ffd879', '#ffa6c9', '#b6ddff'][variant % 3]}
        stroke="#fff"
        strokeWidth="2"
      />
      <ellipse cx="23" cy="27" rx="3" ry="4" fill="#514057" />
      <ellipse cx="41" cy="27" rx="3" ry="4" fill="#514057" />
      <path
        d="M22 39 Q32 51 42 39"
        fill="none"
        stroke="#514057"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <ellipse cx="16" cy="36" rx="5" ry="3" fill="#ff8daa" opacity="0.6" />
      <ellipse cx="48" cy="36" rx="5" ry="3" fill="#ff8daa" opacity="0.6" />
    </svg>
  );
}

export function EmoteFountain({ stamps }: { stamps: readonly FountainStamp[] }) {
  const sources = useMemo(
    () => [...new Set(stamps.map((stamp) => stamp.dataUri).filter(Boolean))].slice(0, 24),
    [stamps],
  );
  return (
    <div className="points-emote-fountain" aria-hidden="true">
      {particles.map((particle) => {
        const source = sources.length ? sources[particle.id % sources.length] : undefined;
        return (
          <span
            key={particle.id}
            className="points-fountain-shot"
            style={
              {
                left: `${particle.origin}%`,
                '--fountain-size': `${particle.size}vh`,
                '--fountain-drift': `${particle.drift}vw`,
                '--fountain-rise': `${-particle.rise}vh`,
                '--fountain-delay': `${particle.delay}s`,
                '--fountain-duration': `${particle.duration}s`,
                '--fountain-rotation': `${particle.rotation}deg`,
              } as CSSProperties
            }
          >
            <span className="points-fountain-arc">
              <span className="points-fountain-icon">
                <FountainIcon key={source ?? 'default'} source={source} variant={particle.id} />
              </span>
            </span>
          </span>
        );
      })}
    </div>
  );
}
