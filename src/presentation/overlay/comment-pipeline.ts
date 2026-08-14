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
