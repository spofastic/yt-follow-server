// Service Worker: duenner Client des yt-follow-Servers.
// Alle Aktionen (folgen, entfernen, Liste holen) gehen an die Server-REST-API.
// Die Server-URL steckt in chrome.storage.sync (per Optionsseite gesetzt).

const REQUEST_TIMEOUT = 8000;

async function getServerUrl() {
  const { serverUrl } = await chrome.storage.sync.get("serverUrl");
  return serverUrl ? serverUrl.replace(/\/+$/, "") : null;
}

async function apiFetch(path, options = {}) {
  const base = await getServerUrl();
  if (!base) throw new Error("no-server");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
  try {
    return await fetch(base + path, { signal: ctrl.signal, ...options });
  } finally {
    clearTimeout(timer);
  }
}

async function getState() {
  const res = await apiFetch("/api/state");
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function updateBadge() {
  try {
    const state = await getState();
    const unseen = (state.videos || []).filter((v) => !v.seen).length;
    chrome.action.setBadgeText({ text: unseen ? String(unseen) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#cc0000" });
  } catch {
    chrome.action.setBadgeText({ text: "" });
  }
}

const jsonBody = (obj) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj),
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case "isFollowing": {
          // Bei nicht erreichbarem Server still "nicht folgend" melden.
          try {
            const state = await getState();
            sendResponse({
              ok: true,
              following: (state.channels || []).some((c) => c.id === msg.id),
            });
          } catch {
            sendResponse({ ok: true, following: false });
          }
          break;
        }

        case "follow": {
          const base = await getServerUrl();
          if (!base) {
            chrome.runtime.openOptionsPage();
            sendResponse({ ok: false, error: "no-server" });
            break;
          }
          const res = await apiFetch("/api/channels", {
            method: "POST",
            ...jsonBody({ value: msg.value }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            sendResponse({ ok: false, error: data.error || "HTTP " + res.status });
            break;
          }
          updateBadge();
          sendResponse({ ok: true, following: true, channel: data.channel });
          break;
        }

        case "unfollow": {
          const res = await apiFetch(
            `/api/channels/${encodeURIComponent(msg.id)}`,
            { method: "DELETE" }
          );
          updateBadge();
          sendResponse({ ok: res.ok, following: false });
          break;
        }

        case "getState": {
          sendResponse({ ok: true, state: await getState() });
          break;
        }

        case "export": {
          const res = await apiFetch("/api/export");
          if (!res.ok) throw new Error("HTTP " + res.status);
          sendResponse({ ok: true, data: await res.json() });
          break;
        }

        case "import": {
          const res = await apiFetch("/api/import", {
            method: "POST",
            ...jsonBody({ channels: msg.channels || [] }),
          });
          const data = await res.json().catch(() => ({}));
          updateBadge();
          sendResponse({ ok: res.ok, added: data.added, total: data.total });
          break;
        }

        case "refresh": {
          const res = await apiFetch("/api/refresh", { method: "POST" });
          const data = await res.json().catch(() => ({}));
          updateBadge();
          sendResponse({ ok: res.ok, newCount: data.newCount });
          break;
        }

        case "seen": {
          await apiFetch("/api/seen", {
            method: "POST",
            ...jsonBody(msg.videoId ? { videoId: msg.videoId } : {}),
          });
          updateBadge();
          sendResponse({ ok: true });
          break;
        }

        default:
          sendResponse({ ok: false, error: "unknown message" });
      }
    } catch (err) {
      const error = err && err.message === "no-server" ? "no-server" : String(err && err.message);
      sendResponse({ ok: false, error });
    }
  })();
  return true; // asynchrone Antwort
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("badge", { periodInMinutes: 30 });
  updateBadge();
});
chrome.runtime.onStartup.addListener(() => updateBadge());
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "badge") updateBadge();
});
