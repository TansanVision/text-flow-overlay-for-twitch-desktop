// Runs at document creation in the overlay's frames. No Tauri API is exposed here.
(() => {
  if (
    window === window.parent ||
    window.location.origin !== 'https://clips.twitch.tv' ||
    window.location.pathname !== '/embed'
  )
    return;

  const channel = 'text-flow:clip-player';
  const parentHost = new URL(window.location.href).searchParams.get('parent');
  let playbackId;
  let parentOrigin;
  let video;
  let mediaId = 0;
  let removeVideoListeners = () => {};
  let attempts = 0;
  let pending = false;
  let lastProgress = -1;

  const report = (state, error) => {
    if (!playbackId || !parentOrigin) return;
    window.parent.postMessage(
      { channel, playbackId, mediaId, state, currentTime: video?.currentTime ?? 0, error },
      parentOrigin,
    );
  };

  const tryPlay = () => {
    if (
      !video ||
      video.ended ||
      !video.paused ||
      video.readyState < 2 ||
      pending ||
      attempts >= 3
    ) {
      return;
    }
    const candidate = video;
    attempts += 1;
    pending = true;
    candidate.muted = true;
    candidate.playsInline = true;
    Promise.resolve()
      .then(() => {
        if (candidate === video && candidate.isConnected) return candidate.play();
      })
      .catch((error) => {
        if (candidate === video) report('play-rejected', error?.name ?? 'UnknownError');
      })
      .finally(() => {
        if (candidate === video) pending = false;
      });
  };

  const findVideo = () => {
    const candidate = document.querySelector('video');
    if (candidate === video) return;
    removeVideoListeners();
    video = candidate;
    mediaId += 1;
    attempts = 0;
    pending = false;
    lastProgress = -1;
    if (!candidate) return;
    candidate.muted = true;
    candidate.playsInline = true;

    const playing = () => report('playing');
    const progress = () => {
      if (!candidate.paused && !candidate.ended && candidate.currentTime > lastProgress + 0.25) {
        lastProgress = candidate.currentTime;
        attempts = 0;
        report('progress');
      }
    };
    const waiting = () => report('waiting');
    const ended = () => report('ended');
    const failed = () => report('media-error', candidate.error?.code);
    const handlers = {
      playing,
      timeupdate: progress,
      waiting,
      stalled: waiting,
      pause: waiting,
      ended,
      error: failed,
    };
    for (const [event, listener] of Object.entries(handlers)) {
      candidate.addEventListener(event, listener);
    }
    removeVideoListeners = () => {
      for (const [event, listener] of Object.entries(handlers)) {
        candidate.removeEventListener(event, listener);
      }
    };
    if (!candidate.paused && !candidate.ended) playing();
    // play() attempts are spaced by the polling interval, including after rejection.
  };

  let observer;
  let polling;
  const receive = (event) => {
    if (
      event.source !== window.parent ||
      event.data?.channel !== channel ||
      event.data?.command !== 'observe' ||
      typeof event.data.playbackId !== 'string' ||
      event.data.playbackId.length > 128
    )
      return;
    let origin;
    try {
      origin = new URL(event.origin);
    } catch {
      return;
    }
    if (!['http:', 'https:'].includes(origin.protocol) || origin.hostname !== parentHost) return;
    if (parentOrigin && parentOrigin !== event.origin) return;
    const renewed = playbackId !== event.data.playbackId;
    parentOrigin = event.origin;
    playbackId = event.data.playbackId;
    report('ready');
    if (observer) {
      if (renewed) {
        lastProgress = -1;
        if (video && !video.paused && !video.ended) report('playing');
      }
      return;
    }
    findVideo();
    observer = new MutationObserver(findVideo);
    observer.observe(document, { childList: true, subtree: true });
    polling = window.setInterval(() => {
      findVideo();
      tryPlay();
    }, 1000);
  };
  window.addEventListener('message', receive);
  window.addEventListener(
    'pagehide',
    () => {
      window.removeEventListener('message', receive);
      window.clearInterval(polling);
      observer?.disconnect();
      removeVideoListeners();
    },
    { once: true },
  );
})();
