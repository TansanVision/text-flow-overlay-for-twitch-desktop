import { type CSSProperties, useId } from 'react';
import './soap-bubbles.css';

// Staggered lifetimes leave time for the last pop before playback ends at ten seconds.
const bubbles = Array.from({ length: 64 }, (_, id) => ({
  id,
  left: 6 + ((id * 37) % 89),
  size: id % 11 === 0 ? 12 : 3.5 + ((id * 7) % 12) * 0.55,
  rise: 43 + ((id * 17) % 43),
  sway: (id % 2 ? 1 : -1) * (1.5 + (id % 4)),
  delay: (id / 63) * 5.8,
  duration: 3.2 + (id % 5) * 0.2,
}));
const droplets = Array.from({ length: 6 }, (_, id) => ({
  id,
  angle: id * 60,
}));

export function SoapBubbles() {
  const gradientId = useId();
  return (
    <div className="points-soap-bubbles" aria-hidden="true">
      <svg className="points-bubble-definitions" aria-hidden="true">
        <defs>
          <linearGradient id={`${gradientId}-rim`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.24" stopColor="#b3eaff" />
            <stop offset="0.49" stopColor="#edb5ff" />
            <stop offset="0.72" stopColor="#ffdfa4" />
            <stop offset="1" stopColor="#9bf2dc" />
          </linearGradient>
          <radialGradient id={`${gradientId}-film`} cx="32%" cy="25%" r="75%">
            <stop offset="0" stopColor="#fff" stopOpacity="0.24" />
            <stop offset="0.4" stopColor="#b4e9ff" stopOpacity="0.04" />
            <stop offset="0.75" stopColor="#f1b7ff" stopOpacity="0.1" />
            <stop offset="1" stopColor="#99f2db" stopOpacity="0.3" />
          </radialGradient>
        </defs>
      </svg>
      {bubbles.map((bubble) => (
        <span
          className="points-bubble-rise"
          key={bubble.id}
          style={
            {
              left: `${bubble.left}%`,
              '--bubble-size': `${bubble.size}vmin`,
              '--bubble-rise': `${-bubble.rise}vh`,
              '--bubble-sway': `${bubble.sway}vw`,
              '--bubble-delay': `${bubble.delay}s`,
              '--bubble-duration': `${bubble.duration}s`,
            } as CSSProperties
          }
        >
          <span className="points-bubble-sway">
            <svg className="points-bubble-film" viewBox="0 0 100 100" aria-hidden="true">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill={`url(#${gradientId}-film)`}
                stroke={`url(#${gradientId}-rim)`}
                strokeWidth="2"
              />
              <path
                d="M18 40 A34 34 0 0 1 40 17"
                fill="none"
                stroke="#fff"
                strokeWidth="4"
                strokeLinecap="round"
                opacity="0.85"
              />
              <path
                d="M62 86 A38 38 0 0 0 85 65"
                fill="none"
                stroke="#ffddf6"
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.75"
              />
              <ellipse cx="30" cy="29" rx="5" ry="3" fill="#fff" opacity="0.6" />
            </svg>
            <svg className="points-bubble-pop" viewBox="0 0 100 100" aria-hidden="true">
              {droplets.map((droplet) => (
                <path
                  key={droplet.id}
                  d="M50 12 L50 5"
                  transform={`rotate(${droplet.angle} 50 50)`}
                  fill="none"
                  stroke={droplet.id % 2 ? '#ffd6f2' : '#bdf5ff'}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              ))}
            </svg>
          </span>
        </span>
      ))}
    </div>
  );
}
