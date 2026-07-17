// Kontofreier YouTube-Abo-Server.
// Pollt die oeffentlichen RSS-Feeds abonnierter Kanaele und stellt eine REST-API
// + PWA bereit. Keine Google-/YouTube-Anmeldung, kein API-Key. Daten liegen als
// JSON im Docker-Volume (DATA_DIR).

import express from "express";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 8080);
const POLL_MINUTES = Number(process.env.POLL_MINUTES || 30);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const MAX_VIDEOS = 1000;

const UA =
  "Mozilla/5.0 (compatible; yt-follow-server/1.0; +local)"; // hoefliche Kennung

let db = { channels: [], videos: [], lastCheck: null };
let saveTimer = null;

// ---------- Persistenz ----------
async function loadDb() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  if (existsSync(DB_FILE)) {
    try {
      db = JSON.parse(await readFile(DB_FILE, "utf8"));
      db.channels ||= [];
      db.videos ||= [];
    } catch (err) {
      console.error("[db] konnte db.json nicht lesen:", err.message);
    }
  }
}

function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await writeFile(DB_FILE, JSON.stringify(db), "utf8");
    } catch (err) {
      console.error("[db] Speichern fehlgeschlagen:", err.message);
    }
  }, 200);
}

// ---------- RSS ----------
const FEED_URL = (id) =>
  `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseFeed(xml, channelId, fallbackName) {
  const entries = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml))) {
    const block = m[1];
    const pick = (re) => (block.match(re) || [])[1];
    const videoId = pick(/<yt:videoId>(.*?)<\/yt:videoId>/);
    if (!videoId) continue;
    entries.push({
      videoId,
      title: decodeEntities(pick(/<title>([\s\S]*?)<\/title>/) || ""),
      published: pick(/<published>(.*?)<\/published>/) || "",
      url:
        pick(/<link rel="alternate" href="(.*?)"/) ||
        `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: pick(/<media:thumbnail url="(.*?)"/) || "",
      channelId,
      channelName:
        decodeEntities(pick(/<author>[\s\S]*?<name>(.*?)<\/name>/) || "") ||
        fallbackName ||
        channelId,
    });
  }
  return entries;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} bei ${url}`);
  return res.text();
}

// Eingabe (URL / @handle / UC-ID) -> {id, name}
async function resolveChannel(input) {
  input = (input || "").trim();
  if (!input) return null;

  const pathId = input.match(/\/channel\/(UC[\w-]+)/);
  if (pathId) return channelMeta(pathId[1]);
  if (/^UC[\w-]{20,}$/.test(input)) return channelMeta(input);

  const url = /^https?:\/\//.test(input)
    ? input
    : `https://www.youtube.com/@${input.replace(/^@/, "")}`;
  try {
    const html = await fetchText(url);
    const idm =
      html.match(/"(?:externalId|channelId)":"(UC[\w-]+)"/) ||
      html.match(/\/channel\/(UC[\w-]+)/);
    if (!idm) return null;
    const nameM = html.match(/<meta property="og:title" content="([^"]*)"/);
    return { id: idm[1], name: nameM ? decodeEntities(nameM[1]) : idm[1] };
  } catch {
    return null;
  }
}

async function channelMeta(id) {
  try {
    const html = await fetchText(`https://www.youtube.com/channel/${id}`);
    const nameM = html.match(/<meta property="og:title" content="([^"]*)"/);
    if (nameM) return { id, name: decodeEntities(nameM[1]) };
  } catch {}
  return { id, name: id };
}

async function pollAll() {
  const known = new Set(db.videos.map((v) => v.videoId));
  let newCount = 0;
  for (const ch of db.channels) {
    try {
      const xml = await fetchText(FEED_URL(ch.id));
      for (const e of parseFeed(xml, ch.id, ch.name)) {
        if (!known.has(e.videoId)) {
          known.add(e.videoId);
          db.videos.push({ ...e, seen: false, addedAt: Date.now() });
          newCount++;
        }
      }
    } catch (err) {
      console.warn("[poll] Feed-Fehler", ch.id, err.message);
    }
  }
  db.videos.sort((a, b) => new Date(b.published) - new Date(a.published));
  if (db.videos.length > MAX_VIDEOS) db.videos.length = MAX_VIDEOS;
  db.lastCheck = Date.now();
  saveDb();
  if (newCount) console.log(`[poll] ${newCount} neue Videos`);
  return newCount;
}

// ---------- API ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/state", (_req, res) => {
  res.json(db);
});

app.post("/api/channels", async (req, res) => {
  const info = await resolveChannel(req.body?.value);
  if (!info) return res.status(404).json({ error: "Kanal nicht gefunden" });
  if (!db.channels.some((c) => c.id === info.id)) {
    db.channels.push({ id: info.id, name: info.name, addedAt: Date.now() });
    saveDb();
    await pollAll();
  }
  res.json({ ok: true, channel: info });
});

app.delete("/api/channels/:id", (req, res) => {
  const { id } = req.params;
  db.channels = db.channels.filter((c) => c.id !== id);
  db.videos = db.videos.filter((v) => v.channelId !== id);
  saveDb();
  res.json({ ok: true });
});

// Backup: aktuelle Kanalliste als JSON zum Download.
app.get("/api/export", (_req, res) => {
  const backup = {
    type: "yt-follow-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    channels: db.channels.map((c) => ({ id: c.id, name: c.name })),
  };
  res.setHeader("Content-Disposition", 'attachment; filename="yt-follow-backup.json"');
  res.json(backup);
});

// Backup einspielen: fehlende Kanaele ergaenzen (bestehende bleiben erhalten).
app.post("/api/import", async (req, res) => {
  const incoming = Array.isArray(req.body?.channels) ? req.body.channels : [];
  let added = 0;
  for (const c of incoming) {
    const id = typeof c === "string" ? c : c?.id;
    if (!/^UC[\w-]{20,}$/.test(id || "")) continue;
    if (db.channels.some((x) => x.id === id)) continue;
    const name = (typeof c === "object" && c?.name) || id;
    db.channels.push({ id, name, addedAt: Date.now() });
    added++;
  }
  if (added) {
    saveDb();
    await pollAll();
  }
  res.json({ ok: true, added, total: db.channels.length });
});

app.post("/api/refresh", async (_req, res) => {
  const newCount = await pollAll();
  res.json({ ok: true, newCount });
});

app.post("/api/seen", (req, res) => {
  const videoId = req.body?.videoId;
  db.videos = db.videos.map((v) =>
    videoId ? (v.videoId === videoId ? { ...v, seen: true } : v) : { ...v, seen: true }
  );
  saveDb();
  res.json({ ok: true });
});

// ---------- Start ----------
await loadDb();
app.listen(PORT, () => {
  console.log(`yt-follow-server laeuft auf http://0.0.0.0:${PORT}`);
  console.log(`Poll-Intervall: ${POLL_MINUTES} Min | Daten: ${DB_FILE}`);
});
pollAll();
setInterval(pollAll, POLL_MINUTES * 60 * 1000);
