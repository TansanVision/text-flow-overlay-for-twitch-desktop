import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { BuiltInEffect } from './built-in-effect';
import { type CommentSize, type EffectCommand, parseCommands } from './comment-command';
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
  fragments: RenderFragment[];
  lane: number;
  size: CommentSize;
  color?: string;
  alignment: string;
};
type IncomingChatMessage = {
  id: string;
  fragments: ChatFragment[];
  authorName?: string;
  interactionType?: string;
};
type ActiveEffect = { id: string; type: EffectCommand };

type OverlaySettings = {
  commentDurationSeconds: number;
  defaultSize: CommentSize;
  raidClipsEnabled: boolean;
  raidClipCount: number;
  raidClipMuted: boolean;
  raidIntroSeconds: number;
  raidAutoShoutout: boolean;
  enabledEffects: EffectCommand[];
};
const defaultSettings: OverlaySettings = {
  commentDurationSeconds: 5,
  defaultSize: 'medium',
  raidClipsEnabled: true,
  raidClipCount: 1,
  raidClipMuted: false,
  raidIntroSeconds: 15,
  raidAutoShoutout: false,
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
): RenderFragment[] {
  const expanded: RenderFragment[] = [];
  for (const fragment of fragments) {
    if (fragment.type === 'emote') {
      expanded.push(fragment);
      continue;
    }
    for (const [index, text] of fragment.text.split(/(\s+)/).filter(Boolean).entries()) {
      const stamp = stamps.get(text);
      const externalUrl = externalEmotes.get(text);
      expanded.push(
        stamp
          ? {
              type: 'customStamp',
              key: `${fragment.key}-${index}`,
              text,
              dataUri: stamp.dataUri,
              effectType: stamp.effectType,
            }
          : externalUrl
            ? { type: 'externalEmote', key: `${fragment.key}-${index}`, text, url: externalUrl }
            : { ...fragment, key: `${fragment.key}-${index}`, text },
      );
    }
  }
  return expanded;
}

export function Overlay(): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [customStamps, setCustomStamps] = useState<Map<string, CustomStamp>>(new Map());
  const [externalEmotes, setExternalEmotes] = useState<Map<string, string>>(new Map());
  const [effects, setEffects] = useState<ActiveEffect[]>([]);
  const [raids, setRaids] = useState<Raid[]>([]);

  useEffect(() => {
    const unlisten = listen<Raid>('twitch-raid', ({ payload }) => {
      setRaids((current) => [...current, payload]);
      void invoke('record_audience_interaction', { kind: 'raid', name: payload.displayName });
    });
    return () => void unlisten.then((dispose) => dispose());
  }, []);

  useEffect(() => {
    const unlisten = listen<IncomingChatMessage>('twitch-chat-message', ({ payload }) => {
      if (payload.authorName) {
        void invoke('record_audience_interaction', {
          kind: payload.interactionType ?? 'comment',
          name: payload.authorName,
        });
      }
      const fullText = payload.fragments.map((fragment) => fragment.text).join('');
      const commands = parseCommands(fullText);
      const size = commands.size ?? settings.defaultSize;
      const effect = commands.effect;
      if (effect && settings.enabledEffects.includes(effect)) {
        setEffects((current) => [...current, { id: `${payload.id}-${effect}`, type: effect }]);
      }
      const fragments = expandCustomStamps(
        trimFragments(payload.fragments, commands.removeLength),
        customStamps,
        externalEmotes,
      );
      if (fragments.every((fragment) => fragment.text.trim() === '')) return;
      setMessages((current) => [
        ...current,
        {
          ...payload,
          fragments,
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
  }, [settings.defaultSize, settings.enabledEffects, customStamps, externalEmotes]);

  useEffect(() => {
    void invoke<OverlaySettings>('get_overlay_settings').then(setSettings);
    const unlisten = listen<OverlaySettings>('overlay-settings-updated', ({ payload }) => {
      setSettings(payload);
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
    };
    void invoke<CustomStamp[]>('get_custom_stamps').then(applyStamps);
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

  return (
    <main className="overlay" aria-label="Twitch Text Flow Overlay">
      {raids[0] && (
        <RaidIntro
          key={raids[0].id}
          raid={raids[0]}
          duration={settings.raidIntroSeconds}
          clipsEnabled={settings.raidClipsEnabled}
          clipCount={settings.raidClipCount}
          clipMuted={settings.raidClipMuted}
          autoShoutout={settings.raidAutoShoutout}
          onComplete={removeRaid}
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
            animationDuration: `${settings.commentDurationSeconds}s`,
          }}
          onAnimationEnd={() => removeMessage(message.id)}
        >
          {message.fragments.map((fragment) =>
            fragment.type === 'emote' ? (
              <img key={fragment.key} src={fragment.url} alt={fragment.text} />
            ) : fragment.type === 'customStamp' ? (
              <img
                key={fragment.key}
                src={fragment.dataUri}
                alt={fragment.text}
                data-stamp-effect={fragment.effectType}
              />
            ) : fragment.type === 'externalEmote' ? (
              <img key={fragment.key} src={fragment.url} alt={fragment.text} />
            ) : (
              <span key={fragment.key}>{fragment.text}</span>
            ),
          )}
        </p>
      ))}
    </main>
  );
}
