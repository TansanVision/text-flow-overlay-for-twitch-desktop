import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type CommentFont,
  type CustomFont,
  getCommentFontFamily,
  installCustomFonts,
} from '../comment-font';
import type { Language } from '../i18n';
import { BuiltInEffect } from './built-in-effect';
import {
  type CommentSize,
  type EffectCommand,
  isCustomStampHelpCommand,
  parseCommands,
} from './comment-command';
import { shouldFilterComment, splitByBreaklineCommand, tokenizeKeywords } from './comment-pipeline';
import { CustomCommandHelp, type HelpStamp } from './custom-command-help';
import { FallingStamps } from './falling-stamps';
import { type Raid, RaidIntro } from './raid-intro';
import './style.css';

type ChatFragment =
  | { type: 'text'; key: string; text: string }
  | {
      type: 'emote';
      key: string;
      text: string;
      url: string;
    };
type RenderFragment =
  | ChatFragment
  | { type: 'customStamp'; key: string; text: string; dataUri: string; effectType: string }
  | { type: 'externalEmote'; key: string; text: string; url: string };
type CustomStamp = { commandName: string; dataUri: string; effectType: string };
type ExternalEmote = { name: string; url: string; provider: string };
type ExternalEmoteResult = { emotes: ExternalEmote[] };

type ChatMessage = {
  id: string;
  lines: ChatLine[];
  lane: number;
  size: CommentSize;
  color?: string;
  alignment: string;
};
type ChatLine = { key: string; fragments: RenderFragment[] };
type IncomingChatMessage = {
  id: string;
  fragments: ChatFragment[];
  authorName?: string;
  interactionType?: string;
};
type ActiveEffect = { id: string; type: EffectCommand };
type ActiveFallingStamp = { id: string; dataUri: string };
type HelpRequest = { id: string; stamps: HelpStamp[] };

type OverlaySettings = {
  language: Language;
  settingsVersion: number;
  commentDurationSeconds: number;
  defaultSize: CommentSize;
  commentFont: CommentFont;
  raidClipsEnabled: boolean;
  raidClipCount: number;
  raidIntroSeconds: number;
  raidAutoShoutout: boolean;
  raidIntroductionMode: 'automatic' | 'manual';
  enabledEffects: EffectCommand[];
};
const defaultSettings: OverlaySettings = {
  language: 'ja',
  settingsVersion: 1,
  commentDurationSeconds: 5,
  defaultSize: 'medium',
  commentFont: 'system',
  raidClipsEnabled: true,
  raidClipCount: 5,
  raidIntroSeconds: 60,
  raidAutoShoutout: true,
  raidIntroductionMode: 'automatic',
  enabledEffects: [
    'sakura',
    'snow',
    'balloons',
    'kamifubuki',
    'rain',
    'maruta',
    'chikuwa',
    'marutai',
  ],
};
const maxLanes = { small: 25, medium: 16, big: 7 };

function trimFragments(fragments: ChatFragment[], removeLength: number): ChatFragment[] {
  let remaining = removeLength;
  return fragments.flatMap((fragment) => {
    if (remaining <= 0) return [fragment];
    if (remaining >= fragment.text.length) {
      remaining -= fragment.text.length;
      return [];
    }
    if (fragment.type === 'emote') return [fragment];
    const trimmed = { ...fragment, text: fragment.text.slice(remaining) };
    remaining = 0;
    return [trimmed];
  });
}

function expandCustomStamps(
  fragments: ChatFragment[],
  stamps: Map<string, CustomStamp>,
  externalEmotes: Map<string, string>,
): { fragments: RenderFragment[]; fallingStamps: ActiveFallingStamp[] } {
  const expanded: RenderFragment[] = [];
  const fallingStamps: ActiveFallingStamp[] = [];
  const keywords = new Set([...stamps.keys(), ...externalEmotes.keys()]);
  for (const fragment of fragments) {
    if (fragment.type === 'emote') {
      expanded.push(fragment);
      continue;
    }
    for (const [index, token] of tokenizeKeywords(fragment.text, keywords).entries()) {
      const stamp = token.keyword ? stamps.get(token.keyword) : undefined;
      const externalUrl = token.keyword ? externalEmotes.get(token.keyword) : undefined;
      if (stamp?.effectType === 'falling') {
        fallingStamps.push({
          id: `${fragment.key}-${index}-${crypto.randomUUID()}`,
          dataUri: stamp.dataUri,
        });
        continue;
      }
      expanded.push(
        stamp
          ? {
              type: 'customStamp',
              key: `${fragment.key}-${index}`,
              text: token.text,
              dataUri: stamp.dataUri,
              effectType: stamp.effectType,
            }
          : externalUrl
            ? {
                type: 'externalEmote',
                key: `${fragment.key}-${index}`,
                text: token.text,
                url: externalUrl,
              }
            : { ...fragment, key: `${fragment.key}-${index}`, text: token.text },
      );
    }
  }
  return { fragments: expanded, fallingStamps };
}

