/**
 * Runs in the page's own world, not the extension's.
 *
 * Content scripts get an isolated `window`, so `window.netflix` — where the
 * player actually lives — is invisible to them. This file is injected as a
 * <script> tag so it shares the page's globals, and talks back over
 * window.postMessage, which is the only channel that crosses the boundary.
 *
 * Netflix's player interface is internal and undocumented. Every access is
 * guarded: when they rename something, playback must fall back to being
 * unsynchronised, never throw into their page and break the film.
 */
(() => {
  type NetflixPlayer = {
    seek(ms: number): void;
    play(): void;
    pause(): void;
    getCurrentTime(): number;
    getDuration(): number;
  };

  function player(): NetflixPlayer | null {
    try {
      const api = (window as any).netflix?.appContext?.state?.playerApp?.getAPI?.()?.videoPlayer;
      if (!api) return null;
      const sessionId = api.getAllPlayerSessionIds?.()?.[0];
      if (!sessionId) return null;
      return api.getVideoPlayerBySessionId(sessionId) ?? null;
    } catch {
      return null;
    }
  }

  window.addEventListener("message", event => {
    // Only our own content script, in this tab, may drive the player.
    if (event.source !== window || event.data?.source !== "msparty") return;

    const target = player();
    if (!target) return;

    try {
      switch (event.data.type) {
        case "netflix:seek":
          target.seek(event.data.ms);
          break;
        case "netflix:play":
          target.play();
          break;
        case "netflix:pause":
          target.pause();
          break;
        case "netflix:query":
          window.postMessage(
            {
              source: "msparty-page",
              type: "netflix:state",
              seconds: target.getCurrentTime() / 1000,
              duration: target.getDuration() / 1000
            },
            "*"
          );
          break;
      }
    } catch {
      // A renamed method must not take the page down with it.
    }
  });

  window.postMessage({ source: "msparty-page", type: "netflix:ready" }, "*");
})();
