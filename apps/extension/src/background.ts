/**
 * Holds the session between the website and the streaming tab, and opens the
 * tab itself. Deliberately thin: the sync socket lives in the overlay iframe,
 * which is our own origin and stays alive as long as the page does. An MV3
 * service worker is stopped whenever the browser feels like it, so anything
 * that has to survive a two-hour film cannot live here.
 */

type Session = { partyId: string; token: string; siteOrigin: string };

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type === "start") {
    const session = message.session as Session;
    // Stored rather than passed: the streaming tab loads its content script
    // before anything could hand it a message, so it reads this on the way up.
    chrome.storage.local.set({ session }).then(() => {
      if (message.url) chrome.tabs.create({ url: message.url });
      respond({ ok: true });
    });
    return true;
  }

  if (message?.type === "stop") {
    chrome.storage.local.remove("session").then(() => respond({ ok: true }));
    return true;
  }

  if (message?.type === "session") {
    chrome.storage.local.get(["session"]).then(value => respond(value.session ?? null));
    return true;
  }

  return false;
});
