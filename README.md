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
Unterordnern identisch. **Version: 1.10.16**

## Versionspflege

Die angezeigte Version liest das Popup zur Laufzeit aus dem Manifest
(`chrome.runtime.getManifest().version`) — sie kann also nicht mehr „driften".
Zum Anheben/Prüfen über alle drei Varianten dient `version.sh`:

```bash
./version.sh                 # Konsistenz prüfen (nichts ändern)
./version.sh bump patch      # patch|minor|major erhöhen, überall setzen, spiegeln, prüfen
./version.sh set 1.10.20     # exakte Version setzen
```

Die Routine setzt nur gezielt das `version`-Feld der drei `manifest.json`, die Popup-Platzhalter,
die Fallback-Konstante in `popup.js` und die `Version:`-Zeile dieser README; SVG-Koordinaten o. Ä.
werden nicht berührt. Außerdem spiegelt sie die geteilten Dateien aus `chrome/` nach `firefox/`
und `safari/` und prüft Manifest-Gleichheit, identische geteilte Dateien und JS-Syntax.

## Datenschutz

Die Datenschutzerkl\u00e4rung steht in `PRIVACY.md` (deutsch + englisch). F\u00fcr die Einreichung im Chrome Web Store unter einer \u00f6ffentlichen URL hosten und diese im Entwickler-Dashboard unter \u201eDatenschutzbestimmungen\u201c hinterlegen.
