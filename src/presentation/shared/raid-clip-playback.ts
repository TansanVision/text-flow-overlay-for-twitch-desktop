export type RaidClipPlaybackStatus =
  | 'loading'
  | 'playing'
  | 'waiting'
  | 'unconfirmed'
  | 'unavailable';

export type RaidClipPlayback = {
  playbackId: string;
  raidId: string;
  displayName: string;
  title: string;
  clipNumber: number;
  clipCount: number;
  status?: RaidClipPlaybackStatus;
};

export type RaidClipSkipRequest = { playbackId: string };
