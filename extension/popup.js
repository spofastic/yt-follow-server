// Popup: zeigt die zentrale Abo-Liste vom yt-follow-Server (via Service Worker).

const $ = (sel) => document.querySelector(sel);

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

async function render() {
  const res = await send({ type: "getState" });

  if (!res || !res.ok) {
    $("#channels").innerHTML = "";
    $("#videos").innerHTML = "";
    $("#meta").textContent = "";
    if (res && res.error === "no-server") {
      showNotice(
        'Kein Server eingerichtet. <button>Einstellungen öffnen</button>'
      );
    } else {
      showNotice(
        'Server nicht erreichbar. Bist du im richtigen Netz? <button>Einstellungen</button>'
      );
    }
    return;
  }
  $("#notice").hidden = true;

  const { channels = [], videos = [], lastCheck } = res.state;

  const chBox = $("#channels");
  chBox.innerHTML = "";
  if (!channels.length) {
    chBox.innerHTML =
      '<p class="empty">Noch keine Kanäle. Auf einer YouTube-Kanalseite den „Folgen"-Button nutzen oder oben eintragen.</p>';
  } else {
    for (const c of channels) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.innerHTML = `<span>${escapeHtml(c.name)}</span>`;
      const rm = document.createElement("button");
      rm.textContent = "×";
      rm.title = "Nicht mehr folgen";
      rm.onclick = async () => {
        await send({ type: "unfollow", id: c.id });
        render();
      };
      chip.appendChild(rm);
      chBox.appendChild(chip);
    }
  }

  const vBox = $("#videos");
  vBox.innerHTML = "";
  if (!videos.length) {
    if (channels.length) vBox.innerHTML = '<p class="empty">Noch keine Videos geladen.</p>';
  } else {
    for (const v of videos.slice(0, 50)) {
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
      vBox.appendChild(a);
    }
  }

  $("#meta").textContent = lastCheck
    ? `Zuletzt aktualisiert: ${new Date(lastCheck).toLocaleString("de-DE")}`
    : "";
}

async function addChannel() {
  const inp = $("#addInput");
  const value = inp.value.trim();
  if (!value) return;
  $("#status").textContent = "Suche Kanal…";
  const res = await send({ type: "follow", value });
  if (res && res.ok) {
    inp.value = "";
    $("#status").textContent = res.channel ? `„${res.channel.name}" hinzugefügt.` : "Hinzugefügt.";
    render();
  } else if (res && res.error === "no-server") {
    $("#status").textContent = "Bitte zuerst den Server einrichten.";
  } else {
    $("#status").textContent = (res && res.error) || "Kanal nicht gefunden.";
  }
}

$("#addBtn").onclick = addChannel;
$("#addInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addChannel();
});

$("#settings").onclick = () => chrome.runtime.openOptionsPage();

$("#refresh").onclick = async () => {
  $("#status").textContent = "Aktualisiere…";
  const res = await send({ type: "refresh" });
  if (res && res.ok) $("#status").textContent = res.newCount ? `${res.newCount} neue Videos` : "Aktuell.";
  else $("#status").textContent = "Server nicht erreichbar.";
  render();
};

$("#markAll").onclick = async () => {
  await send({ type: "seen" });
  render();
};

render();
