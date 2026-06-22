# Datenschutzerklärung — LinkPortal Browser-Extension

**Stand:** 2026-06-21 · **Gilt für:** LinkPortal Extension (Chrome, Firefox, Safari) ab Version 1.10.16

> Platzhalter in «spitzen Klammern» bitte vor der Veröffentlichung ausfüllen und diese Datei unter
> einer öffentlich erreichbaren URL hosten (z. B. `https://«deine-domain»/privacy` oder als
> GitHub-Pages-Seite). Diese URL wird im Chrome Web Store unter „Datenschutz" → „Datenschutzbestimmungen"
> hinterlegt.

## Verantwortlicher

«Name / Betreiber» (Betreiber von `kleckerbox.link`)
Kontakt: «kontakt@deine-domain»
Quellcode: https://github.com/beleroveon

## Kurzfassung

Die LinkPortal-Erweiterung ist ein Client für eine **selbstgehostete** LinkPortal-Instanz, deren
Adresse der Nutzer selbst angibt. Die Erweiterung **sammelt keine personenbezogenen Daten**, betreibt
**keine eigenen Server**, nutzt **kein Tracking, keine Analyse und keine Werbung** und gibt **keine
Daten an Dritte** weiter. Alle Eingaben und Inhalte verbleiben im Browser des Nutzers und werden
ausschließlich zur Kommunikation mit der vom Nutzer konfigurierten LinkPortal-Adresse verwendet.

## Einziger Zweck (Single Purpose)

Schneller Zugriff auf die Inhalte einer selbstgehosteten LinkPortal-Instanz (Sektionen, Links,
Aufgaben, Favoriten, Widgets, Suche) aus der Browser-Toolbar, mit optionaler einseitiger
Synchronisierung dieser Links in die Lesezeichen des Browsers.

## Welche Daten verarbeitet werden und wo sie liegen

Die Erweiterung verarbeitet ausschließlich lokal im Browser:

- **Zugangsdaten** — Portal-Adresse (URL), Benutzername und API-Token. Gespeichert in
  `chrome.storage.sync`. **Hinweis:** `sync`-Speicher wird vom Browser über das angemeldete
  Browser-Profil mit den anderen Geräten des Nutzers synchronisiert (Browser-eigener Mechanismus,
  z. B. Google-/Mozilla-Konto). Es findet keine Übertragung an den Entwickler statt.
- **Einstellungen** — Theme, Sprache, Start-Tab sowie die Optionen und der Zielordner der
  Lesezeichen-Synchronisierung. Ebenfalls in `chrome.storage.sync`.
- **Offline-Cache** — eine zwischengespeicherte Kopie der vom Portal abgerufenen Inhalte (Tabs,
  Sektionen, Links, Aufgaben, Favoriten, Widget-Daten), damit das Popup offline und schnell
  funktioniert. Gespeichert in `chrome.storage.local`.
- **Vorübergehende Oberflächen-Zustände** — z. B. ob die Einstellungsseite geöffnet ist. Gespeichert
  in `chrome.storage.session` und beim Browser-Neustart automatisch geleert.
- **Favoriten-Symbole (Favicons)** — werden bei Bedarf über den Favicon-Proxy der konfigurierten
  Portal-Instanz (`/api/favicon`) geladen und nur im Arbeitsspeicher der laufenden Sitzung
  zwischengehalten. Es erfolgt **keine** direkte Abfrage bei Drittanbietern (z. B. Google).

Es werden **keine** Browser-Verläufe, Tab-Inhalte fremder Seiten, Eingaben auf Webseiten o. Ä. gelesen.

## Datenübertragung

Die Erweiterung kommuniziert ausschließlich mit der vom Nutzer eingetragenen LinkPortal-Adresse über
deren API. Die Authentifizierung erfolgt per HTTP-Basic-Auth (Benutzername + Token). Es wird empfohlen,
das Portal über HTTPS zu betreiben. Es bestehen **keine** Verbindungen zu Servern des Entwicklers oder
zu sonstigen Dritten.

## Berechtigungen und ihre Begründung

- **`storage`** — Speichern der Einstellungen und des Offline-Caches im Browser (siehe oben).
- **`alarms`** — periodische Aktualisierung des Caches bzw. der optionalen Lesezeichen-Synchronisierung
  im Hintergrund (Standardintervall 30 Minuten).
- **`activeTab`** — Lesen von Titel/URL des aktiven Tabs nur dann, wenn der Nutzer eine entsprechende
  Aktion auslöst (z. B. um die aktuelle Seite zu öffnen/zu verwenden).
- **Host-Zugriff (`<all_urls>`)** — Die Portal-Adresse ist frei wählbar (beliebige, selbstgehostete
  Domain). Da der konkrete Host nicht im Voraus feststeht, wird breiter Host-Zugriff angefragt. Die
  Erweiterung kontaktiert ausschließlich die konfigurierte Portal-Adresse; andere Webseiten werden
  weder gelesen noch verändert.
- **`bookmarks` (optional)** — wird **nicht** beim Installieren angefragt, sondern erst, wenn der Nutzer
  die Lesezeichen-Synchronisierung aktiv einschaltet. Details siehe nächster Abschnitt.

## Lesezeichen-Synchronisierung (optional)

