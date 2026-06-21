/* ═══════════════════════════════════════════════════════════
   LinkPortal Safari Extension — browser-polyfill.js
   Maps chrome.* → browser.* for Safari WebExtension API
   ═══════════════════════════════════════════════════════════ */

// Safari uses browser.* namespace, Chrome uses chrome.*
// This shim ensures both work transparently.
if (typeof globalThis.chrome === 'undefined' && typeof globalThis.browser !== 'undefined') {
  globalThis.chrome = globalThis.browser;
} else if (typeof globalThis.browser === 'undefined' && typeof globalThis.chrome !== 'undefined') {
  globalThis.browser = globalThis.chrome;
}

// Safari doesn't support chrome.storage.onChanged in the same way —
// wrap it to handle both namespace variants
if (typeof chrome !== 'undefined' && chrome.storage && !chrome.storage.onChanged) {
  chrome.storage.onChanged = browser.storage.onChanged;
}
