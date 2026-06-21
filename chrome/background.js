/* ════════════════════════════════════════════════════
   LinkPortal Extension — background.js  v1.10.9
   Basic Auth · Periodic Sync · 30-day Logout
   ════════════════════════════════════════════════════ */

const ALARM_NAME        = 'linkportal-sync';
const SYNC_MINUTES      = 30;
const MAX_INACTIVE_DAYS = 30;
const THRESH_MAX        = 3;
const THRESH_WINDOW_MS  = 5 * 60 * 1000; // 5 minutes

async function record403bg() {
  const now = Date.now();
  const { err403 } = await chrome.storage.local.get(['err403']);
  const list = (err403 || []).filter(ts => now - ts < THRESH_WINDOW_MS);
  list.push(now);
  await chrome.storage.local.set({ err403: list });
  console.warn(`[LP-bg] 403 count: ${list.length}/${THRESH_MAX}`);
  return list.length >= THRESH_MAX;
}

chrome.runtime.onInstalled.addListener(() => scheduleAlarm());
chrome.runtime.onStartup.addListener(() => {
  restoreIcon();
  checkExpiry();
  scheduleAlarm();
});

// ── Restore toolbar icon from cached PNG data URL ──
async function restoreIcon() {
  try {
    const { logoPngUrl } = await chrome.storage.local.get(['logoPngUrl']);
    if (!logoPngUrl) return;
    const res  = await fetch(logoPngUrl);
    const blob = await res.blob();
    const bmp  = await createImageBitmap(blob);
    const imageData = {};
    for (const sz of [16, 48]) {
      const oc  = new OffscreenCanvas(sz, sz);
      const ctx = oc.getContext('2d');
      ctx.drawImage(bmp, 0, 0, sz, sz);
      imageData[sz] = ctx.getImageData(0, 0, sz, sz);
    }
    await chrome.action.setIcon({ imageData });
  } catch (e) {
    console.warn('[LinkPortal] restoreIcon:', e.message);
  }
}

function scheduleAlarm() {
  chrome.alarms.get(ALARM_NAME, alarm => {
    if (!alarm) chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: SYNC_MINUTES, periodInMinutes: SYNC_MINUTES
    });
  });
}

async function checkExpiry() {
  const { cacheTime } = await chrome.storage.local.get(['cacheTime']);
  if (!cacheTime) return;
  const days = (Date.now() - cacheTime) / (1000 * 60 * 60 * 24);
  if (days >= MAX_INACTIVE_DAYS) await performLogout('expired');
}

// ── Logout: keep URL + username, only remove token ──
async function performLogout(reason) {
  await chrome.storage.local.remove(['cache', 'cacheTime']);
  await chrome.storage.sync.remove(['token']); // ← only token!
  await chrome.storage.local.set({ logoutReason: reason });
}

function makeBasicAuth(username, token) {
  return 'Basic ' + btoa(unescape(encodeURIComponent((username||'') + ':' + (token||''))));
}

