export type CommentSize = 'small' | 'medium' | 'big';
export type CommentAlignment =
  | 'flow'
  | 'ue'
  | 'naka'
  | 'shita'
  | 'migi'
  | 'hidari'
  | 'migiue'
  | 'migishita'
  | 'hidariue'
  | 'hidarishita';
export type EffectCommand =
  | 'sakura'
  | 'snow'
  | 'balloons'
  | 'kamifubuki'
  | 'rain'
  | 'maruta'
  | 'chikuwa'
  | 'marutai';

const sizes = new Set(['small', 'medium', 'big']);
const alignments = new Set([
  'ue',
  'naka',
  'shita',
  'migi',
  'hidari',
  'migiue',
  'migishita',
  'hidariue',
  'hidarishita',
]);
const effects = new Set([
  'sakura',
  'snow',
  'balloons',
  'kamifubuki',
  'rain',
  'maruta',
  'chikuwa',
  'marutai',
]);
export const colors: Record<string, string> = {
  white: '#ffffff',
  red: '#ff0000',
  orange: '#ffa500',
  blue: '#0000ff',
  green: '#00ff00',
  yellow: '#ffff00',
  pink: '#ff69b4',
  cyan: '#00ffff',
  purple: '#800080',
  black: '#000000',
  white2: '#cccc99',
  niconicowhite: '#cccc99',
  red2: '#cc0033',
  truered: '#cc0033',
  pink2: '#ff77ff',
  orange2: '#ff6600',
  passionorange: '#ff6600',
  yellow2: '#999900',
  madyellow: '#999900',
  cyan2: '#00cccc',
  blue2: '#3399ff',
  marineblue: '#3399ff',
  purple2: '#6633cc',
  nobleviolet: '#6633cc',
  black2: '#333333',
  elementalgreen: '#00cc66',
  green2: '#00cc66',
};

export type ParsedCommands = {
  size?: CommentSize;
  color?: string;
  alignment: CommentAlignment;
  effect?: EffectCommand;
  removeLength: number;
};

export function parseCommands(text: string): ParsedCommands {
  const matches = [...text.matchAll(/\S+/g)];
  const result: ParsedCommands = { alignment: 'flow', removeLength: 0 };
  for (const match of matches) {
    const command = match[0].toLowerCase();
    if (sizes.has(command)) result.size ??= command as CommentSize;
    else if (alignments.has(command)) result.alignment = command as CommentAlignment;
    else if (effects.has(command)) result.effect ??= command as EffectCommand;
    else if (command in colors) result.color ??= colors[command];
    else break;
    result.removeLength = (match.index ?? 0) + match[0].length;
    while (/\s/.test(text[result.removeLength] ?? '')) result.removeLength += 1;
  }
  return result;
}
