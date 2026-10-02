export const pointsEffects = [
  'hearts',
  'gravity',
  'flower',
  'emoteFountain',
  'fireworks',
  'bubbles',
  'paint',
  'meteors',
] as const;
export type PointsEffect = (typeof pointsEffects)[number];
export type PointsJobStatus =
  | 'queued'
  | 'playing'
  | 'fulfillPending'
  | 'cancelPending'
  | 'fulfilled'
  | 'canceled';
export type PointsJob = {
  id: string;
  broadcasterId: string;
  userId: string;
  effect: PointsEffect;
  status: PointsJobStatus;
  createdAt: number;
  startedAt: number | null;
  preview: boolean;
  error: string | null;
};
export type PointsReward = {
  id: string;
  broadcasterId: string;
  effect: PointsEffect;
  cost: number;
  cooldownSeconds: number;
  enabled: boolean;
};
export type PointsSnapshot = {
  authorized: boolean;
  syncError?: string | null;
  rewards: PointsReward[];
  jobs: PointsJob[];
};
export const pointsLabels = {
  hearts: 'pointsHearts',
  gravity: 'pointsGravity',
  flower: 'pointsFlower',
  emoteFountain: 'pointsEmoteFountain',
  fireworks: 'pointsFireworks',
  bubbles: 'pointsBubbles',
  paint: 'pointsPaint',
  meteors: 'pointsMeteors',
} as const;
