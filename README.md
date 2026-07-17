# YouTube Follow – Server (Docker, kontofrei)

Ein kleiner Server, der YouTube-Kanälen **ohne Google-Konto und ohne Login** folgt.
Er pollt die öffentlichen RSS-Feeds zentral und liefert eine **PWA (Web-App)**, die
auf **iPhone/iPad, Windows, Linux, macOS und Android** im Browser läuft – alle Geräte
teilen sich **eine** Abo-Liste. Datenhaltung: eine JSON-Datei im Docker-Volume.

## Warum ein Server (statt nur der Browser-Extension)?
- iOS erlaubt keine Browser-Extensions – **aber** jede Webseite/PWA läuft dort.
- Eine zentrale Abo-Liste für alle Geräte, statt „pro Browser getrennt".
- Das Pollen passiert einmal zentral statt auf jedem Client.

## Zwei Wege zur Installation
- **Lokal bauen** (zum Entwickeln/Testen): `docker-compose.yml` – baut das Image
  direkt aus dem Quellcode. Siehe unten.
- **Als Portainer-Stack auf der NAS** (empfohlen fürs Dauer-Deployment): fertiges
  Image aus der GitHub Container Registry, siehe **[DEPLOY.md](DEPLOY.md)** und
  `stack.yml`.

## Start (Docker Compose, lokal bauen)
Im Ordner `yt-follow-server`:

```bash
docker compose up -d --build
```

Danach im Browser öffnen (Rechner, auf dem Docker läuft):

```
http://localhost:8080
```

Von anderen Geräten **im selben WLAN** über die lokale IP des Servers, z. B.:

```
http://192.168.1.50:8080
```

> Die IP findest du unter Windows mit `ipconfig` (IPv4-Adresse), unter Linux/macOS
> mit `ip addr` bzw. `ifconfig`. Diese Version ist für den **Heimnetz-Betrieb**
> gedacht (HTTP, kein Zugriff von außen).

## Ohne Docker (zum Testen)
Node.js ≥ 18 vorausgesetzt:

```bash
npm install
npm start
```

## Auf dem iPhone als App installieren
1. Die Server-Adresse (`http://<server-ip>:8080`) in **Safari** öffnen.
2. Teilen-Symbol → **Zum Home-Bildschirm**.
3. Es erscheint ein App-Icon; die App öffnet im Vollbild ohne Browser-Leiste.

(Auf Android/Chrome: Menü → „App installieren". Auf dem Desktop: Installier-Symbol
in der Adressleiste.)

## Bedienung
- Oben einen Kanal per **URL**, **@handle** oder **UC…-ID** hinzufügen.
- **Aktualisieren** holt sofort neue Videos; sonst automatisch alle 30 Min.
- **Alle gelesen** setzt die „ungesehen"-Markierung zurück.
- Klick auf ein Video öffnet es im normalen YouTube und markiert es als gesehen.

## Konfiguration (Umgebungsvariablen)
| Variable       | Standard   | Bedeutung                          |
|----------------|------------|------------------------------------|
| `PORT`         | `8080`     | HTTP-Port                          |
| `POLL_MINUTES` | `30`       | Abrufintervall der Feeds in Minuten|
| `DATA_DIR`     | `/app/data`| Ablage der `db.json`               |

## REST-API (falls du eigene Clients baust – z. B. die Vivaldi-Extension anbinden)
| Methode | Pfad                  | Zweck                                   |
|---------|-----------------------|-----------------------------------------|
| GET     | `/api/state`          | `{channels, videos, lastCheck}`         |
| POST    | `/api/channels`       | Body `{value}` → Kanal hinzufügen       |
| DELETE  | `/api/channels/:id`   | Kanal entfernen                         |
| POST    | `/api/refresh`        | Feeds sofort pollen → `{newCount}`      |
| POST    | `/api/seen`           | Body `{videoId}` oder `{}` (alle)       |

## Grenzen
- RSS liefert nur die **~15 neuesten** Videos pro Kanal, keine Shorts-/Live-Filter,
  keine Community-Posts.
- Diese Variante ist **unverschlüsseltes HTTP fürs Heimnetz**. Für Zugriff von
  unterwegs bräuchte es Tailscale oder einen Reverse-Proxy mit HTTPS (bewusst
  weggelassen, um es schlank zu halten).
- Push-Benachrichtigungen sind nicht enthalten (brauchen HTTPS).
```
