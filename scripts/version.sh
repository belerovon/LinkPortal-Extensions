#!/usr/bin/env bash
# LinkPortal-Extension — Versions-Routine
#
# Hält die Version über chrome/firefox/safari konsistent. chrome/ ist die Basis;
# geteilte Dateien (popup.* / i18n.js / icons.js) werden nach firefox/ + safari/ gespiegelt.
# Die ANGEZEIGTE Version liest popup.js zur Laufzeit aus dem Manifest
# (chrome.runtime.getManifest().version) — daher gibt es keine doppelte Pflege.
#
# Verwendung:
#   ./version.sh                 Konsistenz prüfen (nichts ändern)
#   ./version.sh check           dito
#   ./version.sh bump patch      Patch erhöhen (auch minor|major), überall setzen, prüfen
#   ./version.sh set 1.10.20     exakte Version setzen, überall, prüfen
#
# Aktualisiert NUR gezielt: das "version"-Feld der drei manifest.json, die
# Versions-Platzhalter in popup.html (>vX.Y.Z<), die Fallback-Konstante in popup.js und
# eine "Version: X"-Zeile in README.md. SVG-Koordinaten o. Ä. werden nicht berührt.
set -euo pipefail
cd "$(dirname "$0")/.."   # Repo-Wurzel (dieses Skript liegt in scripts/)
BROWSERS="chrome firefox safari"
SHARED="popup.js popup.css popup.html i18n.js icons.js"

mver(){ grep -oE '"version"[[:space:]]*:[[:space:]]*"[0-9]+\.[0-9]+\.[0-9]+"' "$1" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1; }
mset(){ sed -i -E 's/("version"[[:space:]]*:[[:space:]]*")[0-9]+\.[0-9]+\.[0-9]+(")/\1'"$2"'\2/' "$1"; }

cmd="${1:-check}"
cur="$(mver chrome/manifest.json)"
new=""

case "$cmd" in
  check) ;;
  set)  new="${2:?Version angeben, z.B. ./version.sh set 1.10.20}";;
  bump) part="${2:-patch}"
        A="${cur%%.*}"; r="${cur#*.}"; B="${r%%.*}"; C="${r#*.}"
        case "$part" in
          major) A=$((A+1)); B=0; C=0;;
          minor) B=$((B+1)); C=0;;
          patch|*) C=$((C+1));;
        esac
        new="$A.$B.$C";;
  *) echo "Verwendung: ./version.sh [check | bump patch|minor|major | set X.Y.Z]"; exit 1;;
esac

# ── Setzen (nur bei set/bump) ──
if [ -n "$new" ]; then
  for b in $BROWSERS; do mset "$b/manifest.json" "$new"; done
  # Versions-Platzhalter im Popup (werden zur Laufzeit ohnehin aus dem Manifest gesetzt)
  sed -i -E "s/>v[0-9]+\.[0-9]+\.[0-9]+</>v$new</g" chrome/popup.html
  # Fallback-Konstante in popup.js (greift nur, falls getManifest fehlschlägt)
  sed -i -E "s/(\|\| ')[0-9]+\.[0-9]+\.[0-9]+(')/\1$new\2/" chrome/popup.js
  # README-Versionszeile, falls vorhanden ("Version: X.Y.Z", Bold/Sterne bleiben außen)
  [ -f README.md ] && sed -i -E "s/(Version:?[[:space:]]*v?)[0-9]+\.[0-9]+\.[0-9]+/\1$new/g" README.md || true
  echo "» Version $cur -> $new"
  cur="$new"
fi

# ── Geteilte Dateien aus chrome/ nach firefox/ + safari/ spiegeln ──
for b in firefox safari; do
  for f in $SHARED; do cp "chrome/$f" "$b/$f"; done
  [ -d chrome/icons ] && cp -r chrome/icons "$b/"
done
# ── CHANGELOG/LICENSE (Top-Level kanonisch) in alle Varianten spiegeln ──
for b in $BROWSERS; do
  [ -f CHANGELOG.md ] && cp CHANGELOG.md "$b/CHANGELOG.md"
  [ -f LICENSE ]      && cp LICENSE      "$b/LICENSE"
done

# ── Prüfen ──
ok=1
for b in $BROWSERS; do
  v="$(mver "$b/manifest.json")"
  [ "$v" = "$cur" ] || { echo "  FEHLER: $b/manifest.json = $v (erwartet $cur)"; ok=0; }
done
grep -q "getManifest().version" chrome/popup.js || { echo "  FEHLER: popup.js liest die Version nicht aus dem Manifest"; ok=0; }
for b in $BROWSERS; do
  bad="$(grep -oE '>v[0-9]+\.[0-9]+\.[0-9]+<' "$b/popup.html" | grep -v ">v$cur<" || true)"
  [ -z "$bad" ] || { echo "  FEHLER: $b/popup.html hat abweichende Version(en): $bad"; ok=0; }
done
for f in $SHARED; do
  ref="$(md5sum "chrome/$f" | cut -d' ' -f1)"
  for b in $BROWSERS; do
    [ "$(md5sum "$b/$f" | cut -d' ' -f1)" = "$ref" ] || { echo "  FEHLER: $f weicht in $b ab"; ok=0; }
  done
done
if command -v node >/dev/null; then
  for b in $BROWSERS; do for f in "$b"/*.js; do node --check "$f" || ok=0; done; done
fi

if [ "$ok" = 1 ]; then echo "✓ konsistent ($cur) über chrome/firefox/safari"; else echo "✗ Inkonsistenzen gefunden"; exit 1; fi
