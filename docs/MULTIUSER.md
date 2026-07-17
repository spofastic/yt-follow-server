# Konzept: Mehrbenutzerfähigkeit

Stand: Entwurf. Der Server ist heute **Single-User** – eine `db.json` mit einer
globalen Kanal-/Videoliste und einem globalen „gesehen"-Status. Dieses Dokument
beschreibt, wie daraus ein **Mehrbenutzer-Server** wird, ohne den kontofreien,
selbstgehosteten Charakter aufzugeben.

## Ziele
- Mehrere Benutzer auf **einer** Server-Instanz.
- Jeder Benutzer hat **eigene Abos** und einen **eigenen gesehen/ungesehen-Status**.
- Listen sind **standardmäßig privat**.
- Jeder YouTube-Kanal wird trotzdem **nur einmal** gepollt (geteilter Video-Cache),
  egal wie viele Benutzer ihn abonniert haben.

## Datenmodell
Kern der Idee: trennen zwischen **„was existiert"** (global) und **„wer will es"**
(pro Benutzer).

| Tabelle | Inhalt |
|---|---|
| `users` | `id`, `name`, `token_hash`, `created_at` |
| `channels` | `id` (UC…), `name` – global, dedupliziert |
| `videos` | `video_id`, `channel_id`, `title`, `url`, `thumbnail`, `published` – global, einmal pro Kanal |
| `subscriptions` | `(user_id, channel_id)` – wer folgt welchem Kanal |
| `seen` | `(user_id, video_id)` – pro Benutzer gelesen |

- **Polling:** Vereinigungsmenge aller `subscriptions` → jeder Kanal genau einmal
  abgerufen → Videos global gespeichert. Kein Mehraufwand pro Benutzer.
- **`/api/state` pro Benutzer:** Videos der abonnierten Kanäle, verknüpft mit dem
  `seen`-Status *dieses* Benutzers.

## Authentifizierung – Optionen
| Option | Wie | Bewertung |
|---|---|---|
| **A) Pro-Benutzer-Token** (empfohlen) | Jeder Benutzer hat ein geheimes Token; Clients senden es als Header (`Authorization: Bearer <token>`). Server bildet Token → Benutzer ab. | Passt **allen drei Clients** sauber (Extension, iOS-Kurzbefehl, PWA). Keine Session/Cookie-Komplexität. |
| **B) Login + Session-Cookie** | Login-Seite in der PWA, `httpOnly`-Cookie. | „Klassisch", aber Cookie-Handling im iOS-Kurzbefehl ist umständlich; braucht Session-Store/CSRF. |
| **C) Reverse-Proxy-Auth** | Authelia/OAuth2-Proxy/Basic-Auth liefert Identität per Header (`Remote-User`); Server vertraut dem Proxy. | Lagert Auth komplett aus – gut, wenn ohnehin ein Proxy steht, koppelt aber an die Infrastruktur. |

**Empfehlung:** **Token-basiert (A)**, weil es zu allen Clients passt und über einen
simplen Header funktioniert. Für den Transport idealerweise mit HTTPS
(Reverse-Proxy/Tailscale) kombinieren. Tokens werden serverseitig **gehasht**
gespeichert.

## Client-Anpassungen
- **Extension:** In der Optionsseite neben der Server-URL ein Feld **„Token"**; der
  Service Worker hängt den Header an jede Anfrage.
- **iOS-Kurzbefehl:** In „Inhalte von URL abrufen" einen **Header** ergänzen
  (`Authorization: Bearer <token>`). Einmalig eingerichtet.
- **PWA:** Kleiner Token-/Login-Dialog beim ersten Start; Token in `localStorage`;
  Header bei jedem `fetch`.

## API-Änderungen
- Alle `/api/*` erfordern Auth (außer ggf. ein Health-Check). Middleware löst
  Token → Benutzer auf, sonst **401**.
- `GET /api/state` → benutzer-spezifische Kanäle + Videos + `seen`.
- `POST /api/channels` → Kanal global anlegen (falls neu) **und** aktuellen Benutzer
  abonnieren.
- `DELETE /api/channels/:id` → nur das **Abo des aktuellen Benutzers** entfernen.
  Globalen Kanal/Videos nur aufräumen, wenn **kein** Benutzer mehr folgt
  (periodische Garbage-Collection).
- `POST /api/seen` → `seen` nur für den aktuellen Benutzer.

## Speicher: JSON → SQLite
Für Single-User reicht JSON. Für Mehrbenutzer mit gleichzeitigen Schreibzugriffen
und relationalen Joins ist **SQLite** (z. B. `better-sqlite3`) die richtige Wahl:
- Transaktionssicher, gleichzeitig nutzbar.
- Weiterhin **eine Datei** im Docker-Volume (`data/db.sqlite`), einfach zu sichern.
- **Migration:** Beim ersten Start der neuen Version eine vorhandene `db.json`
  automatisch als **Standard-Benutzer** importieren (kein Datenverlust).

## Benutzerverwaltung
- **Bootstrap:** Ein Admin-Token per Umgebungsvariable, oder ein kleines
  CLI/Endpoint zum Anlegen von Benutzern.
- **Anlegen:** Bei einem privaten Heim-Server Benutzer **manuell** anlegen
  (keine offene Selbstregistrierung).
- **Optional (Admin):** Benutzer auflisten/löschen.

## Sicherheit
- Mehrbenutzer + Tokens → **HTTPS dringend empfohlen** (Reverse-Proxy/Tailscale),
  da Tokens im Header reisen.
- Tokens **gehasht** ablegen; Rate-Limit bei Fehlversuchen.
- Datenisolation in **jeder** Abfrage erzwingen (immer nach `user_id` filtern).

## Optional: geteilte Listen / Familien-Modus
Später denkbar: Gruppen-Abos oder ein „geteilt"-Flag an einer Liste. Zu Beginn
bewusst **privat pro Benutzer** halten.

## Migrationsplan (phasenweise)
- **Phase 0 (heute):** Single-User wie gehabt.
- **Phase 1:** SQLite + Token-Auth + Benutzer-Scoping. `db.json` → Standard-Benutzer
  migrieren. Clients bekommen ein Token-Feld. *(Das ist der Großteil der Arbeit,
  aber überschaubar.)*
- **Phase 2:** Einfache Benutzerverwaltung (Admin-Endpoint / PWA-Login).
- **Phase 3 (optional):** Geteilte Listen/Gruppen, Admin-Oberfläche.

## Abwägung
Für einen **rein privaten Einzelnutzer** bringt Mehrbenutzer keinen Vorteil und
kostet Komplexität (Auth, HTTPS-Pflicht). Sinnvoll wird es, sobald **mehrere
Personen** (Familie, Freunde) denselben Server nutzen sollen – dann ist Phase 1
die tragfähige Basis.
