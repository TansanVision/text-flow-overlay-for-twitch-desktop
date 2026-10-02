import type { CSSProperties } from 'react';
import './meteor-shower.css';

// Use the same unit for both axes so the trail follows the flight direction at any aspect ratio.
const flight = { x: -95, y: 60 };
const trailAngle = (Math.atan2(-flight.y, -flight.x) * 180) / Math.PI;
const meteors = [
  ...Array.from({ length: 48 }, (_, id) => ({
    id,
    x: 25 + ((id * 37) % 84),
    y: -8 + ((id * 19) % 57),
    delay: (id / 47) * 7.1,
    duration: 1.1 + (id % 4) * 0.2,
    length: 12 + (id % 5) * 3,
    size: 0.8 + (id % 3) * 0.25,
    color: ['#b4e8ff', '#ddd1ff', '#e7f5ff'][id % 3],
    finale: false,
  })),
  {
    id: 48,
    x: 75,
    y: 10,
    delay: 7.8,
    duration: 1.9,
    length: 36,
    size: 2.5,
    color: '#ffe5a3',
    finale: true,
  },
];
const twinkles = Array.from({ length: 36 }, (_, id) => ({
  id,
  x: 5 + ((id * 43) % 91),
  y: 8 + ((id * 29) % 77),
  delay: (id / 35) * 7.8,
}));

function Star() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 0 L24 16 L40 20 L24 24 L20 40 L16 24 L0 20 L16 16Z" fill="currentColor" />
    </svg>
  );
}

export function MeteorShower() {
  return (
    <div className="points-meteor-shower" aria-hidden="true">
      {twinkles.map((twinkle) => (
        <span
          className="points-meteor-twinkle"
          key={twinkle.id}
          style={
            {
              left: `${twinkle.x}%`,
              top: `${twinkle.y}%`,
              '--twinkle-delay': `${twinkle.delay}s`,
            } as CSSProperties
          }
        >
          <Star />
        </span>
      ))}
      {meteors.map((meteor) => (
        <span
          className="points-meteor"
          data-finale={meteor.finale}
          key={meteor.id}
          style={
            {
              left: `${meteor.x}%`,
              top: `${meteor.y}%`,
              color: meteor.color,
              '--meteor-x': `${flight.x}vmin`,
              '--meteor-y': `${flight.y}vmin`,
              '--meteor-angle': `${trailAngle}deg`,
              '--meteor-delay': `${meteor.delay}s`,
              '--meteor-duration': `${meteor.duration}s`,
              '--meteor-length': `${meteor.length}vmin`,
              '--meteor-size': `${meteor.size}vmin`,
            } as CSSProperties
          }
        >
          <span className="points-meteor-trail" />
          <span className="points-meteor-head">
            <Star />
          </span>
        </span>
      ))}
    </div>
  );
}
