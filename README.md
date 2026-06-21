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
Unterordnern identisch. **Version: 1.10.12**
