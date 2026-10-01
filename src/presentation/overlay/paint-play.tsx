import type { CSSProperties } from 'react';
import './paint-play.css';

const colors = ['#ff729d', '#69d5f5', '#ffce64', '#b99aff', '#72e0b3', '#ff9b6d'];
const positions = [
  [17, 61],
  [81, 28],
  [33, 21],
  [67, 70],
  [48, 43],
  [12, 28],
  [87, 63],
  [36, 74],
  [66, 24],
  [27, 47],
  [73, 48],
  [50, 19],
  [19, 74],
  [84, 40],
  [43, 61],
  [16, 41],
  [61, 76],
  [77, 19],
  [34, 31],
  [60, 47],
];

// Rounded, uneven lobes give each splash a paint-like outline.
function splashPath(variant: number) {
  const points = Array.from({ length: 24 }, (_, id) => {
    const angle = (id / 24) * Math.PI * 2;
    const radius = id % 2 ? 26 + ((id * 7 + variant * 3) % 8) : 43 + ((id * 11 + variant * 7) % 16);
    return { x: 80 + Math.cos(angle) * radius, y: 70 + Math.sin(angle) * radius };
  });
  const first = points[0];
  const last = points[points.length - 1];
  return `M ${(first.x + last.x) / 2} ${(first.y + last.y) / 2} ${points
    .map((point, id) => {
      const next = points[(id + 1) % points.length];
      return `Q ${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`;
    })
    .join(' ')} Z`;
}
const shapes = [0, 1, 2].map(splashPath);
const splashes = positions.map(([x, y], id) => ({
  id,
  x,
  y,
  size: 18 + (id % 4) * 2.5,
  delay: (id / (positions.length - 1)) * 6.6,
  rotation: ((id * 37) % 80) - 40,
}));
const droplets = Array.from({ length: 8 }, (_, id) => ({
  id,
  angle: id * 45,
  radius: 61 + (id % 3) * 5,
}));

export function PaintPlay() {
  return (
    <div className="points-paint-play" aria-hidden="true">
      {splashes.map((splash) => (
        <div
          className="points-paint-splash"
          key={splash.id}
          style={
            {
              left: `${splash.x}%`,
              top: `${splash.y}%`,
              width: `${splash.size}vmin`,
              color: colors[splash.id % colors.length],
              '--paint-delay': `${splash.delay}s`,
            } as CSSProperties
          }
        >
          <svg viewBox="0 0 160 180" aria-hidden="true">
            <g className="points-paint-drip" fill="currentColor">
              <rect x="67" y="90" width="7" height="51" rx="3.5" />
              <rect x="90" y="86" width="5" height="35" rx="2.5" />
            </g>
            <g transform={`rotate(${splash.rotation} 80 70)`}>
              <g className="points-paint-droplets" fill="currentColor">
                {droplets.map((droplet) => (
                  <ellipse
                    key={droplet.id}
                    cx={80 + droplet.radius}
                    cy="70"
                    rx={3 + (droplet.id % 3)}
                    ry="2.5"
                    transform={`rotate(${droplet.angle} 80 70)`}
                  />
                ))}
              </g>
              <path d={shapes[splash.id % shapes.length]} fill="currentColor" />
              <path
                d="M55 61 Q60 45 76 45 M49 73 L50 70"
                fill="none"
                stroke="#fff"
                strokeWidth="3.5"
                strokeLinecap="round"
                opacity="0.38"
              />
              <ellipse cx="94" cy="86" rx="10" ry="5" fill="#fff" opacity="0.12" />
            </g>
          </svg>
        </div>
      ))}
    </div>
  );
}
