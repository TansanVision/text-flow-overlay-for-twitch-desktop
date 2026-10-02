export function shouldFilterComment(text: string): boolean {
  const trimmed = text.trim();
  if (/^!/.test(trimmed)) return true;
  if (/\(bsr\s+[0-9a-z]+\)/i.test(trimmed)) return true;
  if (/requested by @/i.test(trimmed)) return true;
  if (/added to queue/i.test(trimmed)) return true;
  if (/now playing/i.test(trimmed)) return true;
  if (/\burl\b/i.test(trimmed)) return true;
  if (/https?:\/\/\S+/i.test(trimmed)) return true;
  if (/www\.\S+/i.test(trimmed)) return true;
  return false;
}

export type TextToken = { text: string; keyword?: string };

type InlineFragment = {
  type: 'text' | 'emote' | 'customStamp' | 'externalEmote';
  text: string;
};

export function removeSpacesBetweenStamps<T extends InlineFragment>(fragments: T[]): T[] {
  const result: T[] = [];
  for (let index = 0; index < fragments.length; index += 1) {
    const start = index;
    while (
      index < fragments.length &&
      fragments[index].type === 'text' &&
      /^[^\S\r\n]*$/.test(fragments[index].text)
    ) {
      index += 1;
    }
    if (index > start) {
      const previous = fragments[start - 1];
      const next = fragments[index];
      if (!previous || previous.type === 'text' || !next || next.type === 'text') {
        result.push(...fragments.slice(start, index));
      }
    }
    if (index < fragments.length) result.push(fragments[index]);
  }
  return result;
}

export function splitByBreaklineCommand(text: string): string[] {
  return text.split(/[ \t]*U\+2003[ \t]*/);
}

export function tokenizeKeywords(text: string, keywords: Set<string>): TextToken[] {
  if (keywords.size === 0) return text ? [{ text }] : [];
  const tokens: TextToken[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/\S+/g)) {
    const value = match[0];
    const index = match.index ?? 0;
    if (!keywords.has(value)) continue;
    if (index > cursor) tokens.push({ text: text.slice(cursor, index) });
    tokens.push({ text: value, keyword: value });
    cursor = index + value.length;
  }
  if (cursor < text.length) tokens.push({ text: text.slice(cursor) });
  return tokens;
}
