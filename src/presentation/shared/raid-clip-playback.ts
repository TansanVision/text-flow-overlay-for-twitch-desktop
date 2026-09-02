export type RaidClipPlayback = {
  playbackId: string;
  raidId: string;
  displayName: string;
  title: string;
  clipNumber: number;
  clipCount: number;
};

export type RaidClipSkipRequest = { playbackId: string };
