# LinkPortal Extension — drei eigenständige Unterordner (Basis: Chrome)

Jeder Unterordner ist eine vollständige, direkt ladefähige Erweiterung (keine Build-Schritte nötig).
Alle drei basieren auf der Chrome-Variante; browserspezifisch sind nur `manifest.json` und
`background.js` (Safari zusätzlich `browser-polyfill.js` + `xcode-wrapper/`).

```
LinkPortal-Extension/
├── chrome/    Chrome / Edge — chrome://extensions → entpackt laden
├── firefox/   Firefox — about:debugging → manifest.json laden
└── safari/    Safari — via build-safari.sh / Xcode-Wrapper
```

Die Dateien `popup.html/.css/.js`, `i18n.js`, `icons.js` und `icons/` sind in allen drei
Unterordnern identisch. **Version: 1.10.22**

## Funktionen

- **Sektionen, Links, Aufgaben, Widgets** aus dem Portal direkt in der Toolbar; Offline-Cache mit
  Hintergrund-Aktualisierung (alle 30 Min) und virtueller „Alle Sektionen"-Ansicht.
- **Suche** über den Cache (inkl. Tags via `#tag`) plus **globale Server-Suche** („Aus dem Portal").
- **Favoriten** per Stern umschalten; **Health-Status** der Links als farbiger Punkt, Prüfung pro
  Sektion auslösbar (mit Bearbeitungsrecht).
- **Aufgaben** abhaken sowie Priorität/Fälligkeit bearbeiten.
- **Übersetzung** über das Portal (Ergebnis inline) und **RSS-Ansicht** der im Portal hinterlegten Feeds.
- **Lesezeichen-Synchronisierung** (optional, opt-in): einseitig Portal → Browser, Zielordner wählbar.
- **Themes** (hell/dunkel/auto), **drei Sprachen** (DE/EN/ES), PWA-/Setup-Flow, Portal-Version & aktive
  Funktionen im Einstellungs-Dialog.

## Versionspflege

Die angezeigte Version liest das Popup zur Laufzeit aus dem Manifest
(`chrome.runtime.getManifest().version`) — sie kann also nicht mehr „driften".
Zum Anheben/Prüfen über alle drei Varianten dient `version.sh`:

```bash
./scripts/version.sh                 # Konsistenz prüfen (nichts ändern)
./scripts/version.sh bump patch      # patch|minor|major erhöhen, überall setzen, spiegeln, prüfen
./scripts/version.sh set 1.10.20     # exakte Version setzen
```

Die Routine setzt nur gezielt das `version`-Feld der drei `manifest.json`, die Popup-Platzhalter,
die Fallback-Konstante in `popup.js` und die `Version:`-Zeile dieser README; SVG-Koordinaten o. Ä.
werden nicht berührt. Außerdem spiegelt sie die geteilten Dateien aus `chrome/` nach `firefox/`
und `safari/` und prüft Manifest-Gleichheit, identische geteilte Dateien und JS-Syntax.

## Datenschutz

Die Datenschutzerklärung steht in `PRIVACY.md` (deutsch + englisch). Für die Einreichung im
Chrome Web Store unter einer öffentlichen URL hosten und diese im Entwickler-Dashboard unter
„Datenschutzbestimmungen" hinterlegen.
