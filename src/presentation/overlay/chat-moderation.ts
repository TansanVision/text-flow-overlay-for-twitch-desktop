// sentAt is normalized by Rust to fixed-width UTC with nanosecond precision.
export type ChatSource = {
  messageId: string;
  userId: string;
  broadcasterUserId: string;
  sentAt: string;
};

export type ChatModeration = { broadcasterUserId: string; sentAt: string } & (
  | { type: 'deleteMessage'; messageId: string }
  | { type: 'clearUser'; userId: string }
  | { type: 'clear' }
);

export type ModeratedContent = { source?: ChatSource };

const retentionMs = 10 * 60 * 1000;
const maxEntries = 10_000;

function key(event: ChatModeration): string {
  return JSON.stringify([
    event.broadcasterUserId,
    event.type,
    event.type === 'deleteMessage'
      ? event.messageId
      : event.type === 'clearUser'
        ? event.userId
        : '',
  ]);
}

export function isRemovedBy(source: ChatSource | undefined, event: ChatModeration): boolean {
  if (!source || source.broadcasterUserId !== event.broadcasterUserId) return false;
  if (event.type === 'deleteMessage') return source.messageId === event.messageId;
  if (source.sentAt > event.sentAt) return false;
  return event.type === 'clear' || source.userId === event.userId;
}

// Retain deletions across reconnects so a late chat notification cannot resurrect content.
// This is a time cutoff, not a ban list: new messages after a timeout ends remain eligible.
export class ChatModerationHistory {
  private entries = new Map<string, { event: ChatModeration; receivedAt: number }>();

  record(event: ChatModeration, now = Date.now()): void {
    this.prune(now);
    const id = key(event);
    const previous = this.entries.get(id);
    if (previous && previous.event.sentAt > event.sentAt) return;
    this.entries.delete(id);
    this.entries.set(id, { event, receivedAt: now });
    if (this.entries.size > maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }

  removes(source: ChatSource | undefined, now = Date.now()): boolean {
    this.prune(now);
    if (!source) return false;
    const scope = { broadcasterUserId: source.broadcasterUserId, sentAt: source.sentAt };
    const candidates: ChatModeration[] = [
      { ...scope, type: 'deleteMessage', messageId: source.messageId },
      { ...scope, type: 'clearUser', userId: source.userId },
      { ...scope, type: 'clear' },
    ];
    return candidates.some((candidate) => {
      const entry = this.entries.get(key(candidate));
      return entry !== undefined && isRemovedBy(source, entry.event);
    });
  }

  private prune(now: number): void {
    for (const [id, entry] of this.entries) {
      if (now - entry.receivedAt < retentionMs) break;
      this.entries.delete(id);
    }
  }
}
