# YouTube Follow – Vivaldi/Chromium-Extension (Server-Client)

Diese Extension ist der **Windows/Desktop-Client** für deinen zentralen
**yt-follow-Server**. Der „Folgen"-Button auf YouTube-Kanalseiten trägt den Kanal
direkt in die **gemeinsame Liste** auf dem Server ein – dieselbe Liste, die auch
die PWA und der iOS-Kurzbefehl befüllen. Nichts wird mehr nur lokal gespeichert.

> Voraussetzung: Der **yt-follow-Server** läuft (siehe Ordner `yt-follow-server`)
> und ist von diesem Rechner erreichbar (im Heim-WLAN per LAN-IP, unterwegs per
> Tailscale/Reverse-Proxy).

## Funktionen
- „➕ Folgen"-Button auf jeder YouTube-Kanalseite → schreibt an den Server
- Popup zeigt die zentrale Abo-Liste + neueste Videos (vom Server)
- Kanäle auch per URL/@handle/UC-ID im Popup hinzufügen
- Badge-Zähler für ungesehene Videos

## Installation (Windows / Linux / macOS)
1. `vivaldi://extensions` öffnen → **Entwicklermodus** aktivieren
2. **Entpackte Erweiterung laden** → diesen Ordner (`vivaldi-yt-follow`) wählen
3. Nach dem Laden **einmalig einrichten** (siehe unten)

## Einrichtung (wichtig!)
1. Auf das Extension-Icon rechtsklicken → **Optionen**
   (oder im Popup auf **⚙**).
2. **Server-URL** eintragen, z. B. `http://10.10.10.100:8080`
3. **Speichern & testen** – Vivaldi fragt einmalig nach der Zugriffsberechtigung
   für diese Adresse (**Erlauben**). Danach meldet die Seite „✓ Verbindung
   erfolgreich".

## Nutzung
- YouTube-Kanalseite öffnen → Button **„➕ Folgen"** → Kanal landet auf dem Server.
- Zeigt der Button **„⚙ Server einrichten"**, ist noch keine URL gesetzt → Optionen.
- Popup (Icon anklicken) zeigt die zentrale Liste; **Aktualisieren** stößt einen
  Feed-Abruf am Server an, **Alle gelesen** setzt den Zähler zurück.

## Warum ein Server-Client?
Damit **alle** Geräte dieselbe Abo-Liste teilen: Windows-Button, iOS-Kurzbefehl
und PWA schreiben in denselben Server. Kein Google-Konto, kein YouTube-Login.

## Grenzen / Hinweise
- Ohne erreichbaren Server kann der Button nichts eintragen (im richtigen Netz sein).
- Die Channel-ID-Erkennung stützt sich auf das YouTube-Seiten-HTML; ändert YouTube
  sein Markup, muss ggf. die Erkennung in `content.js` angepasst werden.
- Der Server-Zugriff nutzt eine **optionale Host-Berechtigung**, die du bei der
  Einrichtung genau für deine Server-Adresse erteilst (kein pauschaler Zugriff).
