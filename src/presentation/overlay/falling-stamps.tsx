import type React from 'react';
import { useEffect, useMemo, useRef } from 'react';

type Props = { id: string; src: string; onComplete: (id: string) => void };
type Item = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  angularVelocity: number;
  delay: number;
};

export function FallingStamps({ id, src, onComplete }: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemKeys = useMemo(
    () => Array.from({ length: Math.floor(Math.random() * 16) + 5 }, () => crypto.randomUUID()),
    [],
  );
  const count = itemKeys.length;

  useEffect(() => {
    const timeout = window.setTimeout(() => onComplete(id), 10_000);
    return () => window.clearTimeout(timeout);
  }, [id, onComplete]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const { width, height } = container.getBoundingClientRect();
    const items: Item[] = Array.from({ length: count }, () => {
      const size = 40 + Math.random() * 90;
      return {
        x: size / 2 + Math.random() * Math.max(width - size, 1),
        y: -size * Math.random() * 50,
        vx: -Math.random() * 2,
        vy: 1 + Math.random() * 2,
        size,
        angle: Math.random() * 360,
        angularVelocity: -3 + Math.random() * 6,
        delay: Math.random() * 800,
      };
    });
    const images = Array.from(container.querySelectorAll('img'));
    const start = performance.now();
    let animationFrame = 0;
    const animate = (time: number) => {
      const elapsed = time - start;
      for (const [index, item] of items.entries()) {
        if (elapsed < item.delay) continue;
        item.vy += 0.35;
        item.x += item.vx;
        item.y += item.vy;
        item.angle += item.angularVelocity;
        const floor = height - item.size;
        if (item.y > floor) {
          item.y = floor;
          item.vy *= -0.38;
          item.vx *= 0.96;
          item.angularVelocity *= 0.92;
          if (Math.abs(item.vy) < 1) item.vy = 0;
        }
        if (item.x <= 0 || item.x >= width - item.size) item.vx *= -0.6;
        const image = images[index];
        image.style.width = `${item.size}px`;
        image.style.height = `${item.size}px`;
        image.style.transform = `translate3d(${item.x}px, ${item.y}px, 0) rotate(${item.angle}deg)`;
        image.style.opacity = '1';
      }
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [count]);

  return (
    <div className="falling-stamps" ref={containerRef}>
      {itemKeys.map((itemKey) => (
        <img key={itemKey} src={src} draggable={false} alt="" />
      ))}
    </div>
  );
}
