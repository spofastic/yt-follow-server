// Frontend der PWA. Spricht die REST-API des Servers an; keine lokale Logik noetig.

const $ = (sel) => document.querySelector(sel);

let state = { channels: [], videos: [], lastCheck: null };
let filter = null; // aktive Kanal-ID zum Filtern der Videoliste, oder null = alle

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  return res.json();
}

function timeAgo(iso) {
  if (!iso) return "";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tag${d === 1 ? "" : "en"}`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// --- Kanal-Filter als Dropdown (eine Zeile, alle Kanaele erreichbar) ---
function paintChannels() {
  const box = $("#channels");
  box.innerHTML = "";

  if (!state.channels.length) {
    box.innerHTML =
      '<p class="empty">Noch keine Kanäle. Über das Zahnrad einen Kanal hinzufügen.</p>';
    return;
  }

  const sel = document.createElement("select");
  sel.className = "filter-select";
  sel.setAttribute("aria-label", "Kanal filtern");

  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "Alle Kanäle";
  sel.appendChild(optAll);

  for (const c of state.channels) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.name;
    sel.appendChild(o);
  }

  sel.value = filter || "";
  sel.onchange = () => {
    filter = sel.value || null;
    paint();
  };
  box.appendChild(sel);
}

// --- Verwalten-Panel: Liste mit Muelleimer zum Loeschen ---
function paintManage() {
  const list = $("#manageList");
  list.innerHTML = "";
  if (!state.channels.length) {
    list.innerHTML = '<p class="empty">Keine Kanäle.</p>';
    return;
  }
  for (const c of state.channels) {
    const row = document.createElement("div");
    row.className = "manage-row";
    const label = document.createElement("span");
    label.textContent = c.name;
    row.appendChild(label);

    const del = document.createElement("button");
    del.className = "trash";
    del.title = "Kanal löschen";
    del.setAttribute("aria-label", `${c.name} löschen`);
    del.textContent = "🗑";
    del.onclick = async () => {
      if (!confirm(`„${c.name}" wirklich nicht mehr folgen?`)) return;
      await api(`/api/channels/${encodeURIComponent(c.id)}`, { method: "DELETE" });
      if (filter === c.id) filter = null;
      await load();
    };
    row.appendChild(del);
    list.appendChild(row);
  }
}

function paintVideos() {
  const box = $("#videos");
  box.innerHTML = "";
  let vids = state.videos;
  if (filter) vids = vids.filter((v) => v.channelId === filter);

  if (!vids.length) {
    if (state.channels.length)
      box.innerHTML = '<p class="empty">Keine Videos für diese Auswahl.</p>';
    return;
  }

  for (const v of vids.slice(0, 80)) {
    const a = document.createElement("a");
    a.className = "video" + (v.seen ? "" : " unseen");
    a.href = v.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.innerHTML = `
      ${v.thumbnail ? `<img src="${v.thumbnail}" alt="" loading="lazy">` : '<img alt="">'}
      <div class="info">
        <div class="title">${escapeHtml(v.title)}</div>
        <div class="sub">${escapeHtml(v.channelName)} &middot; ${timeAgo(v.published)}</div>
      </div>`;
    a.onclick = () =>
      api("/api/seen", { method: "POST", body: JSON.stringify({ videoId: v.videoId }) });
    box.appendChild(a);
  }
}

function updateUnseen() {
  const n = state.videos.filter((v) => !v.seen).length;
  const badge = $("#unseenBadge");
  badge.textContent = n > 99 ? "99+" : String(n);
  badge.hidden = n === 0;
  document.title = n > 0 ? `(${n}) u2be w/o ggl` : "u2be w/o ggl";
}

function paint() {
  paintChannels();
  paintManage();
  paintVideos();
  updateUnseen();
  $("#meta").textContent = state.lastCheck
    ? `Zuletzt aktualisiert: ${new Date(state.lastCheck).toLocaleString("de-DE")}`
    : "";
}

async function load() {
  const data = await api("/api/state");
  state = {
    channels: data.channels || [],
    videos: data.videos || [],
    lastCheck: data.lastCheck || null,
  };
  if (filter && !state.channels.some((c) => c.id === filter)) filter = null;
  paint();
}

async function addChannel() {
  const value = $("#addInput").value.trim();
  if (!value) return;
  $("#addStatus").textContent = "Suche Kanal…";
  const res = await api("/api/channels", {
    method: "POST",
    body: JSON.stringify({ value }),
  });
  if (res && res.ok) {
    $("#addInput").value = "";
    $("#addStatus").textContent = `„${res.channel.name}" hinzugefügt.`;
    await load();
  } else {
    $("#addStatus").textContent = (res && res.error) || "Kanal nicht gefunden.";
  }
}

$("#addConfirm").onclick = addChannel;
$("#addInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addChannel();
});

$("#manageBtn").onclick = () => {
  const m = $("#manage");
  m.hidden = !m.hidden;
  if (!m.hidden) {
    $("#addStatus").textContent = "";
    $("#addInput").focus();
  }
};
$("#manageClose").onclick = () => {
  $("#manage").hidden = true;
};

// --- Backup: Kanalliste herunterladen / einspielen ---
$("#exportBtn").onclick = () => {
  const a = document.createElement("a");
  a.href = "/api/export";
  a.download = "yt-follow-backup.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
};

$("#importBtn").onclick = () => $("#importFile").click();
$("#importFile").onchange = async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = ""; // erneutes Auswaehlen derselben Datei erlauben
  if (!file) return;
  $("#addStatus").textContent = "Backup wird eingespielt…";
  try {
    const data = JSON.parse(await file.text());
    const channels = Array.isArray(data) ? data : data.channels;
    if (!Array.isArray(channels)) throw new Error("Ungültiges Backup-Format.");
    const res = await api("/api/import", {
      method: "POST",
      body: JSON.stringify({ channels }),
    });
    $("#addStatus").textContent =
      res && res.ok ? `${res.added} Kanäle ergänzt (gesamt ${res.total}).` : "Import fehlgeschlagen.";
    await load();
  } catch (err) {
    $("#addStatus").textContent = "Datei konnte nicht gelesen werden.";
  }
};

$("#refresh").onclick = async () => {
  const btn = $("#refresh");
  btn.classList.add("spinning");
  btn.disabled = true;
  $("#status").textContent = "Aktualisiere…";
  try {
    const res = await api("/api/refresh", { method: "POST" });
    $("#status").textContent = res && res.newCount ? `${res.newCount} neue Videos` : "Aktuell.";
    await load();
  } finally {
    btn.classList.remove("spinning");
    btn.disabled = false;
  }
};

$("#markAll").onclick = async () => {
  await api("/api/seen", { method: "POST", body: JSON.stringify({}) });
  await load();
};

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

load();
setInterval(load, 60000); // Anzeige minuetlich auffrischen
