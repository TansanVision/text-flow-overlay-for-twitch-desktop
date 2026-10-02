import type { CSSProperties } from 'react';
import './celebration-fireworks.css';

// Every burst, including its falling embers, ends inside the ten-second playback window.
const shells = [
  { x: 23, y: 37, delay: 0.85, radius: 19, color: '#ff98bf' },
  { x: 76, y: 31, delay: 1.7, radius: 21, color: '#87dfff' },
  { x: 35, y: 25, delay: 2.95, radius: 23, color: '#c4a3ff' },
  { x: 70, y: 43, delay: 4.05, radius: 20, color: '#9ff3cd' },
  { x: 22, y: 34, delay: 5.2, radius: 23, color: '#ffb78d' },
  { x: 79, y: 28, delay: 6.05, radius: 22, color: '#a9c6ff' },
  { x: 50, y: 35, delay: 7.2, radius: 31, color: '#ffdc83' },
];

export function CelebrationFireworks() {
  return (
    <div className="points-fireworks" aria-hidden="true">
      {shells.map((shell, index) => {
        const finale = index === shells.length - 1;
        const outerCount = finale ? 48 : 32;
        const innerCount = finale ? 24 : 16;
        return (
          <div
            className="points-firework"
            key={shell.delay}
            style={
              {
                left: `${shell.x}%`,
                top: `${shell.y}%`,
                color: shell.color,
                '--firework-launch-distance': `${100 - shell.y}vh`,
                '--firework-launch-delay': `${shell.delay - 0.85}s`,
                '--firework-delay': `${shell.delay}s`,
                '--firework-duration': finale ? '2.7s' : '2.4s',
                '--firework-ring-size': `${shell.radius * 0.7}vmin`,
              } as CSSProperties
            }
          >
            <span className="points-firework-rocket" />
            <span className="points-firework-ring" />
            <span className="points-firework-fall">
              {Array.from({ length: outerCount + innerCount }, (_, id) => {
                const inner = id >= outerCount;
                const angle =
                  ((id - (inner ? outerCount : 0)) / (inner ? innerCount : outerCount)) *
                    Math.PI *
                    2 +
                  (inner ? 0.13 : 0);
                const radius = shell.radius * (inner ? 0.52 : 0.88 + (id % 3) * 0.06);
                return (
                  <span
                    key={angle}
                    className="points-firework-spark"
                    style={
                      {
                        '--spark-x': `${Math.cos(angle) * radius}vmin`,
                        '--spark-y': `${Math.sin(angle) * radius}vmin`,
                        '--spark-angle': `${angle}rad`,
                        '--spark-size': finale ? '0.65vmin' : '0.5vmin',
                        color: inner ? '#fff3cf' : shell.color,
                      } as CSSProperties
                    }
                  >
                    <i />
                  </span>
                );
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
