export {};

declare global {
  interface Window {
    desktop?: {
      platform: string;
    };
  }
}
