import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bridge from '../../../src-tauri/src/clip-player-bridge.js?raw';

let events: EventTarget;
let host: { postMessage: ReturnType<typeof vi.fn> };
let video: HTMLVideoElement;
let play: ReturnType<typeof vi.fn>;

function setMediaState(element: HTMLVideoElement, values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(element, key, { value, configurable: true, writable: true });
  }
}

function install(origin = 'https://clips.twitch.tv/embed?clip=Example&parent=localhost') {
  // Execute the exact native initialization script, with a child-frame window
  // and a real jsdom document. No requests to Twitch are made by these tests.
  const frame = {
    location: new URL(origin),
    parent: host,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
  };
  new Function('window', 'document', 'MutationObserver', bridge)(frame, document, MutationObserver);
}

function observe(
  source: unknown = host,
  origin = 'http://localhost:54321',
  playbackId = 'current',
) {
  const event = new Event('message');
  Object.defineProperties(event, {
    source: { value: source },
    origin: { value: origin },
    data: { value: { channel: 'text-flow:clip-player', command: 'observe', playbackId } },
  });
  events.dispatchEvent(event);
}

function reports(state: string) {
  return host.postMessage.mock.calls.filter(([message]) => message.state === state);
}

beforeEach(() => {
  vi.useFakeTimers();
  events = new EventTarget();
  host = { postMessage: vi.fn() };
  video = document.createElement('video');
  setMediaState(video, { paused: true, ended: false, readyState: 2, currentTime: 0 });
  play = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(video, 'play', { value: play });
  document.body.append(video);
});

afterEach(() => {
  events.dispatchEvent(new Event('pagehide'));
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('native clip playback observer', () => {
  it('retries ready, paused video playback at most three times and keeps audio muted', async () => {
    play.mockRejectedValue(new DOMException('Blocked', 'NotAllowedError'));
    install();
    observe();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(play).toHaveBeenCalledTimes(3);
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(reports('play-rejected')).toHaveLength(3);
    expect(reports('playing')).toHaveLength(0);
    for (const [, targetOrigin] of host.postMessage.mock.calls) {
      expect(targetOrigin).toBe('http://localhost:54321');
    }
  });

  it('waits for media readiness and reports actual playing/progress/ended events', async () => {
    setMediaState(video, { readyState: 0 });
    install();
    observe();
    await vi.advanceTimersByTimeAsync(5000);
    expect(play).not.toHaveBeenCalled();
    setMediaState(video, { readyState: 4 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(play).toHaveBeenCalledTimes(1);
    // A resolved play promise by itself is not reported as actual playback.
    expect(reports('playing')).toHaveLength(0);
    setMediaState(video, { paused: false });
    video.dispatchEvent(new Event('playing'));
    setMediaState(video, { currentTime: 1 });
    video.dispatchEvent(new Event('timeupdate'));
    setMediaState(video, { ended: true });
    video.dispatchEvent(new Event('ended'));
    expect(reports('playing')).toHaveLength(1);
    expect(reports('progress')).toHaveLength(1);
    expect(reports('ended')).toHaveLength(1);
  });

  it('observes a video added after initialization and detaches a replaced video', async () => {
    video.remove();
    install();
    observe();
    await vi.advanceTimersByTimeAsync(1000);
    expect(play).not.toHaveBeenCalled();
    document.body.append(video);
    await vi.advanceTimersByTimeAsync(1000);
    expect(play).toHaveBeenCalledTimes(1);
    video.remove();
    const replacement = document.createElement('video');
    setMediaState(replacement, { paused: true, ended: false, readyState: 0, currentTime: 0 });
    document.body.append(replacement);
    await vi.advanceTimersByTimeAsync(1000);
    video.dispatchEvent(new Event('ended'));
    expect(reports('ended')).toHaveLength(0);
    setMediaState(replacement, { paused: false });
    replacement.dispatchEvent(new Event('playing'));
    expect(reports('playing')).toHaveLength(1);
  });

  it('ignores other sites and untrusted initialization messages', async () => {
    install('https://example.com/embed?parent=localhost');
    observe();
    await vi.advanceTimersByTimeAsync(1000);
    expect(host.postMessage).not.toHaveBeenCalled();
    install();
    observe({}, 'http://localhost:54321');
    observe(host, 'https://example.com');
    await vi.advanceTimersByTimeAsync(1000);
    expect(host.postMessage).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    observe();
    expect(reports('ready')).toHaveLength(1);
  });

  it('does not replay ended media and cleans up on navigation', async () => {
    install();
    observe();
    setMediaState(video, { ended: true });
    await vi.advanceTimersByTimeAsync(3000);
    expect(play).not.toHaveBeenCalled();
    events.dispatchEvent(new Event('pagehide'));
    setMediaState(video, { ended: false });
    await vi.advanceTimersByTimeAsync(3000);
    video.dispatchEvent(new Event('playing'));
    expect(play).not.toHaveBeenCalled();
    expect(reports('playing')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('renews the session for the same parent without duplicating observers or timers', () => {
    install();
    observe();
    setMediaState(video, { paused: false, currentTime: 2 });
    observe(host, 'http://localhost:54321', 'renewed');
    expect(reports('ready')).toHaveLength(2);
    expect(reports('playing').at(-1)?.[0].playbackId).toBe('renewed');
    expect(vi.getTimerCount()).toBe(1);
  });
});
