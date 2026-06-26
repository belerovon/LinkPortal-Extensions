# Changelog

Alle nennenswerten Änderungen an der LinkPortal Browser-Extension (Chrome & Safari).
Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/); Versionierung nach [SemVer](https://semver.org/).

## [1.10.21] — 2026-06-24

### Changed
- **Aufgaben: erledigte serverseitig nachladen.** Neuer Schalter „Erledigte anzeigen/ausblenden". Erledigte Aufgaben werden erst bei Bedarf über `?show_done=true` geladen (weniger Daten). Behebt zugleich, dass erledigte Aufgaben bisher gar nicht erschienen (der Endpunkt liefert per Default nur offene).
- **Übersetzung: Quellsprache-Erkennung.** Erkennt das Portal eine andere Ausgangssprache als gewählt (`detected`), erscheint ein Button „Erkannt: … – neu übersetzen", der die Übersetzung mit der erkannten Sprache wiederholt.

## [1.10.20] — 2026-06-24

### Performance
- **Favicons parallel laden.** `resolveFavicons` löst Icons jetzt pro Domain entdoppelt und gleichzeitig auf (vorher ein Netzwerk-Roundtrip pro Icon nacheinander) — spürbar schneller bei vielen Links.
- **RSS-Feeds parallel abrufen.** Die Feeds einer RSS-Ansicht werden gleichzeitig geladen (Reihenfolge bleibt erhalten); ein `isConnected`-Schutz verhindert, dass ein verzögertes Ergebnis eine neuere Ansicht überschreibt.

## [1.10.19] — 2026-06-24

### Fixed
- **Health-Status nur bei aktivierter Prüfung.** Der Status-Punkt erschien auch für Links in Sektionen, in denen der Health-Check deaktiviert ist (alter, gespeicherter Status). Der Punkt wird jetzt nur noch angezeigt, wenn die Prüfung auf Sektions- **und** Link-Ebene aktiv ist (`health_check`). Ebenso ist der „Links prüfen"-Button in deaktivierten Sektionen ausgeblendet.

## [1.10.18] — 2026-06-24

### Changed
- **RSS:** Feeds, die nicht geladen werden können, werden jetzt ausgeblendet statt mit einer Fehlermeldung angezeigt. Bleibt dadurch kein Feed übrig, erscheint der Leerzustand.
- **RSS:** Eigenes RSS-Symbol für Tab-Leiste, Menü und Feed-Köpfe (lokales `SVG.rss`, theme-treu; `icons.js` bleibt portal-identisch).

## [1.10.17] — 2026-06-21

### Added
- **Globale Server-Suche (H).** Zusätzlich zur Offline-Suche werden nach kurzer Verzögerung Treffer aus `GET /api/search` unter „Aus dem Portal“ angehängt (entdeckt auch nicht gecachte Links, Sektionen und Aufgaben; Duplikate werden ausgefiltert).
- **Übersetzung über das Portal (G).** Die Übersetzungs-Sektion nutzt jetzt `POST /api/translate` und zeigt das Ergebnis direkt im Popup (mit Kopier-Button), statt nach Google Translate zu verlinken. „Auto“ als Quelle entfällt, da eine konkrete Ausgangssprache benötigt wird.
- **RSS-Ansicht (F).** Neuer virtueller Eintrag „RSS“ im Tab-Menü listet die im Portal konfigurierten Feeds (`/api/settings` → `rss_feeds`) und lädt deren Einträge über `GET /api/rss` (begrenzt durch `rss_max_items`).

## [1.10.16] — 2026-06-21

### Fixed
- **Lesezeichen-Sync in die Lesezeichenleiste (Direkt-Modus).** Wurde die Lesezeichenleiste als Ziel gewählt und ohne eigenen Unterordner gespiegelt, landeten die Einträge fälschlich unter „Andere Lesezeichen“. Ursache: Der gewählte Zielordner wurde über `chrome.bookmarks.get(id)` geprüft, was für die Firefox-Wurzel-IDs (`toolbar_____`/`unfiled_____`) fehlschlagen kann — der Code fiel dann still auf „Andere Lesezeichen“ zurück. Der Zielordner wird jetzt robust per Baum-Durchlauf verifiziert (inkl. Wurzelordner), in Popup und Service Worker. Auch der „Neuer Ordner“-Pfad nutzt nun die robuste Wurzel-Auflösung statt Index.

## [1.10.15] — 2026-06-21

### Changed
- **Versions-Routine `version.sh`.** Hebt/prüft die Version konsistent über chrome/firefox/safari (gezielt: Manifeste, Popup-Platzhalter, popup.js-Fallback, README), spiegelt die geteilten Dateien und validiert Manifest-Gleichheit, Datei-Identität und JS-Syntax. Die angezeigte Version stammt seit 1.10.14 ohnehin aus dem Manifest; damit ist für Firefox und Safari dasselbe sichergestellt wie für Chrome.

## [1.10.14] — 2026-06-21

### Fixed
- **Angezeigte Versionsnummer war fest auf 1.10.9.** Die Version im Popup (Menü und Einstellungen) wird jetzt direkt aus dem Manifest gelesen (`chrome.runtime.getManifest().version`) und stimmt damit immer mit der tatsächlichen Version überein.

## [1.10.13] — 2026-06-21

### Added
- **Favoriten direkt umschalten (A).** Jede Link-Zeile hat einen Stern-Button; Klick setzt/entfernt den Favoriten über `POST`/`DELETE /api/links/{id}/favorite` (nur Leserecht nötig). Der Status wird sofort in der Oberfläche aktualisiert.
- **Health-Check auslösen (D).** Sektionen mit Bearbeitungsrecht erhalten im Kopf einen Aktualisieren-Button, der `POST /api/sections/{id}/links/check` ausführt und anschließend die Status-Punkte der Sektion neu lädt. (Die Anzeige der Punkte kam in 1.10.12.)
- **Portal-Version & Funktionen (I).** Der Einstellungs-Dialog zeigt unten die Portal-Version (`GET /api/version`) und aktive Funktionen (`GET /api/features`: API, Auto-Config).

## [1.10.12] — 2026-06-21

### Fixed
- **Portal-Titel ohne Admin-Rechte.** Der nicht benötigte Aufruf des Admin-Endpunkts `/api/admin/app-settings` wurde entfernt; der Titel wird allein aus der Portal-Startseite (`<title>`) gelesen. Behebt einen 403-Request bei jedem Öffnen für Nicht-Admins.
- **Favicons über das Portal statt Google.** Ohne hinterlegtes Logo werden Favicons jetzt über den Portal-Proxy `/api/favicon` (mit SSRF-Schutz/Cache) geladen, statt den Browser direkt `google.com/s2/favicons` abfragen zu lassen (Datenschutz). Schlägt der Abruf fehl, bleiben die Initialen sichtbar.
- **`open_mode` der Links wird beachtet.** Links mit `open_mode='self'` ersetzen den aktuellen Tab; alle anderen öffnen wie bisher einen neuen Tab. Gilt auch für Favoriten-/Tag-Widget-Links.

### Added
- **Health-Status-Anzeige.** Geprüfte Links zeigen einen farbigen Punkt (grün = ok, gelb = down, rot = error) inkl. HTTP-Code als Tooltip. Die Daten kamen bereits mit, wurden aber nicht dargestellt.

## [1.10.11] — 2026-06-20

### Fixed
- **Einstellungen werden beim Browser-Neustart nie mehr automatisch geöffnet.** Der Merker für die geöffnete Einstellungsseite liegt jetzt in der Session-Ablage (`chrome.storage.session`) und wird beim Neustart geleert; ein etwaiger Alt-Eintrag im dauerhaften Speicher wird entfernt. Innerhalb derselben Browser-Sitzung bleibt das Verhalten erhalten (erneutes Öffnen des Popups zeigt wieder die Einstellungen). Greift auch bei aktivem „letzten Tab merken".

## [1.10.10] — 2026-06-10

### Changed
- **Monorepo-Optimierung.** Geteilte Dateien liegen nur noch unter `shared/` (keine Duplikate); `build.sh` setzt daraus die ladefähigen Ordner und Store-ZIPs zusammen. Neue einzige Versionsquelle `VERSION` (Bump per `./build.sh bump patch|minor|major`); der Build validiert JS, Manifest-JSON, Versionsgleichheit und die Identität der geteilten Dateien.
- **Kleineres Chrome-Paket:** die portalseitige `linkportal-extension-integration.js` wird nicht mehr ins Erweiterungs-Paket übernommen (liegt jetzt im Repo unter `portal-integration/`).

## [1.10.9] — 2026-06-06

### Changed
- **Wetter-Widget nutzt jetzt SVG-Symbole statt Emoji.** Aktuelles Wetter und Vorschau verwenden einheitliche Linien-Icons (Sonne, heiter, bewölkt, Nebel, Niesel, Regen, Schnee, Gewitter; Thermometer als Rückfall), die der Textfarbe folgen (theme-aware). Die Zuordnung der WMO-Wettercodes wurde dabei vervollständigt (u. a. gefrierender Niesel/Regen, Schnee- und Regenschauer). Damit ist die Oberfläche durchgängig SVG-basiert; als Emoji verbleiben nur noch Sprach-Flaggen (im Auswahlmenü) und die Suchmaschinen-Markenicons.

## [1.10.8] — 2026-06-06

### Changed
- **Prioritäts-Markierungen bei Aufgaben nutzen jetzt SVG statt Emoji.** In der Aufgabenzeile erscheinen farbige SVG-Punkte (rot/gelb/grün); im Prioritäts-Auswahlmenü wird das reine Textlabel angezeigt (in `<option>` lassen sich SVGs technisch nicht darstellen). Damit ist die Statusanzeige durchgängig SVG-basiert. Bewusst als Emoji erhalten bleiben: Sprach-Flaggen (im Auswahlmenü nicht als SVG darstellbar), die Suchmaschinen-Markenicons sowie die farbigen Wetter-Symbole.

## [1.10.7] — 2026-06-05

### Fixed
- **Firefox: falsche Ziel-Ordner bei „Lesezeichenleiste"/„Weitere Lesezeichen".** Die Auflösung der Wurzelordner erfolgte über die Reihenfolge (Chrome-Annahme); in Firefox ist die Reihenfolge anders. Die Ordner werden nun anhand ihrer stabilen IDs aufgelöst (Chrome `1`/`2`, Firefox `toolbar_____`/`unfiled_____`) mit Index als Rückfall.
- **Hintergrund-Sync (Alarm) spiegelte unter Safari/Firefox keine Favoriten.** Der Favoriten-Abruf fehlte dort in `fetchAllData`; er ist nun in allen drei Browsern vorhanden, und die Sync-Kernfunktionen der Hintergrundskripte sind über alle Browser deckungsgleich.
- **Sync-Hash erfasste Widget-Links nicht**, wodurch Änderungen an „Favoriten"/„Tag"-Widgets eine Aktualisierung verpassen konnten. Der Hash berücksichtigt jetzt auch Widget-Links.

### Changed (Optimierung)
- **Weniger unnötige Netzwerkaufrufe:** Widget-Links und Favoriten werden nur noch abgerufen, wenn die Lesezeichen-Synchronisierung aktiv ist.
- **Weniger unnötige Lesezeichen-Neuaufbauten:** Die Popup-Spiegelung berechnet eine Inhalts-Signatur und überspringt den vollständigen Neuaufbau, wenn sich Inhalt und Konfiguration nicht geändert haben (relevant, da jeder Datenabruf bisher neu aufbaute).

## [1.10.6] — 2026-06-05

### Fixed
- **Tabs, die nur aus Widget-Sektionen bestehen, wurden nicht ins Lesezeichen gespiegelt.** Die Spiegelung legte bisher nur für Tabs mit „Links"-Sektionen einen Ordner an; ein Tab mit ausschließlich „Favoriten"- und „Tag"-Widgets (typisch für private Tabs) wurde daher übersprungen. Die Link-Inhalte der Widget-Typen **Favoriten** und **Tag** werden nun beim Datenabruf mitgeladen (in ein separates Cache-Feld `widgetLinks`, ohne die normale Link-Anzeige/Suche zu beeinflussen) und in die Spiegelung einbezogen. Solche Tabs erhalten jetzt einen Ordner mit je einem Unterordner pro Widget und den enthaltenen Links.

## [1.10.5] — 2026-06-05

### Fixed
- **Ordner wurden bei jedem Sync mehrfach angelegt.** Die Popup-Spiegelung hatte keinen Schutz gegen gleichzeitige Läufe (automatischer Trigger nach Datenabruf + expliziter Trigger liefen parallel). Alle Spiegelungen werden jetzt **serialisiert** (Promise-Kette), sodass immer nur ein Lauf gleichzeitig ausgeführt wird und jeder den vorherigen Satz abräumt — Ergebnis ist genau ein Satz Ordner.
- **Bereits vorhandene Duplikate werden aufgeräumt.** Im Direkt-Modus entfernt die Spiegelung vor dem Aufbau alle Ordner im Zielordner, die einen verwalteten Namen tragen (Tab-Titel + „Favoriten"), und beseitigt so die durch den vorherigen Fehler entstandenen Mehrfach-Ordner. (Hinweis: Im Direkt-Modus sollten im Zielordner keine eigenen, unbeteiligten Ordner mit identischen Namen wie deine Tabs liegen.)

## [1.10.4] — 2026-06-05

### Fixed
- **Lesezeichen-Sync wird jetzt direkt aus dem Popup ausgeführt** (statt nur über den Hintergrund-Service-Worker). Dadurch greifen Einstellungsänderungen — „Eigener Unterordner" aus/an, „Favoriten", „Private Tabs" — sofort und zuverlässig, auch wenn im Hintergrund noch ein veralteter Service Worker aktiv war. Das war die Ursache dafür, dass trotz deaktiviertem Unterordner weiter in „LinkPortal" gespiegelt wurde bzw. Favoriten/private Tabs nicht erschienen.

### Changed
- Die Sync-Statuszeile zeigt zusätzlich eine **Server-Diagnose** an („Fav/Server: N · Privat/Server: M"): So ist sofort erkennbar, ob der laufende Server überhaupt Favoriten bzw. private Tabs liefert (liefert er 0, fehlt die Funktion serverseitig, z. B. bei Portal < 3.6.10).

## [1.10.3] — 2026-06-05

### Changed
- **Status-Meldungen (Verbindungstest & Sync) nutzen jetzt SVG-Icons statt Emoji.** Die Emoji (✅/⏳/❌/⚠) wurden aus den Texten entfernt; stattdessen werden je nach Status passende Lucide-SVGs vorangestellt — Häkchen (Erfolg), Kreuz (Fehler), Warnsymbol (Hinweis) und ein rotierender Spinner bei laufenden Vorgängen. Betrifft Verbindungstest, Speichern/Zurücksetzen, Sync, Cache leeren und die Lesezeichen-Meldungen.

## [1.10.2] — 2026-06-05

### Fixed
- **Direkt-Modus entfernt „LinkPortal" jetzt zuverlässig.** Verwaiste „LinkPortal"-Ordner werden nun baumweit gesucht und entfernt (nicht nur unter dem aktuellen Zielordner) — auch Altordner aus früheren Konfigurationen oder nach Wechsel des Zielordners verschwinden dadurch.

### Changed
- **Sync meldet eine Statuszeile zurück** (Modus „Unterordner/direkt", Anzahl gespiegelter Favoriten und Tabs, ggf. „inkl. privat"). So ist unmittelbar sichtbar, was gespiegelt wurde — z. B. zeigt „Favoriten: 0", dass der Server keine Favoriten liefert (etwa bei einer Portal-Version < 3.6.10 ohne `/api/favorites`).

## [1.10.1] — 2026-06-05

### Fixed
- **Direkt-Modus ließ den „LinkPortal"-Ordner stehen.** Bei deaktiviertem Schalter „Eigener Unterordner" blieb unter Umständen ein verwaister „LinkPortal"-Ordner aus einem früheren Sync zurück. Die Bereinigung verwaister „LinkPortal"-Ordner unter dem Zielordner läuft jetzt in beiden Modi.
- **Favoriten-Ordner erschien nicht.** Beim Umschalten der Favoriten-/Optionsschalter werden die Daten (inkl. Favoriten) nun zuerst neu geladen, bevor gespiegelt wird; gilt auch für „Jetzt spiegeln".

### Changed
- **„Favoriten" steht jetzt an erster Position** im Lesezeichen-Ziel (vor den Tab-Ordnern).
- **Neuer Schalter „Private Tabs mitspiegeln"** (`bmPrivate`, Standard aus): private Tabs werden nur dann ins Lesezeichen-Ziel übernommen, wenn aktiviert.

## [1.10.0] — 2026-06-05

### Added
- **Widget-Sektionen (`section_type: 'widget'`).** Die Erweiterung rendert nun die Widget-Sektionen des Portals. Im Mittelpunkt steht das **Wetter-Widget** (`GET /api/sections/{id}/weather`, Open-Meteo) mit aktueller Temperatur, Zustand, Wind und 4-Tage-Vorschau. Ebenfalls unterstützt: Favoriten-, Tag-, Status- und Kalender-Widgets (lazy geladen wie Aufgaben).
- **Suche nach Tags.** Links tragen jetzt ihre `tags` (aus `GET /api/sections/{id}/links`). Tags fließen in den Suchindex ein, werden als kleine Chips am Link angezeigt, und eine Eingabe der Form `#tagname` filtert exakt nach diesem Tag.
- **Favoriten als Unterordner beim Lesezeichen-Sync.** Optionaler Schalter, der die Portal-Favoriten (`GET /api/favorites`) zusätzlich in einen Unterordner „Favoriten" spiegelt.
- **Speicherort-Schalter für den Lesezeichen-Sync.** Wahlweise eigener Unterordner „LinkPortal" (Standard) **oder** direkte Spiegelung in den gewählten Ordner. Im Direkt-Modus werden ausschließlich die selbst angelegten Ordner verwaltet; bestehende Lesezeichen des Nutzers im Zielordner bleiben unangetastet.

### Changed
- Cache enthält nun zusätzlich `favorites` (von Popup und Hintergrund-Sync abgerufen), damit die Favoriten-Spiegelung ohne zusätzlichen Abruf im Service Worker funktioniert.

## [1.9.0] — 2026-06-05

### Added
- **Firefox-Port.** Eigene Firefox-Variante (MV3, Gecko-Mindestversion 115) auf Basis der Safari-Architektur — teilt sich `popup.*`, `i18n.js` und `icons.js` mit den anderen Browsern, nutzt ein nicht-persistentes Hintergrundskript und kommt ohne `externally_connectable`/Auto-Config aus.
- **Task-Priorität und Fälligkeit im Plugin setzbar.** Aufgaben mit Bearbeitungsrecht erhalten ein Bearbeiten-Symbol, das einen Inline-Editor mit Prioritäts-Auswahl (Keine/Niedrig/Mittel/Hoch) und Datumsfeld öffnet; gespeichert via `PUT /api/tasks/{id}`. Bisher waren beide Werte nur les-, nicht setzbar.
- **Dark-Mode-Logo-Variante.** Ist im Portal unter `/img/logo-dark.svg` (bzw. `.png`) ein dunkles Logo hinterlegt, wird es im Popup automatisch verwendet, sobald die Oberfläche dunkel dargestellt wird; andernfalls bleibt es beim Standard-Logo.

### Changed
- Plattformübergreifender API-Shim: Die geteilte `popup.js` bevorzugt das promise-basierte `browser.*` (Firefox/Safari) und fällt unter Chrome auf das native `chrome.*` zurück.

## [1.8.4] — 2026-06-05

### Added
- **Freie Zielordner-Auswahl für die Lesezeichen-Synchronisation.** Das Speicherort-Dropdown listet nun alle vorhandenen Lesezeichen-Ordner (nach Verschachtelungstiefe eingerückt), sodass der „LinkPortal"-Ordner in einem beliebigen Unterordner abgelegt werden kann. Zusätzlich legt der Button „Neuer Unterordner" einen frischen Ordner unter dem aktuell gewählten Ziel an und übernimmt ihn direkt.
- Wird der gewählte Zielordner später gelöscht, fällt die Spiegelung automatisch auf den Standardort zurück, statt fehlzuschlagen.

## [1.8.3] — 2026-06-05

### Added
- **„Jetzt spiegeln"-Button in der Lesezeichen-Karte** — stößt die Spiegelung sofort an, statt auf den nächsten Datenabruf oder den 30-Min-Sync zu warten. Bei deaktiviertem Sync erscheint ein Hinweis.

## [1.8.2] — 2026-06-05

### Fixed
- **Speichern-Status zeigte rohes SVG-Markup.** `showStatus()` setzte den Inhalt via `textContent`, sodass die in v1.6.3 eingeführten SVG-Icons in den Validierungsmeldungen (z. B. „Felder ausfüllen") als Quelltext erschienen — jetzt korrekt als Icon gerendert.
- **Zurücksetzen räumt die Lesezeichen vollständig auf** — der „LinkPortal"-Ordner wird entfernt, die optionale `bookmarks`-Berechtigung zurückgegeben und `bmRootId`/`bmHash` gelöscht (vorher blieb ein verwaister Ordner zurück).

### Changed
- **Lesezeichen-Spiegelung gegen Race-Conditions abgesichert** — gleichzeitige Läufe (30-Min-Alarm + Popup-Trigger) werden serialisiert; ein während eines Laufs eintreffender Trigger löst genau einen Folgelauf aus. Verhindert doppelte „LinkPortal"-Ordner.
- **Verwaiste Ordner werden bereinigt** — vor dem Neuaufbau wird ein evtl. übrig gebliebener „LinkPortal"-Ordner unter dem Zielort entfernt (z. B. nach einem Daten-Reset).
- **Weniger Service-Worker-Wakeups** — der `syncBookmarks`-Trigger nach jedem Datenabruf wird nur noch gesendet, wenn die Funktion aktiv ist.

## [1.8.1] — 2026-06-05

### Added
- **Zielordner für die Lesezeichen-Synchronisation wählbar** — „Weitere Lesezeichen" (Standard) oder „Lesezeichenleiste", per Dropdown in den Einstellungen. Ein Wechsel verschiebt den „LinkPortal"-Ordner beim nächsten Sync an den neuen Ort (der Speicherort fließt in den Content-Hash ein).

## [1.8.0] — 2026-06-05

### Added
- **Lesezeichen-Synchronisation (opt-in).** Spiegelt die Portal-Struktur einseitig (Portal → Browser) in einen eigenen Ordner „LinkPortal" (Tab → Sektion → Links). Aktivierung über einen Schalter in den Einstellungen; die Berechtigung `bookmarks` wird als *optionale* Permission erst beim Einschalten angefragt (kein Warnhinweis bei der Installation). Andere Lesezeichen bleiben unangetastet.
  - Spiegelung läuft im Service Worker beim 30-Min-Sync und nach jedem Datenabruf; ein Content-Hash verhindert unnötiges Neuschreiben, wenn sich nichts geändert hat.
  - Beim Deaktivieren wird der „LinkPortal"-Ordner entfernt und die Berechtigung wieder zurückgegeben.
  - Leere Tabs/Sektionen (ohne Links) werden übersprungen.

## [1.7.0] — 2026-05-31

### Fixed
- **Task-Abhaken nutzt jetzt den dedizierten `PUT /api/tasks/{id}/toggle`-Endpunkt** statt des generischen `PUT /api/tasks/{id}` mit `{done}`. Der Toggle-Endpunkt verlangt serverseitig nur Lese-Recht, der generische Update-Endpunkt hingegen Edit-Recht — dadurch können nun auch Nur-Lese-Nutzer Aufgaben abhaken (wie vom Backend vorgesehen). Die Checkbox ist nicht mehr für Betrachter deaktiviert.
- **Sektions-Icons** (`sec.icon`) werden wie Tab-Icons über die Lucide-Icon-Map aufgelöst. Vorher wurde der rohe Wert ausgegeben, sodass ein Icon-Name wie `globe` wörtlich als Text erschien.

### Changed
- **Hintergrund-Sync** (Service Worker) überspringt jetzt Nicht-`links`-Sektionen (tasks/search/translate) beim Laden — spart pro Sync-Zyklus überflüssige `…/links`-Requests und entspricht dem bereits optimierten Popup.
- Icon-Rendering refaktoriert: gemeinsamer Kern `iconHtml(icon, wrapperClass)` für Tab- und Sektions-Icons.

### Removed
- Toter CSS-Block `.tab-drop-icon` (seit der Umstellung auf SVG-Icons ohne Verwender).

## [1.6.4] — 2026-05-30

### Changed
- Settings-Überschriften (Verbindung, Testen, Cache & Sync, Design, Start-Tab, Sprache) tragen Lucide-SVG-Icons (`plug`, `activity`, `refresh`, `palette`, `zap`, `globe`) statt Emoji-Präfixen.

## [1.6.3] — 2026-05-30

### Added
- Hamburger-Menü morpht beim Öffnen des Tab-Dropdowns animiert zu einem „X".

### Changed
- Durchgängige Umstellung der UI-Icons von Emoji auf Lucide-SVGs: Theme-Buttons (Sonne/Kontrast/Mond), Center-Screens (Setup/Fehler/Logout), Leer-Ansichten, Task-Status, Übersetzen-Steuerung, Suchergebnisse und Status-Meldungen.
- Bewusst als Emoji belassen: Länderflaggen (Sprachauswahl), Suchmaschinen-Marken und Prioritäts-Farbpunkte.

## [1.6.2] — 2026-05-30

### Fixed
- Tab-Icons aus `/api/tabs` sind **Icon-Namen** (z. B. `house`, `laptop`). Die Lucide-Icon-Map des Portals (`icons.js`) wird jetzt mitgeliefert und der Name auf das SVG aufgelöst — vorher erschien der Name wörtlich.

### Changed
- Virtueller Tab „Alle Sektionen" nutzt das `clipboard`-SVG statt des 📋-Emojis.

## [1.6.1] — 2026-05-30

### Fixed
- Tab-Icons werden korrekt als SVG dargestellt (Inline-`<svg>`, Bild-URL/-Pfad und Emoji/Text), inkl. Sanitisierung von Inline-SVG.

## [1.6.0] — 2026-05-30

### Added
- Tastatur-Shortcut zum Öffnen des Popups (`Ctrl/Command+Shift+L`) über das `commands`-Manifest (`_execute_action`).

## [1.5.9] und früher

Siehe Projekt-Handoff für die vollständige frühe Historie. Auswahl:

- **1.5.9** — Edit/Delete nutzt `link.tabId` (Korrektheit in der Alle-Sektionen-Ansicht).
- **1.5.8** — Bugfixes: dead code, Divider-Logik, `tabId`-String, Fetch-Skip für Nicht-Link-Sektionen.
- **1.5.7** — „Alle Sektionen"-Tab, Start-Tab-Einstellung, Auto-Fokus, Pfeiltasten-Navigation.
- **1.5.6** — Tasks- & Translate-Sektionen, Settings-Schließen-nach-Speichern.
- **1.5.5** — Settings-offen-halten, Auto-Save, Tab-Persistenz, Suchmaschinen-Sektion.
- **1.5.4** — Optimierung: Parallel-Fetch, Object-URLs, Such-Index.
- **1.5.0** — Theme, Sprach-Dropdown, Drag & Drop, Tab-Toggle, Logo-Cache, 403-Schwelle.