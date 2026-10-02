import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type PointsEffect,
  type PointsReward,
  type PointsSnapshot,
  pointsEffects,
  pointsLabels,
} from '../shared/channel-points';

const statusLabels = {
  queued: 'pointsQueued',
  playing: 'pointsPlaying',
  fulfillPending: 'pointsFulfillPending',
  cancelPending: 'pointsCancelPending',
  fulfilled: 'pointsFulfilled',
  canceled: 'pointsCanceled',
} as const;

function RewardForm({
  effect,
  reward,
  authorized,
  onSaved,
}: {
  effect: PointsEffect;
  reward?: PointsReward;
  authorized: boolean;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [cost, setCost] = useState(reward?.cost ?? 100);
  const [cooldown, setCooldown] = useState(reward?.cooldownSeconds ?? 30);
  const [enabled, setEnabled] = useState(reward?.enabled ?? false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const run = async (preview: boolean) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    setSaved(false);
    try {
      if (preview) await invoke('preview_channel_point_effect', { effect });
      else
        await invoke('save_channel_point_reward', {
          effect,
          cost,
          cooldownSeconds: cooldown,
          enabled,
        });
      setSaved(!preview);
      await onSaved();
    } catch (reason) {
      setError(String(reason));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <form
      className="points-reward"
      onSubmit={(event) => {
        event.preventDefault();
        void run(false);
      }}
    >
      <h3>{t(pointsLabels[effect])}</h3>
      <p className="help-text">{t(`${pointsLabels[effect]}Help`)}</p>
      <div className="settings-grid">
        <label htmlFor={`points-cost-${effect}`}>{t('pointsCost')}</label>
        <input
          id={`points-cost-${effect}`}
          type="number"
          min={1}
          max={1_000_000}
          required
          value={cost}
          disabled={!authorized || busy}
          onChange={(event) => setCost(event.currentTarget.valueAsNumber)}
        />
        <label htmlFor={`points-cooldown-${effect}`}>{t('pointsCooldown')}</label>
        <input
          id={`points-cooldown-${effect}`}
          type="number"
          min={10}
          max={86_400}
          required
          value={cooldown}
          disabled={!authorized || busy}
          onChange={(event) => setCooldown(event.currentTarget.valueAsNumber)}
        />
        <label htmlFor={`points-enabled-${effect}`}>{t('pointsEnabled')}</label>
        <input
          id={`points-enabled-${effect}`}
          type="checkbox"
          checked={enabled}
          disabled={!authorized || busy}
          onChange={(event) => setEnabled(event.currentTarget.checked)}
        />
      </div>
      <div className="button-row">
        <button type="submit" disabled={!authorized || busy}>
          {t(reward ? 'pointsSave' : 'pointsCreate')}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void run(true)}
        >
          {t('pointsPreview')}
        </button>
      </div>
      {saved && (
        <p className="success" role="status">
          {t('pointsSaved')}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function ChannelPointsPanel({
  onAuthorize,
  authorizationBusy,
}: {
  onAuthorize: () => Promise<void>;
  authorizationBusy: boolean;
}) {
  const { t } = useTranslation();
  const [selectedEffect, setSelectedEffect] = useState<PointsEffect>('hearts');
  const [snapshot, setSnapshot] = useState<PointsSnapshot>({
    authorized: false,
    rewards: [],
    jobs: [],
  });
  const [error, setError] = useState<string>();
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    const result = await invoke<PointsSnapshot>('get_channel_points');
    if (mounted.current && result) {
      setSnapshot(result);
      setError(undefined);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        await refresh();
      } catch (reason) {
        if (!cancelled) setError(String(reason));
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 2000);
    };
    void poll();
    return () => {
      cancelled = true;
      mounted.current = false;
      clearTimeout(timer);
    };
  }, [refresh]);
  return (
    <section className="panel" aria-labelledby="points-title">
      <h2 id="points-title">{t('pointsTitle')}</h2>
      <p className="help-text">{t('pointsHelp')}</p>
      {!snapshot.authorized && (
        <button type="button" disabled={authorizationBusy} onClick={() => void onAuthorize()}>
          {t('pointsAuthorize')}
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {snapshot.authorized && snapshot.syncError && (
        <p className="error" role="alert">
          {snapshot.syncError}
        </p>
      )}
      <fieldset className="points-picker">
        <legend>{t('pointsChoose')}</legend>
        {pointsEffects.map((effect) => {
          const reward = snapshot.rewards.find((item) => item.effect === effect);
          return (
            <button
              type="button"
              className="points-choice"
              key={effect}
              aria-pressed={selectedEffect === effect}
              aria-controls={`points-editor-${effect}`}
              onClick={() => setSelectedEffect(effect)}
            >
              <span>{t(pointsLabels[effect])}</span>
              <small data-enabled={reward?.enabled ?? false}>
                {t(
                  !reward
                    ? 'pointsNotCreated'
                    : reward.enabled
                      ? 'pointsAccepting'
                      : 'pointsDisabled',
                )}
              </small>
            </button>
          );
        })}
      </fieldset>
      {pointsEffects.map((effect) => {
        const reward = snapshot.rewards.find((reward) => reward.effect === effect);
        return (
          <div key={effect} id={`points-editor-${effect}`} hidden={selectedEffect !== effect}>
            <RewardForm
              key={`${effect}:${reward?.id ?? ''}:${reward?.cost}:${reward?.cooldownSeconds}:${reward?.enabled}`}
              effect={effect}
              reward={reward}
              authorized={snapshot.authorized && !authorizationBusy}
              onSaved={refresh}
            />
          </div>
        );
      })}
      <details className="disclosure">
        <summary>
          {t('pointsHistory')} ({snapshot.jobs.length})
        </summary>
        {snapshot.jobs.length === 0 ? (
          <p className="help-text">{t('pointsNoHistory')}</p>
        ) : (
          <ul className="points-history">
            {snapshot.jobs.slice(0, 10).map((job) => (
              <li key={job.id}>
                <span>
                  {t(pointsLabels[job.effect])}
                  {job.preview ? ` (${t('pointsTest')})` : ''} — {t(statusLabels[job.status])}
                </span>
                {job.error && <small className="provider-error">{job.error}</small>}
              </li>
            ))}
          </ul>
        )}
      </details>
      <details className="disclosure">
        <summary>{t('pointsUsage')}</summary>
        <p className="help-text">{t('pointsAvailability')}</p>
        <p className="help-text">{t('pointsSettlementHelp')}</p>
      </details>
    </section>
  );
}
