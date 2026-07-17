// Popup: zeigt die zentrale Abo-Liste vom yt-follow-Server (via Service Worker).

const $ = (sel) => document.querySelector(sel);

let state = { channels: [], videos: [], lastCheck: null };
let filter = null; // aktive Kanal-ID zum Filtern, oder null = alle

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
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

function showNotice(html) {
  const n = $("#notice");
  n.innerHTML = html;
  n.hidden = false;
  const btn = n.querySelector("button");
  if (btn) btn.onclick = () => chrome.runtime.openOptionsPage();
}

function paintChannels() {
  const box = $("#channels");
  box.innerHTML = "";

  if (!state.channels.length) {
    box.innerHTML =
      '<p class="empty">Noch keine Kanäle. Auf einer YouTube-Kanalseite den „Folgen"-Button nutzen oder oben eintragen.</p>';
    return;
  }

  const allChip = document.createElement("button");
  allChip.className = "chip filter" + (filter === null ? " active" : "");
  allChip.textContent = "Alle";
  allChip.onclick = () => {
    filter = null;
    paint();
  };
  box.appendChild(allChip);

  for (const c of state.channels) {
    const chip = document.createElement("button");
    chip.className = "chip filter" + (filter === c.id ? " active" : "");
    chip.textContent = c.name;
    chip.title = "Nur diesen Kanal anzeigen";
    chip.onclick = () => {
      filter = filter === c.id ? null : c.id;
      paint();
    };
    box.appendChild(chip);
  }
}

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

    // Zwei-Klick-Loeschen (confirm() wuerde das Popup schliessen).
    const del = document.createElement("button");
    del.className = "trash";
    del.title = "Kanal löschen";
    del.textContent = "🗑";
    del.onclick = async () => {
      if (del.dataset.confirm === "1") {
        await send({ type: "unfollow", id: c.id });
        if (filter === c.id) filter = null;
        await load();
      } else {
        list.querySelectorAll(".trash").forEach((b) => {
          b.dataset.confirm = "";
          b.textContent = "🗑";
          b.classList.remove("confirm");
        });
        del.dataset.confirm = "1";
        del.textContent = "Löschen?";
        del.classList.add("confirm");
      }
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

  for (const v of vids.slice(0, 50)) {
    const a = document.createElement("a");
    a.className = "video" + (v.seen ? "" : " unseen");
    a.href = v.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.innerHTML = `
      ${v.thumbnail ? `<img src="${v.thumbnail}" alt="">` : '<img alt="">'}
      <div class="info">
        <div class="title">${escapeHtml(v.title)}</div>
        <div class="sub">${escapeHtml(v.channelName)} &middot; ${timeAgo(v.published)}</div>
      </div>`;
    a.onclick = () => send({ type: "seen", videoId: v.videoId });
    box.appendChild(a);
  }
}

function updateUnseen() {
  const n = state.videos.filter((v) => !v.seen).length;
  const badge = $("#unseenBadge");
  badge.textContent = n > 99 ? "99+" : String(n);
  badge.hidden = n === 0;
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
  const res = await send({ type: "getState" });

  if (!res || !res.ok) {
    $("#channels").innerHTML = "";
    $("#videos").innerHTML = "";
    $("#manageList").innerHTML = "";
    $("#manage").hidden = true;
    $("#meta").textContent = "";
    $("#unseenBadge").hidden = true;
    if (res && res.error === "no-server") {
      showNotice('Kein Server eingerichtet. <button>Einstellungen öffnen</button>');
    } else {
      showNotice(
        'Server nicht erreichbar. Bist du im richtigen Netz? <button>Einstellungen</button>'
      );
    }
    return;
  }
  $("#notice").hidden = true;

  state = {
    channels: res.state.channels || [],
    videos: res.state.videos || [],
    lastCheck: res.state.lastCheck || null,
  };
  if (filter && !state.channels.some((c) => c.id === filter)) filter = null;
  paint();
}

const addDialog = $("#addDialog");

function openAddDialog() {
  $("#addInput").value = "";
  $("#addStatus").textContent = "";
  addDialog.showModal();
  $("#addInput").focus();
}

async function addChannel() {
  const value = $("#addInput").value.trim();
  if (!value) return;
  $("#addStatus").textContent = "Suche Kanal…";
  const res = await send({ type: "follow", value });
  if (res && res.ok) {
    addDialog.close();
    $("#status").textContent = res.channel ? `„${res.channel.name}" hinzugefügt.` : "Hinzugefügt.";
    await load();
  } else if (res && res.error === "no-server") {
    $("#addStatus").textContent = "Bitte zuerst den Server einrichten (Einstellungen).";
  } else {
    $("#addStatus").textContent = (res && res.error) || "Kanal nicht gefunden.";
  }
}

$("#addBtn").onclick = openAddDialog;
$("#addConfirm").onclick = addChannel;
$("#addCancel").onclick = () => addDialog.close();
$("#addInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addChannel();
});
addDialog.addEventListener("click", (e) => {
  if (e.target === addDialog) addDialog.close();
});

$("#manageBtn").onclick = () => {
  const m = $("#manage");
  m.hidden = !m.hidden;
};
$("#manageClose").onclick = () => {
  $("#manage").hidden = true;
};

$("#settings").onclick = () => chrome.runtime.openOptionsPage();

$("#refresh").onclick = async () => {
  const btn = $("#refresh");
  btn.classList.add("spinning");
  btn.disabled = true;
  $("#status").textContent = "Aktualisiere…";
  try {
    const res = await send({ type: "refresh" });
    if (res && res.ok) $("#status").textContent = res.newCount ? `${res.newCount} neue Videos` : "Aktuell.";
    else $("#status").textContent = "Server nicht erreichbar.";
    await load();
  } finally {
    btn.classList.remove("spinning");
    btn.disabled = false;
  }
};

$("#markAll").onclick = async () => {
  await send({ type: "seen" });
  await load();
};

load();
