import { expect, it } from 'vitest';
import { removeSpacesBetweenStamps } from './comment-pipeline';

const twitch = { type: 'emote', text: 'Kappa', url: 'twitch.png' } as const;
const custom = { type: 'customStamp', text: 'stamp', dataUri: 'custom.png' } as const;
const external = { type: 'externalEmote', text: 'Wave', url: 'external.png' } as const;
const text = (value: string) => ({ type: 'text' as const, text: value });

it('removes separator spaces between consecutive Twitch, custom and external stamps', () => {
  const fragments = [twitch, text(' '), custom, text('  \t　'), external, text(' '), twitch];
  expect(removeSpacesBetweenStamps(fragments)).toEqual([twitch, custom, external, twitch]);
  expect(fragments).toHaveLength(7);
});

it('handles a separator split across multiple text fragments', () => {
  expect(removeSpacesBetweenStamps([custom, text(' '), text(''), text('\t'), custom])).toEqual([
    custom,
    custom,
  ]);
});

it('preserves spaces in ordinary text, around text and at line edges', () => {
  const fragments = [text(' '), twitch, text(' hello  world '), custom, text(' ')];
  expect(removeSpacesBetweenStamps(fragments)).toEqual(fragments);
  const splitText = [twitch, text(' '), text('hello'), text(' '), custom];
  expect(removeSpacesBetweenStamps(splitText)).toEqual(splitText);
});

it('preserves line breaks and the explicit breakline command', () => {
  for (const separator of ['\n', '\r\n', ' U+2003 ']) {
    const fragments = [twitch, text(separator), custom];
    expect(removeSpacesBetweenStamps(fragments)).toEqual(fragments);
  }
});

it('keeps messages without separators unchanged', () => {
  expect(removeSpacesBetweenStamps([])).toEqual([]);
  expect(removeSpacesBetweenStamps([twitch])).toEqual([twitch]);
  expect(removeSpacesBetweenStamps([twitch, custom])).toEqual([twitch, custom]);
  expect(removeSpacesBetweenStamps([text('hello  world')])).toEqual([text('hello  world')]);
});