function splitChatFragmentsIntoLines(fragments: ChatFragment[]): ChatFragment[][] {
  const lines: ChatFragment[][] = [[]];
  for (const fragment of fragments) {
    if (fragment.type !== 'text') {
      lines.at(-1)?.push(fragment);
      continue;
    }
    const parts = splitByBreaklineCommand(fragment.text);
    for (const [index, part] of parts.entries()) {
      if (part) lines.at(-1)?.push({ ...fragment, key: `${fragment.key}-${index}`, text: part });
      if (index < parts.length - 1) lines.push([]);
    }
  }
  return lines.map(trimLineEdgeSpaces);
}

function trimLineEdgeSpaces(line: ChatFragment[]): ChatFragment[] {
  const result = line.map((fragment) => ({ ...fragment }));
  const first = result[0];
  if (first?.type === 'text') first.text = first.text.replace(/^[ \t]+/, '');
  const last = result.at(-1);
  if (last?.type === 'text') last.text = last.text.replace(/[ \t]+$/, '');
  return result.filter((fragment) => fragment.type !== 'text' || fragment.text !== '');
}

export function Overlay(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [customFontFamilies, setCustomFontFamilies] = useState<Map<string, string>>(new Map());
  const [customStamps, setCustomStamps] = useState<Map<string, CustomStamp>>(new Map());
  const [customStampsLoadError, setCustomStampsLoadError] = useState<string>();
  const [externalEmotes, setExternalEmotes] = useState<Map<string, string>>(new Map());
  const [effects, setEffects] = useState<ActiveEffect[]>([]);
  const [fallingStamps, setFallingStamps] = useState<ActiveFallingStamp[]>([]);
  const [raids, setRaids] = useState<Raid[]>([]);
  const [helpRequests, setHelpRequests] = useState<HelpRequest[]>([]);

  const queueCustomStampHelp = useCallback(
    (id: string) => {
      const stamps = [...customStamps.values()].map(({ commandName, dataUri }) => ({
        commandName,
        dataUri,
      }));
      const items = customStampsLoadError
        ? [
            {
              commandName: t('customStampsLoadFailed', { error: customStampsLoadError }),
            },
          ]
        : stamps.length > 0
          ? stamps
          : [{ commandName: t('noCustomStampsRegistered') }];
      setHelpRequests((current) =>
        current.some((request) => request.id === id)
          ? current
          : [...current, { id, stamps: items }],
      );
    },
    [customStamps, customStampsLoadError, t],
  );

  useEffect(() => {
    void i18n.changeLanguage(settings.language);
    document.documentElement.lang = settings.language;
  }, [i18n, settings.language]);

  useEffect(() => {
    const unlisten = listen<Raid>('twitch-raid', ({ payload }) => {
      setRaids((current) => [...current, payload]);
    });
    return () => void unlisten.then((dispose) => dispose());
  }, []);

  useEffect(() => {
    const unlisten = listen<IncomingChatMessage>('twitch-chat-message', ({ payload }) => {
      const fullText = payload.fragments.map((fragment) => fragment.text).join('');
      if (isCustomStampHelpCommand(fullText)) {
        queueCustomStampHelp(payload.id);
        return;
      }
      if (shouldFilterComment(fullText)) return;
      const commands = parseCommands(fullText);
      const size = commands.size ?? settings.defaultSize;
      const effect = commands.effect;
      if (effect && settings.enabledEffects.includes(effect)) {
        setEffects((current) => [...current, { id: `${payload.id}-${effect}`, type: effect }]);
      }
      const sourceLines = splitChatFragmentsIntoLines(
        trimFragments(payload.fragments, commands.removeLength),
      );
      const expandedLines = sourceLines.map((line) =>
        expandCustomStamps(line, customStamps, externalEmotes),
      );
      const newFallingStamps = expandedLines.flatMap((line) => line.fallingStamps);
      if (newFallingStamps.length > 0) {
        setFallingStamps((current) => [...current, ...newFallingStamps]);
      }
      const lines: ChatLine[] = expandedLines.map((line) => ({
        key: crypto.randomUUID(),
        fragments: line.fragments,
      }));
      if (lines.every((line) => line.fragments.every((fragment) => fragment.text.trim() === '')))
        return;
      setMessages((current) => [
        ...current,
        {
          ...payload,
          lines,
          size,
          color: commands.color,
          alignment: commands.alignment,
          lane: Math.floor(Math.random() * Math.max(maxLanes[size] - 2, 1)),
        },
      ]);
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [
    settings.defaultSize,
    settings.enabledEffects,
    customStamps,
    externalEmotes,
    queueCustomStampHelp,
  ]);

  useEffect(() => {
    void invoke<OverlaySettings>('get_overlay_settings').then(setSettings);
    const unlisten = listen<OverlaySettings>('overlay-settings-updated', ({ payload }) => {
      setSettings(payload);
    });
    return () => void unlisten.then((dispose) => dispose());
  }, []);

  useEffect(() => {
    const applyFonts = async (fonts: CustomFont[]) => {
      const result = await installCustomFonts(fonts);
      setCustomFontFamilies(result.families);
      for (const error of result.errors) console.error(`Failed to load custom font: ${error}`);
    };
    void invoke<CustomFont[]>('get_custom_fonts').then(applyFonts);
    const unlisten = listen<CustomFont[]>('custom-fonts-updated', ({ payload }) => {
      void applyFonts(payload);
    });
    return () => void unlisten.then((dispose) => dispose());
  }, []);

  useEffect(() => {
    const applyExternalEmotes = (result: ExternalEmoteResult) => {
      setExternalEmotes(new Map(result.emotes.map((emote) => [emote.name, emote.url])));
    };
    void invoke<ExternalEmoteResult>('get_external_emotes').then(applyExternalEmotes);
    const unlisten = listen<ExternalEmoteResult>('external-emotes-updated', ({ payload }) => {
      applyExternalEmotes(payload);
    });
    return () => void unlisten.then((dispose) => dispose());
  }, []);

  useEffect(() => {
    const applyStamps = (stamps: CustomStamp[]) => {
      setCustomStamps(new Map(stamps.map((stamp) => [stamp.commandName, stamp])));
      setCustomStampsLoadError(undefined);
    };
    void invoke<CustomStamp[]>('get_custom_stamps')
      .then(applyStamps)
      .catch((error: unknown) => {
        console.error('Failed to load custom stamps', error);
        setCustomStampsLoadError(String(error));
      });
    const unlisten = listen<CustomStamp[]>('custom-stamps-updated', ({ payload }) => {
      applyStamps(payload);
    });
    return () => void unlisten.then((dispose) => dispose());
  }, []);

  const removeMessage = (id: string) => {
    setMessages((current) => current.filter((message) => message.id !== id));
  };
  const removeEffect = useCallback((id: string) => {
    setEffects((current) => current.filter((effect) => effect.id !== id));
  }, []);
  const removeRaid = useCallback((id: string) => {
    setRaids((current) => current.filter((raid) => raid.id !== id));
  }, []);
  const removeFallingStamp = useCallback((id: string) => {
    setFallingStamps((current) => current.filter((stamp) => stamp.id !== id));
  }, []);
  const removeHelpRequest = useCallback((id: string) => {
    setHelpRequests((current) => current.filter((request) => request.id !== id));
  }, []);

  return (
    <main className="overlay" aria-label="Twitch Text Flow Overlay">
      {raids[0] && (
        <RaidIntro
          key={raids[0].id}
          raid={raids[0]}
          duration={settings.raidIntroSeconds}
          clipsEnabled={settings.raidClipsEnabled}
          clipCount={settings.raidClipCount}
          autoShoutout={settings.raidAutoShoutout}
          introductionMode={settings.raidIntroductionMode}
          language={settings.language}
          onComplete={removeRaid}
        />
      )}
      {helpRequests[0] && (
        <CustomCommandHelp
          key={helpRequests[0].id}
          id={helpRequests[0].id}
          stamps={helpRequests[0].stamps}
          durationSeconds={settings.commentDurationSeconds}
          onComplete={removeHelpRequest}
        />
      )}
      {effects.map((effect) => (
        <BuiltInEffect
          key={effect.id}
          id={effect.id}
          type={effect.type}
          onComplete={removeEffect}
        />
      ))}
      {fallingStamps.map((stamp) => (
        <FallingStamps
          key={stamp.id}
          id={stamp.id}
          src={stamp.dataUri}
          onComplete={removeFallingStamp}
        />
      ))}
      {messages.map((message) => (
        <p
          className="chat-message"
          key={message.id}
          data-size={message.size}
          data-alignment={message.alignment}
          style={{
            top:
              message.alignment === 'flow'
                ? `${message.lane * { small: 4, medium: 6, big: 18 }[message.size]}vh`
                : undefined,
            color: message.color,
            fontFamily: getCommentFontFamily(settings.commentFont, customFontFamilies),
            animationDuration: `${settings.commentDurationSeconds}s`,
          }}
          onAnimationEnd={() => removeMessage(message.id)}
        >
          <span className="chat-lines">
            {message.lines.map((line) => (
              <span className="chat-line" key={line.key}>
                {line.fragments.map((fragment) =>
                  fragment.type === 'emote' ? (
                    <img key={fragment.key} src={fragment.url} alt={fragment.text} />
                  ) : fragment.type === 'customStamp' ? (
                    <img key={fragment.key} src={fragment.dataUri} alt={fragment.text} />
                  ) : fragment.type === 'externalEmote' ? (
                    <img key={fragment.key} src={fragment.url} alt={fragment.text} />
                  ) : (
                    <span key={fragment.key}>{fragment.text}</span>
                  ),
                )}
              </span>
            ))}
          </span>
        </p>
      ))}
    </main>
  );
}
