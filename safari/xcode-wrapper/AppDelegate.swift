import Cocoa
import SafariServices

// ═══════════════════════════════════════════════════════════
// LinkPortal Safari Extension — macOS App Wrapper
// Copyright © 2025 Christian Burgert · www.kleckerbox.link
// ═══════════════════════════════════════════════════════════

@NSApplicationMain
class AppDelegate: NSObject, NSApplicationDelegate {

    @IBOutlet var window: NSWindow!
    @IBOutlet var statusLabel: NSTextField!
    @IBOutlet var openSafariButton: NSButton!

    func applicationDidFinishLaunching(_ aNotification: Notification) {
        checkExtensionStatus()
    }

    func checkExtensionStatus() {
        SFSafariExtensionManager.getStateOfSafariExtension(
            withIdentifier: "link.kleckerbox.linkportal.Extension"
        ) { state, error in
            DispatchQueue.main.async {
                if let error = error {
                    self.statusLabel.stringValue = "Fehler: \(error.localizedDescription)"
                    return
                }
                if let state = state {
                    if state.isEnabled {
                        self.statusLabel.stringValue = "✅ LinkPortal Erweiterung ist aktiv"
                        self.statusLabel.textColor = NSColor.systemGreen
                    } else {
                        self.statusLabel.stringValue = "⚠️ Erweiterung ist deaktiviert\nBitte in Safari → Einstellungen → Erweiterungen aktivieren."
                        self.statusLabel.textColor = NSColor.systemOrange
                    }
                }
            }
        }
    }

    @IBAction func openSafariPreferences(_ sender: Any) {
        SFSafariApplication.showPreferencesForExtension(
            withIdentifier: "link.kleckerbox.linkportal.Extension"
        ) { error in
            if let error = error {
                NSLog("[LinkPortal] Fehler beim Öffnen der Einstellungen: \(error)")
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}
