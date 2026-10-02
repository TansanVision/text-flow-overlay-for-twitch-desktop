import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type TwitchConnection = {
  revision: number;
  phase:
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'reauthorizationRequired'
    | 'unavailable';
  retryInSeconds: number | null;
  unavailableSubscriptions: string[];
};

const labels = {
  disconnected: 'chatDisconnected',
  connecting: 'chatConnecting',
  connected: 'chatConnected',
  reconnecting: 'chatReconnecting',
  reauthorizationRequired: 'chatReauthorizationRequired',
  unavailable: 'chatUnavailable',
} as const;

export function TwitchConnectionStatus({ onReauthorize }: { onReauthorize: () => Promise<void> }) {
  const { t } = useTranslation();
  const [connection, setConnection] = useState<TwitchConnection>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const apply = (next: TwitchConnection | undefined) => {
      if (cancelled || !next) return;
      setConnection((current) => (!current || next.revision > current.revision ? next : current));
      setError(undefined);
    };
    const load = async () => {
      const dispose = await listen<TwitchConnection>('twitch-connection-updated', ({ payload }) =>
        apply(payload),
      );
      if (cancelled) {
        dispose();
        return;
      }
      unlisten = dispose;
      apply(await invoke<TwitchConnection>('get_twitch_connection'));
    };
    void load().catch((reason: unknown) => {
      if (!cancelled) setError(String(reason));
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const retry = async (reauthorize: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      if (reauthorize) {
        await invoke('logout_twitch');
        await onReauthorize();
      } else {
        await invoke('reconnect_twitch');
      }
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const requiresAuthorization = connection?.phase === 'reauthorizationRequired';
  const unavailable = connection?.unavailableSubscriptions ?? [];
  const canRetry =
    connection?.phase === 'reconnecting' ||
    connection?.phase === 'unavailable' ||
    unavailable.length > 0;

  return (
    <div className="twitch-connection-status">
      {connection && (
        <p className={requiresAuthorization ? 'error' : 'connection-status'} role="status">
          {t(labels[connection.phase])}
          {connection.phase === 'reconnecting' && connection.retryInSeconds != null && (
            <> {t('chatRetryDelay', { seconds: connection.retryInSeconds })}</>
          )}
        </p>
      )}
      {unavailable.length > 0 && (
        <p className="provider-error" role="status">
          {t('chatPartialConnection', {
            events: [
              ...new Set(
                unavailable.map((kind) =>
                  t(
                    kind === 'channel.raid'
                      ? 'chatRaidEvents'
                      : kind === 'channel.cheer'
                        ? 'chatBitsEvents'
                        : kind.startsWith('channel.chat.')
                          ? 'chatModerationEvents'
                          : kind.startsWith('channel.channel_points_')
                            ? 'chatPointsEvents'
                            : 'chatSubscriptionEvents',
                  ),
                ),
              ),
            ].join(' / '),
          })}
        </p>
      )}
      {(requiresAuthorization || canRetry) && (
        <button type="button" disabled={busy} onClick={() => void retry(requiresAuthorization)}>
          {t(requiresAuthorization ? 'chatReauthorize' : 'chatReconnect')}
        </button>
      )}
      {error && <p className="error">{t('chatStatusError', { error })}</p>}
    </div>
  );
}
