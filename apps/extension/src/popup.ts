/**
 * Status only. The old popup asked for an email and a password, which meant
 * typing account credentials into a window with no address bar — exactly the
 * shape of a phishing prompt, and impossible for anyone to verify. The session
 * now comes from the website, where the URL is visible.
 */
const state = document.getElementById("state")!;

function render(session: { partyId: string; siteOrigin: string } | null) {
  if (!session) {
    state.innerHTML = `
      <span class="label">مش متصل بسهرة</span><br />
      ابدأ من صفحة السهرة على موقع MSParty ودوس «افتح على المنصة».
    `;
    return;
  }

  state.classList.add("on");
  state.innerHTML = `
    <span class="label">متصل بسهرة</span><br />
    <span class="value">${session.partyId.slice(-6).toUpperCase()}</span>
    <button id="stop" type="button">اقطع الاتصال</button>
  `;

  document.getElementById("stop")!.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "stop" }, () => render(null));
  });
}

chrome.runtime.sendMessage({ type: "session" }, session => render(session ?? null));
