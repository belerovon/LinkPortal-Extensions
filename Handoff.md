# LinkPortal-Extension ↔ Portal — Schnittstellen-Abgleich & Handoff

**Extension:** 1.10.17 (chrome/firefox/safari, shared byte-identisch, i18n DE/EN/ES = 154 Schlüssel)
**Portal:** 3.6.52 (`build/backend`, FastAPI, Router unter `routers/`)
**Stand:** 2026-06-21

---

## 0. Status seit dem ersten Abgleich

- **1.10.12 — alle Fehler/Probleme aus §2 behoben** (Titel ohne Admin-Recht, Favicon über Portal,
  `open_mode`, Health-Status-Anzeige).
- **1.10.17 — Funktionen H, G, F umgesetzt** (Server-Suche, Portal-Übersetzung, RSS-Ansicht).
- **1.10.16 — Fix Lesezeichen-Sync in die Leiste** (Direkt-Modus landete in „Andere Lesezeichen"; robuste Zielordner-Auflösung).
- **1.10.15 — Versions-Routine `version.sh`** (konsistente Bumps über chrome/firefox/safari).
- **1.10.14 — Versionsanzeige liest aus dem Manifest** (zeigte zuvor fix 1.10.9).
- **1.10.13 — Funktionen A, D, I umgesetzt** (Favorit-Toggle, Health-Check auslösen, Portal-Version/Features).
- **Offen:** Funktionen B, C, E, F, G, H aus §4.

---

## 1. Genutzte Endpunkte — Abgleich

Alle aufgerufenen Endpunkte existieren in 3.6.52, Antwortformate passen. Basis-URL:
`apiUrl = baseUrl + '/api' + path`; Auth per Basic-Auth-Header (`mkAuth`), `credentials:'omit'`.

| Methode | Pfad | genutzt von | Status |
|--------|------|-------------|--------|
| GET | `/api/auth/me` | Background, Popup | OK |
| GET | `/api/tabs` | Background, Popup | OK — `is_private`, `perms` |
| GET | `/api/tabs/{id}/sections` | Popup | OK — `section_type`, `content` |
| GET | `/api/sections/{id}/links` | Popup, Background | OK — `l.*` inkl. `is_favorite`, `tags[]`, `health_*`, `open_mode` |
| GET | `/api/sections/{id}/tasks` | Popup | OK — `show_done`/`search` (noch ungenutzt) |
| GET | `/api/sections/{id}/weather\|status\|calendar\|taglinks\|favorites` | Popup | OK |
| GET | `/api/favorites` | Popup, Background | OK |
| GET | `/api/settings` · PUT `/api/settings` | Popup | OK (u. a. Sprache) |
| PUT | `/api/tasks/{id}` · PUT `/api/tasks/{id}/toggle` | Popup | OK (toggle = Leserecht) |
| POST/DELETE | `/api/links/{id}/favorite` | Popup | **NEU 1.10.13** (A) — Leserecht |
| POST | `/api/sections/{id}/links/check` | Popup | **NEU 1.10.13** (D) — Edit-Recht, `{checked,ok}` |
| GET | `/api/version` · `/api/features` | Popup (Settings) | **NEU 1.10.13** (I) |
| ~~GET~~ | ~~`/api/admin/app-settings`~~ | — | **ENTFERNT 1.10.12** (war Admin-only, s. §2.1) |

---

## 2. Fehler / Probleme — alle behoben (1.10.12)

### 2.1 Admin-Endpunkt für den Portal-Titel — **BEHOBEN 1.10.12**
`loadBranding()` rief `GET /api/admin/app-settings` (Admin-only) nur für `portal_name`/`site_title`;
für Nicht-Admins gab das bei jedem Öffnen einen 403, der Titel blieb auf Default.
*Fix:* Aufruf entfernt. Der Titel wird allein aus dem `<title>` der Portal-Startseite gelesen
(Host-Berechtigung erlaubt den Cross-Origin-Read). Kein 403 mehr.
*(Hinweis: Der 403 wurde schon vorher per try/catch geschluckt und zählte nicht in den Auto-Logout-Zähler.)*

### 2.2 `open_mode` der Links ignoriert — **BEHOBEN 1.10.12**
Neuer Helfer `openLink(url, mode)`: `open_mode='self'` ersetzt den aktiven Tab
(`chrome.tabs.update`), sonst neuer Tab. Gilt für Hauptliste, „Öffnen"-Button und Widget-Links.

### 2.3 Favicons direkt von Google — **BEHOBEN 1.10.12**
Ohne hinterlegtes Logo werden Favicons nach dem Rendern über den authentifizierten Portal-Proxy
`GET /api/favicon?url=` geladen (Blob → Object-URL, pro Domain gecacht). Der Browser kontaktiert
Google nicht mehr direkt. Schlägt der Abruf fehl, bleiben die Initialen sichtbar.

### 2.4 Health-Status — **Anzeige BEHOBEN 1.10.12, Auslösung NEU 1.10.13 (D)**
`health_status`/`health_code`/`health_checked_at` kamen bereits mit `l.*`. Sie werden jetzt als
farbiger Punkt vor dem Titel dargestellt (grün = ok, gelb = down, rot = error; HTTP-Code im Tooltip).
Auslösung der Prüfung: s. §4-D.

---

## 3. Optimierungen (Stand)

- **Erledigt:** Favicon-Quelle (§2.3), Titel-Request entfernt (§2.1), Server-Suche `GET /api/search?q=` (H, 1.10.17).
- **Offen / optional:**
  - Task-Liste serverseitig filtern: `GET /api/sections/{id}/tasks?show_done=…&search=…` statt Client-Filter.
  - Übersetzung: optionale Auto-Erkennung der Quellsprache über `detected` aus `/api/translate`.

---

## 4. Sinnvolle Funktionen

### Umgesetzt (1.10.13)

**A. Favorit umschalten** — `POST`/`DELETE /api/links/{lid}/favorite` *(UMGESETZT)*
Stern-Button in jeder Link-Zeile; spiegelt `is_favorite`, aktualisiert sofort die Oberfläche.
Server verlangt nur Leserecht.

**D. Health-Check auslösen** — `POST /api/sections/{sid}/links/check` *(UMGESETZT)*
Aktualisieren-Button im Sektions-Kopf (nur mit Edit-Recht); führt die Prüfung aus, lädt danach die
Links der Sektion neu und rendert die Status-Punkte (§2.4) neu.

**I. Portal-Version & Funktionen** — `GET /api/version`, `GET /api/features` *(UMGESETZT)*
Im Einstellungs-Dialog (Versionsleiste) werden Portal-Version und aktive Funktionen
(API, Auto-Config) angezeigt.

### Noch offen

**B. Aktuelle Seite als Link speichern** — `POST /api/sections/{sid}/links`
„Diese Seite hinzufügen" (Titel/URL aus aktivem Tab); Sektionsauswahl via
`GET /api/sections/all-editable`; optional Duplikat-Vorprüfung `…/links/check-duplicate`.

**C. Aufgabe anlegen** — `POST /api/sections/{sid}/tasks` (Priorität/Fälligkeit direkt beim Anlegen).
Bislang nur Abhaken/Bearbeiten.

**E. Privaten Tab anlegen** — `POST /api/tabs/private`.

**F. RSS-Ansicht** — *(UMGESETZT 1.10.17)* virtueller „RSS"-Eintrag im Tab-Menü; Feeds aus `/api/settings` (`rss_feeds`), Inhalte via `GET /api/rss` (begrenzt durch `rss_max_items`).

**G. Übersetzung über das Portal** — *(UMGESETZT 1.10.17)* `POST /api/translate`, Ergebnis inline im Popup (Kopier-Button); „Auto"-Quelle entfällt.

**H. Globale Server-Suche** — *(UMGESETZT 1.10.17)* `GET /api/search?q=`; Treffer werden debounced unter „Aus dem Portal" an die Offline-Suche angehängt (dedupliziert).

---

## 5. Bewusst nicht relevante / Out-of-scope-Endpunkte

`/api/admin/*` (Backups, Audit, Users, Plugins, Import/Export, Broadcast, DB, ws-clients),
`POST /api/links/bulk-*`, `/api/uploads*`, `/api/proxy`, `/api/plugins/*` + `auto-config*`
(bedienen die portalseitige Auto-Konfiguration über `portal-integration/`),
`/api/tabs|sections/*/permissions` (Rechteverwaltung), `/api/groups`.

---

## 6. Empfohlene nächste Schritte

1. **B + C** (schreibfähig machen: Seite-als-Link, Aufgabe anlegen) — größter Funktionszuwachs.
2. **Task-Server-Filter** (`show_done`/`search`) — klein, weniger Datentransfer.
3. **E** (privaten Tab anlegen, `POST /api/tabs/private`) — letzte offene Funktion aus §4.
4. Store-Einreichung: PRIVACY.md hosten, Listing-Texte/Screenshots, ggf. `<all_urls>` → optionale Host-Berechtigung.

> H (Server-Suche), G (Portal-Übersetzung) und F (RSS) sind seit 1.10.17 umgesetzt.

---

## 7. Umsetzungsnotizen (für Folgearbeit)

- **Geteilte Quelle:** Änderungen in `chrome/` (bzw. `shared/` im Repo), dann auf `firefox/`+`safari/`
  spiegeln (`popup.js`, `popup.css`, `popup.html`, `i18n.js`, `icons.js` byte-identisch halten).
  `manifest.json`/`background.js` bleiben browserspezifisch.
- **Eigene Icons:** als `SVG.*`-Konstanten in `popup.js` (nicht in `icons.js`, das portal-identisch bleibt).
  Neu in 1.10.13: `SVG.star`, `SVG.starOff`, `SVG.refresh`.
- **i18n:** neue Schlüssel in allen drei Sprachen ergänzen (aktuell 147). Neu: `favorite`, `check_links`,
  `checking`, `check_done`, `portal_version`.
- **Health-Status-Werte** (Portal `health.py`): `ok` (Code <400), `down` (≥400), `error` (nicht erreichbar).
- **Favorit-Toggle** aktualisiert `is_favorite` in `S.links[sid]` und `S.allLinks`; das Favoriten-Widget
  wird beim nächsten Laden ohnehin neu geholt.
- **Versionspflege:** `version` in allen drei `manifest.json` anheben (CHANGELOG ausnehmen) + Eintrag in `CHANGELOG.md`.
- **Auslieferung:** ein ZIP `LinkPortal-Extension.zip` (Unterordner chrome/firefox/safari, je ladefähig).
