import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EmoteFountain } from './emote-fountain';

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('uses the registered stamps and replaces a broken image with a smiley', async () => {
  await act(async () =>
    root.render(
      <EmoteFountain
        stamps={[
          { dataUri: 'data:image/png;base64,AA==' },
          { dataUri: 'data:image/png;base64,BB==' },
        ]}
      />,
    ),
  );
  const images = [...container.querySelectorAll('img')];
  expect(new Set(images.map((image) => image.src))).toEqual(
    new Set(['data:image/png;base64,AA==', 'data:image/png;base64,BB==']),
  );
  await act(async () => images[0].dispatchEvent(new Event('error')));
  expect(container.querySelectorAll('.points-fountain-icon svg')).toHaveLength(1);
  expect(container.querySelectorAll('img')).toHaveLength(images.length - 1);
});

it('shows smileys with no custom stamps and keeps every particle within the eight-second playback', async () => {
  await act(async () => root.render(<EmoteFountain stamps={[]} />));
  expect(container.querySelectorAll('img')).toHaveLength(0);
  expect(container.querySelectorAll('.points-fountain-icon svg').length).toBeGreaterThan(0);
  for (const shot of container.querySelectorAll<HTMLElement>('.points-fountain-shot')) {
    const delay = Number.parseFloat(shot.style.getPropertyValue('--fountain-delay'));
    const duration = Number.parseFloat(shot.style.getPropertyValue('--fountain-duration'));
    expect(delay + duration).toBeLessThanOrEqual(8);
  }
});