- Vollständig **opt-in**: Die Berechtigung `bookmarks` wird ausschließlich nach ausdrücklicher
  Aktivierung durch den Nutzer angefragt und beim Deaktivieren wieder entzogen.
- **Einseitig** (Portal → Browser): Die Erweiterung erstellt aus den Portal-Links Lesezeichen im vom
  Nutzer gewählten Zielordner (bzw. einem eigenen Unterordner „LinkPortal").
- Die Erweiterung **liest keine bestehenden Lesezeichen aus** und **sendet keine Lesezeichen** an das
  Portal oder Dritte. Sie verwaltet ausschließlich die von ihr selbst angelegten Einträge.

## Aufbewahrung und Löschung

- **Abmelden** in der Erweiterung entfernt das gespeicherte Token.
- **Deinstallation** der Erweiterung entfernt alle lokal gespeicherten Daten (`storage.local`/`session`).
- In `storage.sync` abgelegte Einstellungen/Zugangsdaten unterliegen der Synchronisierung und
  Löschung durch den jeweiligen Browser-Sync-Mechanismus des Nutzers.
- Beim **Ausschalten** der Lesezeichen-Synchronisierung werden die von der Erweiterung angelegten
  Lesezeichen entfernt und die `bookmarks`-Berechtigung zurückgegeben.

## Kinder

Die Erweiterung richtet sich nicht an Kinder und verarbeitet wissentlich keine Daten von Kindern.

## Änderungen

Diese Erklärung kann bei funktionalen Änderungen der Erweiterung angepasst werden. Das Datum oben
weist den jeweils aktuellen Stand aus.

---

## Chrome-Web-Store-Angaben zur Datennutzung

Zur Eingabe im Entwickler-Dashboard unter „Datenschutzpraktiken":

- **Einziger Zweck:** Zugriff auf eine selbstgehostete LinkPortal-Instanz aus der Toolbar (s. o.).
- **Erhobene/verwendete Datentypen:** Die Erweiterung erhebt und übermittelt **keine** Nutzerdaten an
  den Entwickler oder Dritte. Vom Nutzer eingegebene Authentifizierungsdaten und abgerufene Inhalte
  werden ausschließlich lokal gespeichert und nur zur Kommunikation mit der konfigurierten
  Portal-Adresse verwendet.
- **Weitergabe an Dritte:** Nein.
- **Verkauf von Daten:** Nein.
- **Verwendung für Zwecke außerhalb des einzigen Zwecks / für Bonität / Werbung:** Nein.
- Die drei Pflicht-Zertifizierungen („Daten werden nicht an Dritte verkauft", „keine Nutzung außerhalb
  des Einzelzwecks", „keine Verwendung zur Bonitätsprüfung") können bestätigt werden.

---

# Privacy Policy — LinkPortal Browser Extension (English)

**Last updated:** 2026-06-21 · Applies to LinkPortal Extension (Chrome, Firefox, Safari) v1.10.16+

**Controller:** «Name / operator» (operator of `kleckerbox.link`) · Contact: «contact@your-domain» ·
Source: https://github.com/beleroveon

**Summary.** LinkPortal is a client for a **self-hosted** LinkPortal instance whose address the user
provides. The extension **collects no personal data**, runs **no servers of its own**, uses **no
tracking, analytics, or advertising**, and **shares no data with third parties**. All input and content
stays in the user's browser and is used solely to communicate with the user-configured LinkPortal
address.

**Single purpose.** Quick access to a self-hosted LinkPortal instance (sections, links, tasks,
favorites, widgets, search) from the browser toolbar, with optional one-way mirroring of those links
into the browser's bookmarks.

**Data processed (all local):**
- *Credentials* — portal URL, username, API token — in `chrome.storage.sync` (note: `sync` storage is
  synchronized by the browser across the user's signed-in profile/devices; never sent to the developer).
- *Settings* — theme, language, start tab, bookmark-sync options/target folder — in `chrome.storage.sync`.
- *Offline cache* — a cached copy of content fetched from the portal — in `chrome.storage.local`.
- *Transient UI state* — e.g. whether settings is open — in `chrome.storage.session` (cleared on restart).
- *Favicons* — fetched via the portal's own proxy (`/api/favicon`) and held only in memory; no direct
  third-party (e.g. Google) requests.

No browsing history or content of other websites is read.

**Data transfer.** Only to the user-configured LinkPortal address, via HTTP Basic auth. No connections
to developer or third-party servers.

**Permissions.** `storage` (settings + offline cache), `alarms` (periodic background refresh),
`activeTab` (read the active tab's title/URL only on explicit user action), host access `<all_urls>`
(the portal address is an arbitrary, user-chosen host; no other sites are read or modified),
`bookmarks` (optional; requested only when the user enables bookmark sync).

**Bookmark sync (optional, opt-in).** One-way (portal → browser); only manages the entries it creates
in the chosen target folder; never reads existing bookmarks and never sends bookmarks anywhere.

**Retention/deletion.** Logout removes the token; uninstalling removes local data; disabling bookmark
sync removes the created bookmarks and revokes the `bookmarks` permission; synced settings follow the
browser's sync mechanism.

**Children.** Not directed at children; no knowing processing of children's data.

**Data usage declarations (Chrome Web Store):** does not collect or transfer user data to third
parties, does not sell data, and does not use data beyond the single purpose above.
