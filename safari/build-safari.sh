#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# LinkPortal Safari Extension — Build Script
# Konvertiert die Web Extension in ein Xcode-Projekt für Safari
# ═══════════════════════════════════════════════════════════════
#
# Voraussetzungen:
#   - macOS 12+ (Monterey oder neuer)
#   - Xcode 13+ (aus dem App Store)
#   - Safari 15+
#
# Ausführen:
#   chmod +x build-safari.sh
#   ./build-safari.sh
#
# Das Ergebnis ist ein Xcode-Projekt unter ./LinkPortal-Safari/
# ═══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="$SCRIPT_DIR/safari-ext"
OUTPUT_DIR="$SCRIPT_DIR/LinkPortal-Safari"

echo "🔗 LinkPortal Safari Extension Builder"
echo "══════════════════════════════════════"

# Check Xcode
if ! command -v xcrun &> /dev/null; then
    echo "❌ Xcode nicht gefunden."
    echo "   Bitte Xcode aus dem App Store installieren:"
    echo "   https://apps.apple.com/de/app/xcode/id497799835"
    exit 1
fi

echo "✓ Xcode gefunden: $(xcrun --version 2>&1 | head -1)"

# Check safari-web-extension-converter
if ! xcrun --find safari-web-extension-converter &> /dev/null 2>&1; then
    echo "❌ safari-web-extension-converter nicht gefunden."
    echo "   Bitte Xcode 12+ installieren."
    exit 1
fi

echo "✓ safari-web-extension-converter verfügbar"
echo ""

# Remove old build
if [ -d "$OUTPUT_DIR" ]; then
    echo "🗑  Altes Build-Verzeichnis wird entfernt..."
    rm -rf "$OUTPUT_DIR"
fi

echo "🔨 Konvertiere Web Extension..."
echo ""

xcrun safari-web-extension-converter "$EXT_DIR" \
    --project-location "$SCRIPT_DIR" \
    --app-name "LinkPortal" \
    --bundle-identifier "link.kleckerbox.linkportal" \
    --swift \
    --macos-only \
    --no-open

echo ""
echo "══════════════════════════════════════"
echo "✅ Xcode-Projekt erstellt!"
echo ""
echo "Nächste Schritte:"
echo ""
echo "1. Xcode öffnen:"
echo "   open '$OUTPUT_DIR/LinkPortal/LinkPortal.xcodeproj'"
echo ""
echo "2. Team setzen:"
echo "   In Xcode → Projekt → Signing & Capabilities"
echo "   → Team auswählen (Apple Developer Account)"
echo ""
echo "3. App starten (⌘R)"
echo "   Die Wrapper-App öffnet sich"
echo ""
echo "4. Extension in Safari aktivieren:"
echo "   Safari → Einstellungen → Erweiterungen → LinkPortal ✓"
echo ""
echo "5. Für Produktion (App Store oder direkte Distribution):"
echo "   Xcode → Product → Archive"
echo ""
echo "══════════════════════════════════════"
echo ""
echo "🔧 Developer-Modus (ohne Apple-Account):"
echo "   xcrun safari-web-extension-converter safari-ext --no-open"
echo "   Dann in Xcode ohne Signing bauen (für lokale Tests)"
echo ""
