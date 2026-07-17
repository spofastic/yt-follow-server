# Deploy: GitHub → GHCR → Portainer (Synology NAS)

Ziel: den Server als **fertiges Docker-Image** über GitHub bereitstellen und als
**Portainer-Stack** auf der Synology installieren – zunächst im LAN, später per
Reverse Proxy im WAN.

> Kurzantwort auf „geht das mit GitHub?": **Ja, GitHub allein reicht.** Du brauchst
> weder Docker Hub noch eine andere Plattform. GitHub baut das Image (Actions) und
> hostet es (GitHub Container Registry, `ghcr.io`).

---

## Teil A – Einmalig: Image auf GitHub bauen lassen

### 1. Repository anlegen
- Auf GitHub ein neues Repository erstellen, z. B. `yt-follow-server`
  (Name **klein schreiben** – GHCR-Image-Namen sind lowercase).
- Den Inhalt des Ordners `yt-follow-server` (inkl. `.github/`) hochladen:

```bash
cd yt-follow-server
git init
git add .
git commit -m "YouTube Follow Server"
git branch -M main
git remote add origin https://github.com/<DEIN-NAME>/yt-follow-server.git
git push -u origin main
```

### 2. Build läuft automatisch
- Der Push löst den Workflow [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml) aus.
- Unter **Actions** im Repo siehst du den Fortschritt. Er baut `linux/amd64` **und**
  `linux/arm64` und pusht nach `ghcr.io/<DEIN-NAME>/yt-follow-server`.
- Dauer: ca. 2–4 Minuten.

### 3. Image öffentlich machen (empfohlen, dann braucht Portainer kein Login)
- Repo → rechts **Packages** → das Paket `yt-follow-server` öffnen.
- **Package settings** → **Change visibility** → **Public**.
- (Bleibt es privat, siehe unten „Privates Image in Portainer".)

Fertig – dein Image liegt jetzt unter:
```
ghcr.io/<DEIN-NAME>/yt-follow-server:latest
```

---

## Teil B – Portainer-Stack auf der Synology

Es gibt zwei Wege. **Repository** ist bequemer (holt die Compose direkt aus GitHub,
Updates per Klick); **Web editor** ist am schnellsten für den ersten Test.

### Variablen (stack.env)
Die [`stack.yml`](stack.yml) nutzt Variablen mit Defaults (`HOST_PORT`,
`POLL_MINUTES`, `TZ`) – es läuft also auch **ohne** dass du etwas setzt. Zum
Ändern dient [`stack.env`](stack.env):
- **Web editor / Upload:** Werte einfach im Portainer-Formular („Environment
  variables") setzen – Portainer erzeugt `stack.env` selbst.
- **Repository:** Portainer schreibt nicht in dein Git; deshalb liegt `stack.env`
  bereits im Repo. Werte dort ändern → committen → in Portainer neu deployen.

### Weg 1 – Repository (empfohlen)
- Portainer → **Stacks** → **Add stack** → Name `yt-follow`.
- Build method: **Repository**.
  - Repository URL: `https://github.com/spofastic/yt-follow-server`
  - Repository reference: `refs/heads/main`
  - Compose path: `stack.yml`
  - (Privates Repo → **Authentication** an, GitHub-Name + PAT mit `repo`.)
- **Deploy the stack**.

### Weg 2 – Web editor (schnellster erster Test)
- Portainer → **Stacks** → **Add stack** → Name `yt-follow`.
- Methode **Web editor**, Inhalt von [`stack.yml`](stack.yml) einfügen.
- **Deploy the stack**.

> Der Image-Name in `stack.yml` ist bereits auf `ghcr.io/spofastic/yt-follow-server:latest`
> gesetzt – nichts mehr anzupassen.

### 2. Aufrufen
- Von der NAS/aus dem LAN:
  ```
  http://<NAS-IP>:8080
  ```
  (Port ggf. anpassen, falls 8080 auf der NAS belegt ist – dann in `stack.yml`
  z. B. `- "842:8080"` und `http://<NAS-IP>:842` aufrufen.)

### 3. Datenspeicherung
- Standard ist ein **benanntes Volume** `yt-follow-data` (von Portainer verwaltet).
- Wer die Daten lieber in einem Synology-Ordner hätte (einfacher zu sichern):
  in `stack.yml` den Bind-Mount aktivieren
  (`/volume1/docker/yt-follow/data:/app/data`) und den Ordner vorher anlegen.

### Privates Image in Portainer (nur falls nicht öffentlich)
- Portainer → **Registries** → **Add registry** → **Custom**:
  - URL: `ghcr.io`
  - Username: dein GitHub-Name
  - Password: ein **Personal Access Token (classic)** mit Scope `read:packages`
- Beim Stack dann diese Registry auswählen.

---

## Teil C – Updates einspielen
- Code ändern → nach GitHub pushen → Actions baut automatisch ein neues `:latest`.
- In Portainer den Stack öffnen → **Pull and redeploy** (bzw. Container neu
  erstellen mit „Re-pull image").
- Optional: [Watchtower](https://containrrr.dev/watchtower/) als eigener Container
  aktualisiert `:latest`-Container automatisch.

---

## Teil D – Später: WAN über Reverse Proxy

Diese App ist reverse-proxy-tauglich (relative Pfade, lauscht auf `0.0.0.0`). Für
den WAN-Zugriff brauchst du HTTPS – das liefert der Reverse Proxy.

**Variante 1 – Synology-Bordmittel:**
- **Systemsteuerung → Anmeldeportal → Erweitert → Reverse Proxy**
- Quelle: `https://yt.deinedomain.de` (Port 443)
- Ziel: `http://localhost:8080` (bzw. NAS-IP:Port)
- Zertifikat: Synology kann per **Let's Encrypt** automatisch eines ausstellen.

**Variante 2 – Container (z. B. Nginx Proxy Manager / Traefik / Caddy):**
- Läuft als eigener Stack, terminiert TLS, leitet `yt.deinedomain.de` → `yt-follow:8080`.

**Wichtige Punkte für den WAN-Betrieb:**
- Am besten eine **eigene Subdomain** (`yt.deinedomain.de`) nutzen, nicht einen
  Unterpfad – die App liegt im Web-Root.
- Erst **mit HTTPS** funktionieren auf dem iPhone die vollen PWA-Funktionen
  (Service Worker, Offline-Shell, später Push). Siehe Hinweis unten.
- **Zugriffsschutz** einbauen (die App hat bewusst keine eigene Anmeldung): z. B.
  Basic-Auth am Proxy, Nur-VPN-Zugriff, oder Geo/IP-Beschränkung. Sonst ist dein
  Abo-Server offen im Netz.

---

## Hinweis: PWA & HTTPS (iPhone)
- **Im LAN über `http://<ip>:8080`**: Die Web-App läuft und du kannst sie auf dem
  iPhone „Zum Home-Bildschirm" hinzufügen (App-Icon). Der **Service Worker** wird
  in diesem Fall aber nicht aktiv – Browser erlauben ihn nur im „secure context"
  (HTTPS oder `localhost`). Ohne ihn fehlen nur Offline-Cache/Push, die
  Grundfunktion bleibt voll erhalten.
- **Ab dem Reverse-Proxy mit HTTPS** greifen die vollen PWA-Funktionen automatisch –
  keine Code-Änderung nötig.
