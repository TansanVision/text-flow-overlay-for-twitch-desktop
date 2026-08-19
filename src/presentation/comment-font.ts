export const commentFonts = [
  'system',
  'yu-gothic',
  'meiryo',
  'biz-udp-gothic',
  'ms-gothic',
  'yu-mincho',
  'biz-udp-mincho',
  'ms-mincho',
  'arial',
  'verdana',
  'georgia',
  'monospace',
] as const;

export type StandardCommentFont = (typeof commentFonts)[number];
export type CommentFont = StandardCommentFont | `custom:${string}`;
export type CustomFont = {
  id: `custom:${string}`;
  name: string;
  fileName: string;
  dataUri: string;
};

const commentFontFamilies: Record<StandardCommentFont, string> = {
  system: 'system-ui, sans-serif',
  'yu-gothic': '"Yu Gothic", YuGothic, Meiryo, sans-serif',
  meiryo: 'Meiryo, "メイリオ", sans-serif',
  'biz-udp-gothic': '"BIZ UDPGothic", "Yu Gothic", Meiryo, sans-serif',
  'ms-gothic': '"MS Gothic", "ＭＳ ゴシック", monospace',
  'yu-mincho': '"Yu Mincho", YuMincho, serif',
  'biz-udp-mincho': '"BIZ UDPMincho", "Yu Mincho", serif',
  'ms-mincho': '"MS Mincho", "ＭＳ 明朝", serif',
  arial: 'Arial, Meiryo, sans-serif',
  verdana: 'Verdana, Meiryo, sans-serif',
  georgia: 'Georgia, "Yu Mincho", serif',
  monospace: '"Cascadia Mono", Consolas, monospace',
};

export function isStandardCommentFont(font: CommentFont): font is StandardCommentFont {
  return (commentFonts as readonly string[]).includes(font);
}

export function getCommentFontFamily(
  font: CommentFont,
  customFontFamilies: ReadonlyMap<string, string> = new Map(),
): string {
  return isStandardCommentFont(font)
    ? commentFontFamilies[font]
    : (customFontFamilies.get(font) ?? commentFontFamilies.system);
}

let installedCustomFontFaces: FontFace[] = [];

export async function installCustomFonts(
  fonts: CustomFont[],
): Promise<{ families: Map<string, string>; availableFonts: CustomFont[]; errors: string[] }> {
  for (const face of installedCustomFontFaces) document.fonts.delete(face);
  installedCustomFontFaces = [];

  const families = new Map<string, string>();
  const availableFonts: CustomFont[] = [];
  const errors: string[] = [];
  for (const [index, font] of fonts.entries()) {
    const family = `TTFO Custom Font ${index}`;
    try {
      const face = await new FontFace(family, `url(${JSON.stringify(font.dataUri)})`).load();
      document.fonts.add(face);
      installedCustomFontFaces.push(face);
      families.set(font.id, `"${family}", system-ui, sans-serif`);
      availableFonts.push(font);
    } catch (error) {
      errors.push(`${font.fileName}: ${String(error)}`);
    }
  }
  return { families, availableFonts, errors };
}
