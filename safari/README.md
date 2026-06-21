# LinkPortal Safari Extension

Safari-Version der LinkPortal Chrome Extension.  
Basiert auf dem WebExtensions-Standard — gleiche Funktionen, gleiche API.

## Unterschiede zur Chrome-Version

| Feature | Chrome | Safari |
|---------|--------|--------|
| Auto-Konfiguration (Portal-Button) | ✅ | ❌ (Safari erlaubt kein `externally_connectable`) |
| Drag & Drop Sortierung | ✅ | ✅ |
| Offline-Cache | ✅ | ✅ |
| Dark/Light/Auto-Theme | ✅ | ✅ |
| Logo-Restore beim Start | ✅ Safari 16.4+ | ⚠️ (Popup muss einmal geöffnet werden) |
| Hintergrund-Sync alle 30 Min | ✅ | ✅ Safari 16.4+ |

---

## Installation — Schritt für Schritt

### Voraussetzungen

- **macOS 12+** (Monterey oder neuer)
- **Xcode 13+** — [App Store Link](https://apps.apple.com/de/app/xcode/id497799835)
- **Safari 15+**
- Apple Developer Account (kostenlos für lokale Tests, 99€/Jahr für Distribution)

---

### Schritt 1: Xcode installieren

```bash
# Xcode aus dem App Store installieren (ca. 12 GB)
# Dann Command Line Tools aktivieren:
xcode-select --install
```

---

### Schritt 2: Xcode-Projekt generieren

```bash
# In das Verzeichnis wechseln
cd linkportal-safari/

# Build-Script ausführen
chmod +x build-safari.sh
./build-safari.sh
```

Das Script konvertiert die Web Extension automatisch in ein Xcode-Projekt unter `LinkPortal-Safari/`.

**Alternativ manuell:**
```bash
xcrun safari-web-extension-converter safari-ext \
    --project-location . \
    --app-name "LinkPortal" \
    --bundle-identifier "link.kleckerbox.linkportal" \
    --swift \
    --macos-only \
    --no-open
```

---

### Schritt 3: Xcode-Projekt öffnen

```bash
open LinkPortal-Safari/LinkPortal/LinkPortal.xcodeproj
```

---

### Schritt 4: Signing konfigurieren

In Xcode:
1. Linke Seitenleiste → **LinkPortal** (Projektname) klicken
2. **Signing & Capabilities** Tab
3. **Team** auswählen (Apple ID in Xcode → Settings → Accounts hinzufügen)
4. **Bundle Identifier** ggf. anpassen

> Für rein lokale Tests: **Automatically manage signing** aktivieren + persönliches Team wählen (kostenlos)

---

### Schritt 5: App bauen und starten

- In Xcode: **⌘ + R** (Run)
- Die LinkPortal Wrapper-App öffnet sich
- Ein Dialog erscheint: „Öffne Safari-Einstellungen"

---

### Schritt 6: Extension in Safari aktivieren

1. **Safari** → **Einstellungen** (⌘,) → **Erweiterungen**
2. **LinkPortal** in der linken Liste anklicken
3. Häkchen setzen ✓ → **„Immer erlauben"**
4. Safari-Toolbar: LinkPortal-Icon klickt → Einstellungen öffnen
5. Portal-URL, Benutzername und API-Token eingeben

---

## Entwicklung / Debugging

### Extension-Logs in Safari

```
Safari → Entwickler-Menü (aktivieren: Einstellungen → Erweitert → "Menü Entwickler einblenden")
→ Erweiterungsbackground-Seite → Konsole
```

### Änderungen direkt testen

Nach Änderungen an JS/CSS/HTML:
1. Xcode → **Product** → **Clean Build Folder** (⇧⌘K)
2. Neu bauen (⌘R)
3. In Safari: Einstellungen → Erweiterungen → LinkPortal **deaktivieren** → **aktivieren**

### Xcode-freies Testing (Safari Developer Mode)

```bash
# Safari Developer Mode aktivieren (macOS 13+)
# System Settings → Privacy & Security → Developer Tools → Safari ✓

# Dann direkt laden ohne Xcode-App-Wrapper:
# Safari → Develop → Allow Unsigned Extensions
```

---

## Distribution

### Lokale Weitergabe (kein App Store)

```bash
# In Xcode: Product → Archive
# Organizer → Distribute App → Direct Distribution
# → .app Datei exportieren → an Nutzer weitergeben
# Nutzer müssen GateKeeper deaktivieren oder App notarisiert sein
```

### Mac App Store

1. Apple Developer Program (99€/Jahr) erforderlich
2. In Xcode: Product → Archive → Distribute App → App Store Connect
3. App Store Connect → neue App anlegen → Review einreichen

### Alternative: Safari Extensions Gallery

Apple prüft Erweiterungen strenger als Chrome Web Store.  
Datenschutzerklärung und klare Beschreibung des Zwecks sind Pflicht.

---

## Technische Details

### Browser-Polyfill

Safari verwendet `browser.*` statt `chrome.*`.  
Die Datei `browser-polyfill.js` mappt beide Namespaces aufeinander:

```js
// Safari → chrome.* Alias
if (typeof globalThis.chrome === 'undefined' && typeof globalThis.browser !== 'undefined') {
  globalThis.chrome = globalThis.browser;
}
```

### Einschränkungen

**Kein Auto-Config-Button im Portal:**  
Safari erlaubt kein `externally_connectable`. Webseiten können keine Nachrichten an Erweiterungen senden. Die manuelle Konfiguration (URL + Username + Token) funktioniert aber vollständig.

**Logo-Icon beim Browser-Start (Safari < 16.4):**  
`OffscreenCanvas` ist erst ab Safari 16.4 in Service Workers verfügbar. Bei älteren Versionen wird das Portal-Logo erst gesetzt, wenn das Popup einmal geöffnet wird.

**Hintergrund-Sync:**  
`chrome.alarms` ist ab Safari 16.4 verfügbar. Bei älteren Versionen startet der Sync nur beim Öffnen des Popups.

---

## Versions-Historie

| Version | Datum | Änderungen |
|---------|-------|-----------|
| 1.10.9   | Apr 2026 | Erste Safari-Version |

---

## Lizenz

[LinkPortal License v1.1](LICENSE) — MIT-basiert mit Pflicht zur Namensnennung.  
Copyright © 2026 Kleckerbox · *Made with ❤️ by [Kleckerbox](https://www.kleckerbox.link) & Claude*
