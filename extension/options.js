// Optionsseite: Server-URL speichern, Host-Berechtigung anfordern, Verbindung testen.

const urlInput = document.getElementById("url");
const statusEl = document.getElementById("status");

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

async function load() {
  const { serverUrl } = await chrome.storage.sync.get("serverUrl");
  if (serverUrl) urlInput.value = serverUrl;
}

async function save() {
  const url = urlInput.value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(url)) {
    setStatus("URL muss mit http:// oder https:// beginnen.", "err");
    return;
  }
  let origin;
  try {
    const u = new URL(url);
    origin = `${u.protocol}//${u.hostname}/*`; // Port wird vom Muster ignoriert
  } catch {
    setStatus("Ungültige URL.", "err");
    return;
  }

  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    setStatus("Zugriffsberechtigung wurde nicht erteilt.", "err");
    return;
  }

  await chrome.storage.sync.set({ serverUrl: url });
  setStatus("Gespeichert. Teste Verbindung…");
  try {
    const res = await fetch(url + "/api/state");
    if (res.ok) setStatus("✓ Verbindung erfolgreich. Alles bereit.", "ok");
    else setStatus(`Gespeichert, aber Server antwortete mit HTTP ${res.status}.`, "err");
  } catch {
    setStatus(
      "Gespeichert, aber Server nicht erreichbar. Bist du im richtigen Netz (WLAN/VPN)?",
      "err"
    );
  }
}

document.getElementById("save").addEventListener("click", save);
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") save();
});
load();
