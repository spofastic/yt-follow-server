// Minimaler Service Worker: macht die App installierbar (PWA) und cached die Shell.
// API-Aufrufe laufen bewusst ohne Cache, damit die Video-Liste immer aktuell ist.

const CACHE = "ytf-shell-v5";
const SHELL = ["./", "index.html", "style.css", "app.js", "icon.svg", "manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return; // API nie cachen
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