// Read widget kind from a section's content JSON ('favorites'/'tags'/...) for bookmark sync
function bgWidgetKind(sec){
  const c=(sec.content||'').trim();
  if(c[0]==='{'||c[0]==='['){ try{ const d=JSON.parse(c); if(d&&d.widget) return String(d.widget).toLowerCase(); }catch{} }
  return 'status';
}
async function fetchAllData(baseUrl, username, token) {
  const base = baseUrl.replace(/\/$/, '');
  const auth = makeBasicAuth(username, token);

  async function get(path) {
    const res = await fetch(base + '/api' + path, { headers: { 'Authorization': auth } });
    if (res.status === 403) throw Object.assign(new Error('403'), { status: 403 });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  const tabs = await get('/tabs');
  const result = { tabs, sections: {}, links: {}, widgetLinks: {}, perms: {}, syncTime: Date.now() };
  let bmSyncOn = false; try { const _s = await chrome.storage.sync.get(['bmSync']); bmSyncOn = _s.bmSync === true; } catch {}
  // Favorites (for the optional "Favoriten" bookmark subfolder) — only when sync is on
  result.favorites = [];
  if (bmSyncOn) { try { result.favorites = await get('/favorites'); } catch { result.favorites = []; } }

  // Fetch all tabs in parallel
  await Promise.all(tabs.map(async tab => {
    result.perms[tab.id] = tab.perms || { can_read:true, can_edit:false, can_delete:false };
    const sections = await get('/tabs/' + tab.id + '/sections');
    result.sections[tab.id] = sections;
    await Promise.all(sections.map(async sec => {
      const st = sec.section_type || 'links';
      if (st === 'links') {
        try { result.links[sec.id] = await get('/sections/' + sec.id + '/links'); }
        catch(e) { if(e.status===403) throw e; result.links[sec.id] = []; }
        return;
      }
      result.links[sec.id] = [];
      // Widget sections that carry link lists (favorites/tags) → fetch into widgetLinks
      if (st === 'widget' && bmSyncOn) {
        const w = bgWidgetKind(sec);
        try {
          if (w === 'favorites') { const r = await get('/sections/' + sec.id + '/favorites'); result.widgetLinks[sec.id] = (r && Array.isArray(r.links)) ? r.links : []; }
          else if (w === 'tags' || w === 'tag') { const r = await get('/sections/' + sec.id + '/taglinks'); result.widgetLinks[sec.id] = (r && Array.isArray(r.links)) ? r.links : []; }
        } catch(e) { if(e.status===403) throw e; }
      }
    }));
  }));

  return result;
}

async function syncInBackground() {
  const { baseUrl, token, username } = await chrome.storage.sync.get(['baseUrl','token','username']);
  if (!baseUrl || !token || !username) return;
  try {
    const data = await fetchAllData(baseUrl, username, token);
    await chrome.storage.local.set({ cache: data, cacheTime: Date.now() });
    await chrome.storage.local.remove(['err403']);
    await mirrorBookmarks();
    // Sync user language preference
    try {
      const meRes = await fetch(baseUrl.replace(/\/$/,'') + '/api/auth/me', {
        headers: { 'Authorization': makeBasicAuth(username, token) },
        credentials: 'omit'
      });
      if (meRes.ok) {
        const me = await meRes.json();
        const lang = me.language || me.language_code || me.lang || me.preferred_language;
        if (lang && ['de','en','es'].includes(lang)) {
          await chrome.storage.local.set({ lang });
        }
      }
    } catch {}
  } catch (err) {
    if (err.status === 403 || (err.message||'').includes('403')) {
      if (await record403bg()) await performLogout('403');
      // else: transient 403, wait for next sync cycle
    }
  }
}

// ── Bookmark mirroring (one-way: portal → a dedicated "LinkPortal" folder) ──
const BM_ROOT_TITLE = 'LinkPortal';
const BM_FAV_TITLE  = 'Favoriten';

function bmAvailable(){ return typeof chrome !== 'undefined' && !!chrome.bookmarks && !!chrome.permissions; }
function hasBmPerm(){
  return new Promise(resolve => {
    try {
      const r = chrome.permissions.contains({ permissions:['bookmarks'] }, g => resolve(!!g));
      if (r && typeof r.then === 'function') r.then(g => resolve(!!g)).catch(() => resolve(false));
    } catch { resolve(false); }
  });
}
function bmHash(cache){
  const parts = [];
  const secLinks = sec => (sec.section_type === 'links') ? (cache.links[sec.id]||[]) : ((cache.widgetLinks && cache.widgetLinks[sec.id]) || []);
  (cache.tabs||[]).forEach(tab => {
    const secs = (cache.sections[tab.id]||[]).filter(s => secLinks(s).length);
    if (!secs.length) return;
    parts.push('T:'+tab.id+':'+(tab.title||''));
    secs.forEach(sec => {
      parts.push('S:'+sec.id+':'+(sec.title||''));
      secLinks(sec).forEach(l => parts.push('L:'+(l.title||'')+'|'+(l.url||'')));
    });
  });
  const str = parts.join('\n');
  let h = 5381; for (let i=0;i<str.length;i++){ h = ((h<<5)+h+str.charCodeAt(i))|0; }
  return String(h);
}
async function bmParentId(pref){
  try {
    const tree = await chrome.bookmarks.getTree();
    const roots = (tree && tree[0] && tree[0].children) || [];
    const pick = id => roots.find(r => r.id === id);
    // Chrome ids '1'/'2'; Firefox 'toolbar_____'/'unfiled_____'; index as last resort
    if (pref === 'bar')   { const r = pick('toolbar_____') || pick('1') || roots[0];             return r ? r.id : undefined; }
    if (pref === 'other') { const r = pick('unfiled_____') || pick('2') || roots[1] || roots[0]; return r ? r.id : undefined; }
    if (pref) {                                             // explicit folder id chosen by the user
      try { const n = await chrome.bookmarks.get(pref); if (n && n[0] && !n[0].url) return pref; } catch {}
      // chosen folder was deleted → fall through to the default parent
    }
  } catch {}
  return undefined;  // fall back to the browser's default parent
}
let bmBusy = false, bmRerun = false;
// Find ALL folders titled like our managed root anywhere in the tree (orphan cleanup, any prior config)
async function findManagedFolders(title){
  const out=[];
  let tree; try { tree = await chrome.bookmarks.getTree(); } catch { return out; }
  const walk = node => { for (const c of (node.children||[])) { if (!c.url) { if (c.title === title) out.push(c.id); walk(c); } } };
  if (tree[0]) walk(tree[0]);
  return out;
}
async function mirrorBookmarks(){
  if (bmBusy) { bmRerun = true; return; }   // serialize: avoid concurrent rebuilds (would create duplicate folders)
  bmBusy = true;
  try {
    const { bmSync, bmParent, bmWrap, bmFav, bmPrivate } = await chrome.storage.sync.get(['bmSync','bmParent','bmWrap','bmFav','bmPrivate']);
    if (!bmSync || !bmAvailable() || !(await hasBmPerm())) return;
    const { cache } = await chrome.storage.local.get(['cache']);
    if (!cache || !cache.tabs) return;
    const wrap = bmWrap !== false;            // default: own "LinkPortal" subfolder
    const fav  = bmFav === true;              // default: no favorites subfolder
    const incPrivate = bmPrivate === true;    // default: skip private tabs
    const tabs = cache.tabs.filter(tb => incPrivate || !tb.is_private);
    const favs = (fav && Array.isArray(cache.favorites)) ? cache.favorites.filter(f => f && f.url) : [];
    const hash = bmHash(cache) + ':' + (bmParent || 'other') + ':' + (wrap ? 'w' : 'd')
               + ':' + (incPrivate ? 'p1' : 'p0')
               + ':' + (fav ? 'f' + favs.map(f => (f.title||'')+'|'+f.url).join('~') : 'f0');
    const { bmRootId, bmDirectIds, bmHash: prev } = await chrome.storage.local.get(['bmRootId','bmDirectIds','bmHash']);
    if (prev === hash) {                       // unchanged + managed nodes still present -> skip rebuild
      try {
        if (wrap && bmRootId) { const n = await chrome.bookmarks.get(bmRootId); if (n && n.length) return; }
        else if (!wrap && Array.isArray(bmDirectIds) && bmDirectIds.length) { const n = await chrome.bookmarks.get(bmDirectIds[0]); if (n && n.length) return; }
      } catch {}
    }
    // Tear down whatever we created before (single root in wrap mode, or the tracked nodes in direct mode)
    if (bmRootId) { try { await chrome.bookmarks.removeTree(bmRootId); } catch {} }
    for (const id of (bmDirectIds || [])) { try { await chrome.bookmarks.removeTree(id); } catch {} }

    const pid = await bmParentId(bmParent || 'other');
    // In BOTH modes: remove EVERY stray "LinkPortal" folder anywhere in the tree (orphans from any prior
    // config, lost ids, changed target) so direct mode never keeps an old wrapper around.
    for (const id of await findManagedFolders(BM_ROOT_TITLE)) { try { await chrome.bookmarks.removeTree(id); } catch {} }

    let rootId, directIds = [];
    if (wrap) {
      const root = await chrome.bookmarks.create(pid ? { parentId: pid, title: BM_ROOT_TITLE } : { title: BM_ROOT_TITLE });
      rootId = root.id;
    } else {
      // Direct mode: write folders straight into the chosen folder; never remove the folder itself
      rootId = pid || await bmParentId('other');
      // Remove any existing folders in the target carrying a managed name (clears leftover duplicates)
      const managed = new Set([BM_FAV_TITLE, ...tabs.map(tb => tb.title || 'Tab')]);
      try { for (const c of await chrome.bookmarks.getChildren(rootId)) if (!c.url && managed.has(c.title)) { try { await chrome.bookmarks.removeTree(c.id); } catch {} } } catch {}
    }

    // "Favoriten" first (position 1)
    if (favs.length) {
      const favFolder = await chrome.bookmarks.create({ parentId: rootId, title: BM_FAV_TITLE });
      if (!wrap) directIds.push(favFolder.id);
      for (const f of favs) await chrome.bookmarks.create({ parentId: favFolder.id, title: f.title || f.url, url: f.url });
    }

    let tabCount = 0;
    const secLinksOf = sec => (sec.section_type === 'links')
      ? (cache.links[sec.id]||[])
      : ((cache.widgetLinks && cache.widgetLinks[sec.id]) || []);
    for (const tab of tabs) {
      const secs = (cache.sections[tab.id]||[]).filter(s => secLinksOf(s).length);
      if (!secs.length) continue;
      const tabFolder = await chrome.bookmarks.create({ parentId: rootId, title: tab.title || 'Tab' });
      tabCount++;
      if (!wrap) directIds.push(tabFolder.id);
      for (const sec of secs) {
        const secFolder = await chrome.bookmarks.create({ parentId: tabFolder.id, title: sec.title || 'Section' });
        for (const l of secLinksOf(sec)) {
          if (l.url) await chrome.bookmarks.create({ parentId: secFolder.id, title: l.title || l.url, url: l.url });
        }
      }
    }

    await chrome.storage.local.set({ bmHash: hash, bmRootId: wrap ? rootId : null, bmDirectIds: wrap ? [] : directIds });
    return { ok:true, wrap, favCount: favs.length, tabCount, privateIncluded: incPrivate };
  } catch (e) { return { ok:false, error: String(e && e.message || e) }; }
  finally {
    bmBusy = false;
    if (bmRerun) { bmRerun = false; mirrorBookmarks(); }   // a request arrived mid-run -> run once more with latest data
  }
}
async function removeBookmarkRoot(){
  try {
    const { bmRootId, bmDirectIds } = await chrome.storage.local.get(['bmRootId','bmDirectIds']);
    if (bmAvailable()) {
      if (bmRootId) { try { await chrome.bookmarks.removeTree(bmRootId); } catch {} }
      for (const id of (bmDirectIds || [])) { try { await chrome.bookmarks.removeTree(id); } catch {} }
    }
    await chrome.storage.local.remove(['bmRootId','bmHash','bmDirectIds']);
  } catch {}
}

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== ALARM_NAME) return;
  await checkExpiry();
  const { token } = await chrome.storage.sync.get(['token']);
  if (token) await syncInBackground();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'fetchAndCache') {
    fetchAllData(msg.baseUrl, msg.username, msg.token)
      .then(data => {
        chrome.storage.local.set({ cache: data, cacheTime: Date.now() });
        chrome.storage.local.remove(['err403']);
        mirrorBookmarks();
        sendResponse({ ok: true, data });
      })
      .catch(async err => {
        if (err.status === 403) { if (await record403bg()) performLogout('403'); }
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }
  if (msg.action === 'syncBookmarks') {
    mirrorBookmarks().then(stats => sendResponse({ ok: true, stats })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.action === 'removeBookmarks') {
    removeBookmarkRoot().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.action === 'logout') {
    performLogout(msg.reason || 'manual').then(() => sendResponse({ ok: true }));
    return true;
  }
});

// ── Auto-Config from LinkPortal portal page ──
// Called via: chrome.runtime.sendMessage(EXTENSION_ID, { action:'autoConfig', ... })
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg.action !== 'autoConfig') { sendResponse({ ok: false, error: 'unknown action' }); return; }

  const { baseUrl, username, token } = msg;
  if (!baseUrl || !username || !token) {
    sendResponse({ ok: false, error: 'missing baseUrl, username or token' }); return;
  }

  // Verify credentials before saving
  fetch(baseUrl.replace(/\/$/,'') + '/api/tabs', {
    headers: { 'Authorization': makeBasicAuth(username, token) },
    credentials: 'omit'
  }).then(async r => {
    if (!r.ok) { sendResponse({ ok: false, error: 'HTTP ' + r.status }); return; }
    await chrome.storage.sync.set({ baseUrl: baseUrl.replace(/\/$/,''), username, token });
    await chrome.storage.local.remove(['cache', 'cacheTime']);
    // Fetch user language preference and store it
    try {
      const meRes = await fetch(baseUrl.replace(/\/$/,'') + '/api/auth/me', {
        headers: { 'Authorization': makeBasicAuth(username, token) },
        credentials: 'omit'
      });
      if (meRes.ok) {
        const me = await meRes.json();
        const lang = me.language || me.language_code || me.lang || me.preferred_language;
        if (lang && ['de','en','es'].includes(lang)) {
          await chrome.storage.local.set({ lang });
        }
      }
    } catch {}
    sendResponse({ ok: true, message: 'LinkPortal Extension erfolgreich konfiguriert!' });
  }).catch(err => sendResponse({ ok: false, error: err.message }));

  return true; // keep channel open for async
});
