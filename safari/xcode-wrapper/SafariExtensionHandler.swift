import SafariServices

// ═══════════════════════════════════════════════════════════
// LinkPortal Safari Extension — Extension Handler
// Copyright © 2025 Christian Burgert · www.kleckerbox.link
// ═══════════════════════════════════════════════════════════

class SafariExtensionHandler: SFSafariExtensionHandler {

    override func messageReceived(withName messageName: String,
                                  from page: SFSafariPage,
                                  userInfo: [String : Any]?) {
        // Native messaging bridge (future use)
        NSLog("[LinkPortal] Message received: \(messageName)")
    }

    override func toolbarItemClicked(in window: SFSafariWindow) {
        NSLog("[LinkPortal] Toolbar item clicked")
    }

    override func validateToolbarItem(in window: SFSafariWindow,
                                       validationHandler: @escaping (Bool, String) -> Void) {
        validationHandler(true, "")
    }

    override func popoverViewController() -> SFSafariExtensionViewController {
        return SafariExtensionViewController.shared
    }
}
