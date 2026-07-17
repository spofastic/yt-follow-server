// Frontend der PWA. Spricht die REST-API des Servers an; keine lokale Logik noetig.

const $ = (sel) => document.querySelector(sel);

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

async function render() {
  const { channels = [], videos = [], lastCheck } = await api("/api/state");

  const chBox = $("#channels");
  chBox.innerHTML = "";
  if (!channels.length) {
    chBox.innerHTML =
      '<p class="empty">Noch keine Kanäle. Oben eine Kanal-URL oder einen @handle eintragen.</p>';
  } else {
    for (const c of channels) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.innerHTML = `<span>${escapeHtml(c.name)}</span>`;
      const rm = document.createElement("button");
      rm.textContent = "×";
      rm.title = "Nicht mehr folgen";
      rm.onclick = async () => {
        await api(`/api/channels/${encodeURIComponent(c.id)}`, { method: "DELETE" });
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
    for (const v of videos.slice(0, 80)) {
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
  const res = await api("/api/channels", {
    method: "POST",
    body: JSON.stringify({ value }),
  });
  if (res && res.ok) {
    inp.value = "";
    $("#status").textContent = `„${res.channel.name}" hinzugefügt.`;
    render();
  } else {
    $("#status").textContent = (res && res.error) || "Kanal nicht gefunden.";
  }
}

$("#addBtn").onclick = addChannel;
$("#addInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addChannel();
});

$("#refresh").onclick = async () => {
  $("#status").textContent = "Aktualisiere…";
  const res = await api("/api/refresh", { method: "POST" });
  $("#status").textContent = res && res.newCount ? `${res.newCount} neue Videos` : "Aktuell.";
  render();
};

$("#markAll").onclick = async () => {
  await api("/api/seen", { method: "POST", body: JSON.stringify({}) });
  render();
};

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

render();
setInterval(render, 60000); // Anzeige minuetlich auffrischen
