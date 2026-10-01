import { type CSSProperties, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlaybackView } from './use-channel-point-effects';
import './channel-point-effects.css';

const flowerColors = ['#ffadc9', '#ffe39d', '#c7b5ff', '#fff3de', '#ffb79c', '#acdbea'];
const flowerCount = () =>
  Math.ceil(window.innerWidth / Math.max(window.innerHeight * 0.055, 1)) + 2;

function FlowerBed() {
  const [count, setCount] = useState(flowerCount);
  useEffect(() => {
    const resize = () => setCount(flowerCount());
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  return (
    <div className="points-flower-bed">
      {[0, 1].map((row) => (
        <div className="points-flower-row" data-row={row} key={row}>
          {Array.from({ length: count }, (_, index) => {
            const seed = index * 7 + row * 11;
            const style = {
              left: `${(index - 0.5 + row * 0.5) * 5.5}vh`,
              height: `${(row === 0 ? 13 : 8) + (seed % 5)}vh`,
              '--flower-delay': `${(index / count) * 1.3 + row * 0.25}s`,
              '--flower-lean': `${(seed % 9) - 4}deg`,
            } as CSSProperties;
            return (
              <div className="points-flower-stem" style={style} key={seed}>
                <svg className="points-flower" viewBox="0 0 100 130" aria-hidden="true">
                  <path
                    d="M50 132 Q58 85 50 52"
                    fill="none"
                    stroke="#74b88b"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                  <path
                    d="M52 106 Q17 110 21 83 Q43 82 52 106 M53 86 Q85 88 82 64 Q59 67 53 86"
                    fill={row === 0 ? '#65a97f' : '#95d5a1'}
                  />
                  <g className="points-petals">
                    {[0, 60, 120, 180, 240, 300].map((angle) => (
                      <ellipse
                        key={angle}
                        cx="50"
                        cy="29"
                        rx={seed % 2 ? 13 : 10}
                        ry="21"
                        fill={flowerColors[seed % flowerColors.length]}
                        transform={`rotate(${angle} 50 48)`}
                      />
                    ))}
                    <circle cx="50" cy="48" r="10" fill="#ffe8a1" />
                    <circle cx="47" cy="45" r="3" fill="#fff5d6" opacity="0.8" />
                  </g>
                </svg>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const hearts = Array.from({ length: 72 }, (_, id) => ({
  id,
  left: 2 + ((id * 37) % 96),
  size: 2.2 + (id % 5) * 0.65,
  delay: (id / 71) * 6.2,
  duration: 2.7 + (id % 4) * 0.3,
  rise: 40 + ((id * 13) % 40),
  drift: ((id * 7) % 13) - 6,
  color: ['#ff8db5', '#ffc2d9', '#e6b5ff', '#fff0f6', '#ffadca', '#f29ccc'][id % 6],
}));

function FloatingHearts() {
  return (
    <div className="points-hearts">
      {hearts.map((heart) => (
        <svg
          key={heart.id}
          className="points-heart"
          viewBox="0 0 40 40"
          aria-hidden="true"
          style={
            {
              left: `${heart.left}%`,
              width: `${heart.size}vh`,
              color: heart.color,
              '--heart-delay': `${heart.delay}s`,
              '--heart-duration': `${heart.duration}s`,
              '--heart-rise': `${-heart.rise}vh`,
              '--heart-drift': `${heart.drift}vw`,
              '--heart-tilt': `${heart.drift * 3}deg`,
            } as CSSProperties
          }
        >
          <path
            d="M20 35C16 31 3 22 3 12C3 2 16 0 20 10C24 0 37 2 37 12C37 22 24 31 20 35Z"
            fill="currentColor"
          />
          <path
            d="M9 12C9 8 12 7 14 8"
            fill="none"
            stroke="#fff"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.65"
          />
        </svg>
      ))}
    </div>
  );
}

export function ChannelPointVisual({ view, paused }: { view?: PlaybackView; paused: boolean }) {
  const { t } = useTranslation();
  if (!view || view.phase === 'done') return null;
  return (
    <div className="points-visual" data-paused={paused} aria-hidden="true">
      {view.job.effect === 'flower' && <FlowerBed />}
      {view.job.effect === 'hearts' && <FloatingHearts />}
      {view.job.preview && view.phase === 'active' && view.job.effect === 'gravity' && (
        <div className={`points-preview points-${view.job.effect}`}>
          <span>{t('pointsPreviewComment')}</span>
        </div>
      )}
      {view.job.effect === 'gravity' && (
        <div className="points-gravity-cue">
          <i />
          <i />
          <i />
        </div>
      )}
    </div>
  );
}
