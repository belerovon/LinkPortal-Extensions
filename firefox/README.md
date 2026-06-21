# LinkPortal Firefox Extension

Firefox-Variante der LinkPortal Extension (Manifest V3, Gecko ≥ 115).

> Aktuelle Version: **1.10.9** · siehe [CHANGELOG.md](CHANGELOG.md)

## Unterschiede zur Chrome-Version

- Teilt sich `popup.html`, `popup.css`, `popup.js`, `i18n.js` und `icons.js` byte-identisch mit der Chrome- und Safari-Variante.
- Eigenes `manifest.json` mit `browser_specific_settings.gecko` (Add-on-ID, Mindestversion) und nicht-persistentem Hintergrundskript (`background.scripts`).
- Eigenes `background.js` ohne `onMessageExternal`; das promise-basierte `browser.*`-API wird auf `chrome.*` gemappt.
- Keine Auto-Konfiguration (`externally_connectable` entfällt) — die Einrichtung erfolgt manuell über die Einstellungen.

## Installation (temporär, zum Testen)

1. `about:debugging#/runtime/this-firefox` öffnen
2. **Temporäres Add-on laden…** → `firefox-ext/manifest.json` auswählen
3. Popup öffnen → **Einstellungen** → URL, Benutzername und API-Token eintragen → **Verbindung testen** → **Speichern**

Für eine dauerhafte Installation muss das Add-on signiert (AMO) bzw. über ein Unternehmens-/Entwickler-Profil bereitgestellt werden.

## Lizenz

[LinkPortal License v1.1](LICENSE) — MIT-basiert mit Pflicht zur Namensnennung.  
Copyright © 2026 Kleckerbox · *Made with ❤️ by [Kleckerbox](https://www.kleckerbox.link) & Claude*
