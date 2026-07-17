// Content-Script: erkennt auf YouTube-Kanalseiten die Channel-ID und blendet
// einen "Folgen"-Button ein. Ein Klick sendet den Kanal an den yt-follow-Server
// (ueber den Service Worker). YouTube ist eine SPA -> auf yt-navigate-finish reagieren.

(function () {
  const BTN_ID = "ytf-follow-btn";

  function getChannelInfo() {
    const path = location.pathname;
    const isChannelPage = /^\/(channel\/|@|c\/|user\/)/.test(path);
    if (!isChannelPage) return null;

    let id = null;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      const m = canonical.href.match(/\/channel\/(UC[\w-]+)/);
      if (m) id = m[1];
    }
    if (!id) {
      const m = document.documentElement.innerHTML.match(
        /"(?:externalId|channelId)":"(UC[\w-]+)"/
      );
      if (m) id = m[1];
    }
    if (!id) return null;

    const name =
      document.querySelector('meta[property="og:title"]')?.content ||
      document.title.replace(/ - YouTube$/, "").trim();
    return { id, name };
  }

  function setState(btn, following) {
    btn.classList.remove("error");
    btn.classList.toggle("following", !!following);
    btn.textContent = following ? "✓ Folge ich" : "➕ Folgen";
  }

  function setError(btn, text) {
    btn.classList.remove("following");
    btn.classList.add("error");
    btn.textContent = text;
    setTimeout(() => ensureButton(), 2500);
  }

  function onClick() {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    const { channelId: id, channelName: name } = btn.dataset;
    const following = btn.classList.contains("following");
    btn.disabled = true;
    const message = following
      ? { type: "unfollow", id }
      : { type: "follow", value: id, name };
    chrome.runtime.sendMessage(message, (res) => {
      btn.disabled = false;
      if (!res || !res.ok) {
        if (res && res.error === "no-server") setError(btn, "⚙ Server einrichten");
        else setError(btn, "✕ Fehler");
        return;
      }
      setState(btn, res.following);
    });
  }

  function ensureButton() {
    const info = getChannelInfo();
    let btn = document.getElementById(BTN_ID);

    if (!info) {
      if (btn) btn.remove();
      return;
    }
    if (!btn) {
      btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.addEventListener("click", onClick);
      document.body.appendChild(btn);
    }
    btn.dataset.channelId = info.id;
    btn.dataset.channelName = info.name;
    btn.disabled = false;
    chrome.runtime.sendMessage({ type: "isFollowing", id: info.id }, (res) => {
      setState(btn, res && res.following);
    });
  }

  const style = document.createElement("style");
  style.textContent = `
    #${BTN_ID}{position:fixed;right:20px;bottom:20px;z-index:99999;
      padding:10px 16px;border:none;border-radius:20px;cursor:pointer;
      font:600 14px/1 Roboto,Arial,sans-serif;color:#fff;background:#cc0000;
      box-shadow:0 2px 8px rgba(0,0,0,.3);transition:background .2s}
    #${BTN_ID}.following{background:#606060}
    #${BTN_ID}.error{background:#b8860b}
    #${BTN_ID}:disabled{opacity:.6;cursor:default}
  `;
  (document.head || document.documentElement).appendChild(style);

  document.addEventListener("yt-navigate-finish", () =>
    setTimeout(ensureButton, 300)
  );
  window.addEventListener("load", () => setTimeout(ensureButton, 500));
  setTimeout(ensureButton, 1000);
})();
