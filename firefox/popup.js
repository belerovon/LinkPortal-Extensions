/* ═══════════════════════════════════════════════════════════
   LinkPortal Extension — popup.js  v1.10.9
   ═══════════════════════════════════════════════════════════ */

// Cross-browser API shim: prefer the promise-based `browser.*` when present
// (Firefox/Safari) so `await chrome.*` works; on Chrome `browser` is undefined → native chrome.* (already promise-based in MV3).
if (typeof browser !== 'undefined' && browser.runtime) { try { globalThis.chrome = browser; } catch (e) {} }

const VERSION = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest && chrome.runtime.getManifest().version) || '1.10.23';
const ALL_TAB = 'all'; // virtual tab showing all sections
const RSS_TAB = 'rss'; // virtual tab showing the user's RSS feeds
let _rssCache = null;  // cached RSS fetch for the RSS view (survives sort toggles, cleared on reload)
const MAX_INACTIVE_DAYS = 30;

// ── 403 Threshold: 3 failures within 5 minutes triggers logout ──
const THRESH_MAX = 3;
const THRESH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

async function record403() {
  const now = Date.now();
  const { err403 } = await chrome.storage.local.get(['err403']);
  const list = (err403 || []).filter(ts => now - ts < THRESH_WINDOW_MS);
  list.push(now);
  await chrome.storage.local.set({ err403: list });
  console.warn(`[LP] 403 count in last 5min: ${list.length}/${THRESH_MAX}`);
  return list.length >= THRESH_MAX;
}

async function clear403() {
  await chrome.storage.local.remove(['err403']);
}

const S = {
  baseUrl:'', token:'', username:'',
  theme:'auto',
  tabs:[], sections:{}, links:{}, perms:{},
  portalTitle:'LinkPortal',
  activeTab:null, allLinks:[],
  tokenSaved:false, testPassed:false,
  lastTestedUrl:'', lastTestedUser:'',
};

const $ = id => document.getElementById(id);
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const escRx = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const ini = s => (s||'?').charAt(0).toUpperCase();
const mkAuth = (u,t) => 'Basic ' + btoa(unescape(encodeURIComponent((u||'')+':'+(t||''))));
const apiUrl = p => S.baseUrl.replace(/\/$/,'')+'/api'+p;

// ── SVG icon constants (built once, reused everywhere) ──
const SVG = {
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  del:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>',
  drag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  starOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
};

// ── Tab icons ──
// The API's tab `icon` field may now be inline <svg> markup, an image URL/path, or a legacy emoji/text glyph.
// Sanitize inline SVG before injecting: drop <script>/<foreignObject>, on* handlers and javascript:/data: hrefs.
function sanitizeSvgMarkup(markup, cls){
  try {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(markup);
    const svg = tpl.content.querySelector('svg');
    if(!svg) return '';
    svg.querySelectorAll('script,foreignObject').forEach(n => n.remove());
    const scrub = node => {
      if(node.attributes) [...node.attributes].forEach(a => {
        const n = a.name.toLowerCase();
        if(n.startsWith('on')) node.removeAttribute(a.name);
        else if((n === 'href' || n === 'xlink:href') && /^\s*(javascript|data):/i.test(a.value)) node.removeAttribute(a.name);
      });
      [...node.children].forEach(scrub);
    };
    scrub(svg);
    svg.setAttribute('class', ((svg.getAttribute('class')||'') + ' ' + cls).trim());
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    return svg.outerHTML;
  } catch { return ''; }
}
// Build the HTML for a tab icon (returns '' when there is no icon).
function iconHtml(icon, cls){
  const raw = icon == null ? '' : String(icon).trim();
  if(!raw) return '';
  if(/^(<\?xml|<svg[\s>])/i.test(raw)) {                                  // inline SVG markup
    const svg = sanitizeSvgMarkup(raw, 'icon-svg');
    return svg ? '<span class="'+cls+'">'+svg+'</span>' : '';
  }
  if(/^https?:\/\//i.test(raw) || raw.startsWith('/') || /^data:image\//i.test(raw)) {  // URL / path (mirror favicon())
    const base = S.baseUrl.replace(/\/$/,'');
    const src  = raw.startsWith('/') ? base+raw : raw;
    return '<span class="'+cls+'"><img src="'+esc(src)+'" alt="" loading="lazy" onerror="this.closest(\'.'+cls+'\').style.display=\'none\'"></span>';
  }
  const ic = window.Icons;                                                // named icon (LinkPortal Lucide set)
  if(ic && typeof ic[raw] === 'string') return '<span class="'+cls+'">'+ic[raw]+'</span>';
  return '<span class="'+cls+' icon-text">'+esc(raw)+'</span>';           // emoji / text (legacy)
}
// Tabs and sections both store icons as a Lucide name (or legacy emoji / inline svg / url) — same resolution.
function tabIconHtml(icon){ return iconHtml(icon, 'tab-ic'); }
function sectionIconHtml(icon){ return iconHtml(icon, 'section-icon'); }

// Inline a named LinkPortal icon (Lucide); '' if unknown so callers can fall back.
function iconSvg(name){ return (window.Icons && typeof window.Icons[name]==='string') ? window.Icons[name] : ''; }
// Set a settings card headline as: icon + text (icon dropped if unknown).
function setCardTitle(id, iconName, text){
  const el = $(id); if(!el) return;
  const s = iconSvg(iconName);
  el.innerHTML = (s ? '<span class="card-title-ic">'+s+'</span>' : '') + esc(text);
}
// Extension-local icons not present in the portal set
SVG.themeAuto = '<svg class="lpi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" stroke="none"/></svg>';
SVG.calendar  = '<svg class="lpi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>';
SVG.rss       = '<svg class="lpi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>';
// Priority indicator dots — intentional semantic colors (not theme-following)
SVG.prioHigh   = '<svg class="lpi prio-dot" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="#ef4444"/></svg>';
SVG.prioMedium = '<svg class="lpi prio-dot" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="#f59e0b"/></svg>';
SVG.prioLow    = '<svg class="lpi prio-dot" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="#22c55e"/></svg>';
// Replace the static emoji placeholders in the markup with SVG icons (once, after Icons is loaded).
function paintIcons(){
  const set=(id,name)=>{const el=$(id); if(el){const s=iconSvg(name); if(s) el.innerHTML=s;}};
  set('cache-badge','package');
  set('s-btn-edit-tok','edit');
  set('s-btn-copy-id','copy');
  set('setup-icon','link');
  set('error-icon','warning');
  const q=(sel,html)=>{const el=document.querySelector(sel); if(el&&html) el.innerHTML=html;};
  q('#s-theme-light .theme-btn-icon', iconSvg('sun'));
  q('#s-theme-dark .theme-btn-icon',  iconSvg('moon'));
  q('#s-theme-auto .theme-btn-icon',  SVG.themeAuto);
}

// ── Theme ──
function applyTheme(theme) {
  S.theme = theme || 'auto';
  document.documentElement.dataset.theme = S.theme;
  // Update settings panel buttons
  document.querySelectorAll('.theme-btn-lg').forEach(b =>
    b.classList.toggle('active', b.dataset.theme === S.theme));
  applyLogoForTheme(); // swap to the dark/light logo variant that matches
}

async function changeTheme(theme) {
  applyTheme(theme);
  await chrome.storage.local.set({ theme });
}

// ── Language ──
function applyLang() {
  const ver = 'v'+VERSION;
  $('search-input').placeholder   = t('search_placeholder');
  $('loading-text').textContent    = t('loading');
  $('setup-title').textContent     = t('setup_title');
  $('setup-desc').textContent      = t('setup_desc');
  $('btn-open-settings').textContent = t('setup_btn');
  $('btn-logout-settings').textContent = t('logout_btn');
  $('error-title').textContent     = t('error_title');
  $('btn-retry').textContent       = t('retry');
  $('btn-refresh').title           = t('refresh');
  $('dd-lbl-portal').textContent   = t('open_portal');
  $('dd-lbl-settings').textContent = t('menu_settings');
  $('dd-version').textContent      = ver;
  $('dd-lang-sel').value           = _lang;
  if($('s-version-btn')) $('s-version-btn').textContent = ver;
  setCardTitle('s-lbl-theme-title','palette', t('menu_theme')||'Design');
  $('s-lbl-theme-light').textContent  = t('theme_light');
  $('s-lbl-theme-auto').textContent   = t('theme_auto');
  $('s-lbl-theme-dark').textContent   = t('theme_dark');
  $('s-title-lbl').textContent     = t('settings_title');
  setCardTitle('s-lbl-conn','plug', t('lbl_connection'));
  $('s-lbl-url').textContent       = t('lbl_url');
  $('s-base-url').placeholder      = 'https://portal.example.com';
  $('s-hint-url').textContent      = t('lbl_url_hint');
  $('s-lbl-user').textContent      = t('lbl_user');
  $('s-hint-user').textContent     = t('lbl_user_hint');
  $('s-lbl-token').textContent     = t('lbl_token');
  $('s-hint-token').textContent    = t('lbl_token_hint');
  setCardTitle('s-lbl-test-title','activity', t('lbl_test'));
  $('s-lbl-test-btn').textContent  = t('btn_test');
  setCardTitle('s-lbl-sync-title','refresh', t('lbl_sync_section'));
  setCardTitle('s-lbl-bm-title','bookmark', t('lbl_bookmarks'));
  if($('s-lbl-bm-label')) $('s-lbl-bm-label').textContent = t('lbl_bm_label');
  if($('s-lbl-bm-hint'))  $('s-lbl-bm-hint').textContent  = t('lbl_bm_hint');
  if($('s-lbl-bm-loc'))   $('s-lbl-bm-loc').textContent   = t('lbl_bm_loc');
  if($('s-lbl-bm-sync-now')) $('s-lbl-bm-sync-now').textContent = t('bm_sync_now');
  if($('s-lbl-bm-newfolder')) $('s-lbl-bm-newfolder').textContent = t('bm_new_folder');
  if($('s-lbl-bm-wrap'))      $('s-lbl-bm-wrap').textContent      = t('lbl_bm_wrap');
  if($('s-lbl-bm-wrap-hint')) $('s-lbl-bm-wrap-hint').textContent = t('lbl_bm_wrap_hint');
  if($('s-lbl-bm-fav'))       $('s-lbl-bm-fav').textContent       = t('lbl_bm_fav');
  if($('s-lbl-bm-fav-hint'))  $('s-lbl-bm-fav-hint').textContent  = t('lbl_bm_fav_hint');
  if($('s-lbl-bm-private'))      $('s-lbl-bm-private').textContent      = t('lbl_bm_private');
  if($('s-lbl-bm-private-hint')) $('s-lbl-bm-private-hint').textContent = t('lbl_bm_private_hint');
  if($('s-bm-loc-other')) $('s-bm-loc-other').textContent = t('bm_loc_other');
  if($('s-bm-loc-bar'))   $('s-bm-loc-bar').textContent   = t('bm_loc_bar');
  $('s-lbl-last-sync').textContent = t('lbl_last_sync');
  $('s-lbl-auto').textContent      = t('lbl_auto_sync');
  $('s-auto-val').textContent      = t('lbl_auto_val');
  $('s-lbl-cached').textContent    = t('lbl_cached');
  $('s-lbl-sync-now').textContent  = t('btn_sync_now');
  $('s-lbl-clear').textContent     = t('btn_clear_cache');
  setCardTitle('s-lbl-starttab-title','zap', t('lbl_starttab'));
  if($('s-lbl-starttab-label'))  $('s-lbl-starttab-label').textContent  = t('lbl_starttab_label');
  if($('s-lbl-starttab-hint'))   $('s-lbl-starttab-hint').textContent   = t('lbl_starttab_hint');
  if($('s-starttab-last'))  $('s-starttab-last').textContent  = t('lbl_starttab_last');
  if($('s-starttab-first')) $('s-starttab-first').textContent = t('lbl_starttab_first');
  if($('s-starttab-all'))   $('s-starttab-all').textContent   = t('lbl_starttab_all');
  setCardTitle('s-lbl-lang-title','globe', t('lbl_lang'));
  $('s-lbl-lang-sel').textContent  = t('lbl_lang_select');
  $('s-hint-lang').textContent     = t('lbl_lang_hint');
  $('s-lbl-reset').textContent     = t('btn_reset');
  $('s-lbl-save').textContent      = t('btn_save');
  $('s-lang').value                = _lang;
  $('dlg-lbl-url').textContent     = t('lbl_link_url');
  $('dlg-btn-current').textContent = t('btn_use_current');
  $('dlg-lbl-title').textContent   = t('lbl_link_title');
  $('dlg-lbl-desc').textContent    = t('lbl_link_desc');
  $('dlg-lbl-logo').textContent    = t('lbl_link_logo');
  $('dlg-lbl-sec').textContent     = t('lbl_link_section');
  $('dlg-lbl-cancel').textContent  = t('btn_cancel');
  $('dlg-lbl-save').textContent    = t('btn_save_link');
  if($('tab-add-btn')) $('tab-add-btn').textContent = t('btn_add_link');
}

// ── Show screen ──
function showScreen(name) {
  ['logout','setup','loading','error','main','settings'].forEach(n => {
    const el = $('screen-'+n); if(el) el.style.display = 'none';
  });
  const el = $('screen-'+name); if(el) el.style.display = 'flex';
  // Hide search bar in settings
  const sw = $('search-wrap');
  if(sw) sw.style.display = (name === 'settings') ? 'none' : '';
}

// ── Logout — keeps URL and username, only removes token ──
async function doLogout(reason) {
  await chrome.storage.local.remove(['cache','cacheTime']);
  await chrome.storage.sync.remove(['token']); // ← only token!
  S.token = ''; S.tokenSaved = false; S.testPassed = false;
  $('logout-icon').innerHTML    = iconSvg(reason==='403' ? 'lock' : 'timer') || esc(reason==='403' ? t('logout_403_icon') : t('logout_exp_icon'));
  $('logout-title').textContent = reason==='403' ? t('logout_403_title') : t('logout_exp_title');
  $('logout-desc').textContent  = reason==='403' ? t('logout_403_desc')  : t('logout_exp_desc');
  showScreen('logout');
}

// ── API ──
async function apiFetch(method, path, body) {
  const opts = {
    method, credentials:'omit',
    headers:{'Authorization':mkAuth(S.username,S.token),'Content-Type':'application/json'}
  };
  if(body) opts.body = JSON.stringify(body);
  const res = await fetch(apiUrl(path), opts);
  if(res.status===403) throw Object.assign(new Error('403'),{status:403});
  if(!res.ok) throw new Error('HTTP '+res.status+': '+res.statusText);
  if(res.status===204) return null;
  return res.json();
}
const apiGet  = p    => apiFetch('GET',p);
const apiPost = (p,b)=> apiFetch('POST',p,b);
const apiPut  = (p,b)=> apiFetch('PUT',p,b);
const apiDel  = p    => apiFetch('DELETE',p);

// ── Branding: logo (cached) + title ──
async function setLogoDisplay(src) {
  $('portal-logo').src = src;
  $('portal-logo').style.display = '';
  $('default-icon').style.display = 'none';
}
// True when the popup is effectively rendered dark (explicit dark, or auto + OS dark)
function isDarkActive() {
  const th = S.theme || 'auto';
  if(th === 'dark') return true;
  if(th === 'light') return false;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
}
// Pick the cached logo variant that matches the current theme (falls back to the light/default logo)
async function applyLogoForTheme() {
  const { logoDisplayUrl, logoDisplayUrlDark } = await chrome.storage.local.get(['logoDisplayUrl','logoDisplayUrlDark']);
  const src = (isDarkActive() && logoDisplayUrlDark) ? logoDisplayUrlDark : logoDisplayUrl;
  if(src) setLogoDisplay(src);
}

async function setToolbarIcon(img) {
  try {
    const d = {};
    for(const sz of [16, 48]) {
      const c = document.createElement('canvas');
      c.width = c.height = sz;
      c.getContext('2d').drawImage(img, 0, 0, sz, sz);
      d[sz] = c.getContext('2d').getImageData(0, 0, sz, sz);
    }
    await chrome.action.setIcon({ imageData: d });
  } catch {}
}

async function loadBranding() {
  const base = S.baseUrl.replace(/\/$/,'');

  // Show cached logo immediately
  const cached = await chrome.storage.local.get(['logoDisplayUrl','logoPngUrl']);
  if(cached.logoDisplayUrl) applyLogoForTheme();

  // Try SVG first (best for display), PNG fallback — light/default variant
  let displayDataUrl = null;
  for(const path of ['/img/logo.svg', '/img/logo.png']) {
    try {
      const r = await fetch(base+path, {mode:'cors'});
      if(!r.ok) continue;
      const blob = await r.blob();
      displayDataUrl = await new Promise(res => {
        const rd = new FileReader();
        rd.onload = e => res(e.target.result);
        rd.onerror = () => res(null);
        rd.readAsDataURL(blob);
      });
      if(displayDataUrl) {
        await chrome.storage.local.set({ logoDisplayUrl: displayDataUrl });
        applyLogoForTheme();
        break;
      }
    } catch {}
  }

  // Optional dark-mode logo variant — used when the popup is rendered dark
  for(const path of ['/img/logo-dark.svg', '/img/logo-dark.png']) {
    try {
      const r = await fetch(base+path, {mode:'cors'});
      if(!r.ok) continue;
      const blob = await r.blob();
      const darkUrl = await new Promise(res => {
        const rd = new FileReader();
        rd.onload = e => res(e.target.result);
        rd.onerror = () => res(null);
        rd.readAsDataURL(blob);
      });
      if(darkUrl) { await chrome.storage.local.set({ logoDisplayUrlDark: darkUrl }); applyLogoForTheme(); break; }
    } catch {}
  }

  // Fetch PNG for toolbar icon (SVG not supported by chrome.action.setIcon)
  for(const path of ['/img/logo.png', '/favicon.ico', '/img/favicon.png']) {
    try {
      const r = await fetch(base+path, {mode:'cors'});
      if(!r.ok) continue;
      const ct = r.headers.get('content-type')||'';
      if(!ct.includes('png') && !ct.includes('ico') && !ct.includes('image')) continue;
      const blob = await r.blob();
      const objUrl = URL.createObjectURL(blob);
      const img = await new Promise((res,rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = objUrl;
      }).catch(() => null);
      URL.revokeObjectURL(objUrl);
      if(!img) continue;
      await setToolbarIcon(img);
      // Store data URL for background.js startup restore
      const rd = new FileReader();
      const pngDataUrl = await new Promise(res => {
        rd.onload = e => res(e.target.result);
        rd.onerror = () => res(null);
        rd.readAsDataURL(blob);
      });
      if(pngDataUrl) await chrome.storage.local.set({ logoPngUrl: pngDataUrl });
      break;
    } catch {}
  }

  // ── Portal title ──
  try {
    const r = await fetch(base+'/', {credentials:'omit', mode:'cors'});
    if(r.ok) {
      const html = await r.text();
      const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = m?.[1]?.trim();
      if(title && title !== 'LinkPortal' && title.length < 60) {
        S.portalTitle = title;
        $('portal-title').textContent = title;
      }
    }
  } catch {}
}

// ── Fetch all portal data — tabs in parallel ──
async function fetchFromApi() {
  $('loading-text').textContent = t('loading');
  const tabs = await apiGet('/tabs');
  const sections={}, links={}, perms={}, widgetLinks={};

  // Fetch all tabs in parallel for speed
  await Promise.all(tabs.map(async tab => {
    perms[tab.id] = tab.perms || {can_read:true,can_edit:false,can_delete:false};
    const secs = await apiGet('/tabs/'+tab.id+'/sections');
    sections[tab.id] = secs;
    await Promise.all(secs.map(async sec => {
      const st = sec.section_type || 'links';
      if(st === 'links') {
        try { links[sec.id] = await apiGet('/sections/'+sec.id+'/links'); }
        catch(e) { if(e.status===403) throw e; links[sec.id]=[]; }
        const secHealth = sec.health_check !== false;          // section-level health-check toggle
        for(const l of (links[sec.id]||[])) l._secHealth = secHealth;
        return;
      }
      links[sec.id] = [];
      // Widget sections that carry link lists (favorites/tags) → fetch into widgetLinks
      // so tabs consisting only of such widgets can still be mirrored to bookmarks.
      // Only needed for bookmark sync, so skip the extra API calls when it's off.
      if(st === 'widget' && S.bmSync) {
        const w = (widgetCfg(sec).widget || '').toLowerCase();
        try {
          if(w === 'favorites') { const r = await apiGet('/sections/'+sec.id+'/favorites'); widgetLinks[sec.id] = (r && Array.isArray(r.links)) ? r.links : []; }
          else if(w === 'tags' || w === 'tag') { const r = await apiGet('/sections/'+sec.id+'/taglinks'); widgetLinks[sec.id] = (r && Array.isArray(r.links)) ? r.links : []; }
        } catch(e) { if(e.status===403) throw e; }
      }
    }));
  }));

  const data={tabs,sections,links,widgetLinks,perms,syncTime:Date.now()};
  data.favorites = [];
  if(S.bmSync){ try { data.favorites = await apiGet('/favorites'); } catch { data.favorites = []; } }
  await chrome.storage.local.set({cache:data,cacheTime:Date.now()});
  // Mirror to browser bookmarks if enabled (skip the message entirely when the feature is off)
  if(S.bmSync){ try { mirrorBookmarksLocal().catch(()=>{}); } catch {} }
  return data;
}

function applyData(data, lastActiveTab, startTab='last') {
  S.tabs=data.tabs||[]; S.sections=data.sections||{};
  S.links=data.links||{}; S.perms=data.perms||{};
  // startTab: 'last' = restore last, 'first' = always first, 'all' = virtual all-tab
  if(startTab === 'all') {
    S.activeTab = ALL_TAB;
  } else if(startTab === 'last' && lastActiveTab) {
    if(lastActiveTab === ALL_TAB) S.activeTab = ALL_TAB;
    else if(lastActiveTab === RSS_TAB) S.activeTab = RSS_TAB;
    else if(S.tabs.find(t2=>t2.id===lastActiveTab)) S.activeTab = lastActiveTab;
    else S.activeTab = S.tabs[0]?.id || null;
  } else {
    // 'first' or no match
    S.activeTab = S.tabs[0]?.id || null;
  }
  // Build flat link list with precomputed search string
  S.allLinks=[];
  for(const tab of S.tabs)
    for(const sec of (S.sections[tab.id]||[]))
      for(const link of (S.links[sec.id]||[]))
        S.allLinks.push({...link,tabTitle:tab.title,tabId:tab.id,
          sectionTitle:sec.title,sectionId:sec.id,
          _search:[link.title||'',link.description||'',link.url||'',tab.title,sec.title,((link.tags||[]).join(' '))].join('\0').toLowerCase(),
          _tags:(link.tags||[]).map(x=>String(x).toLowerCase())
        });
}

// ── Load data (cache-first) ──
async function loadData(force=false) {
  showScreen('loading');
  _rssCache = null;   // RSS view reflects freshly (re)loaded data
  $('cache-badge').style.display='none';
  if(!force) {
    const {cacheTime}=await chrome.storage.local.get(['cacheTime']);
    if(cacheTime&&(Date.now()-cacheTime)/86400000>=MAX_INACTIVE_DAYS){await doLogout('expired');return;}
  }
  try {
    if(!force){
      const {cache, lastActiveTab, startTab}=await chrome.storage.local.get(['cache','lastActiveTab','startTab']);
      if(cache){
        applyData(cache, lastActiveTab, startTab||'last'); renderAll(); showScreen('main');
        setTimeout(() => $('search-input')?.focus(), 50);
        $('cache-badge').style.display='';
        $('cache-badge').title=t('cache_from')+' '+new Date(cache.syncTime).toLocaleString();
        bgRefresh(); return;
      }
    }
    const {lastActiveTab, startTab}=await chrome.storage.local.get(['lastActiveTab','startTab']);
    applyData(await fetchFromApi(), lastActiveTab, startTab||'last'); clear403(); renderAll(); showScreen('main');
    // Auto-focus search immediately
    setTimeout(() => $('search-input')?.focus(), 50);
  } catch(err) {
    if(err.status===403){if(await record403())await doLogout('403');else{$('error-message').textContent=t('test_err_403');showScreen('error');}return;}
    const {cache}=await chrome.storage.local.get(['cache']);
    const {startTab:stFb}=await chrome.storage.local.get(['startTab']);
    if(cache){applyData(cache, S.activeTab, stFb||'last');renderAll();showScreen('main');
      $('cache-badge').style.display='';
      $('cache-badge').title=t('cache_offline')+' '+new Date(cache.syncTime).toLocaleString();}
    else{$('error-message').textContent=err.message;showScreen('error');}
  }
}

// ── Fetch language preference from portal (tries /auth/me then /settings) ──
async function syncLangFromPortal() {
  if(!S.baseUrl || !S.token) return;
  let portalLang = null;
  // Try /auth/me
  try {
    const me = await apiGet('/auth/me');
    const candidate = me.language || me.language_code || me.lang || me.preferred_language;
    if(candidate && I18N[candidate]) portalLang = candidate;
  } catch {}
  // Fallback: GET /settings (same endpoint we PUT to)
  if(!portalLang) {
    try {
      const settings = await apiGet('/settings');
      const candidate = settings.language || settings.language_code || settings.lang;
      if(candidate && I18N[candidate]) portalLang = candidate;
    } catch {}
  }
  // Apply only if different from current
  if(portalLang && portalLang !== _lang) {
    await changeLang(portalLang, true); // true = don't sync back to portal
  }
}

async function bgRefresh() {
  try{
    const {lastActiveTab, startTab}=await chrome.storage.local.get(['lastActiveTab','startTab']);
    applyData(await fetchFromApi(), lastActiveTab, startTab||'last');
    clear403();
    $('cache-badge').style.display='none';
    renderAll();
    // Always fetch lang from portal directly — don't rely on stale storage
    await syncLangFromPortal();
  }
  catch(e){if(e.status===403){if(await record403())await doLogout('403');}}
}

// ── Render ──
function renderAll() {
  if(!S.tabs.length){
    $('tabs-bar').style.display='none';
    $('tab-content').innerHTML='<div class="empty-tab"><div class="empty-icon">'+iconSvg('lock')+'</div><p>'+t('no_tabs')+'</p></div>';
    return;
  }
  $('tabs-bar').style.display='';
  if(!S.activeTab) S.activeTab = S.tabs[0]?.id || null;
  renderTabBar(); renderTabContent(S.activeTab);
}

// ── Tab bar: hamburger toggle ──
function renderTabBar() {
  const label = $('active-tab-label');
  if(S.activeTab === ALL_TAB) {
    label.innerHTML = tabIconHtml('clipboard') + esc(t('tab_all_label'));
  } else if(S.activeTab === RSS_TAB) {
    label.innerHTML = tabIconHtml(SVG.rss) + esc(t('rss_title'));
  } else {
    const activeTab = S.tabs.find(t2=>t2.id===S.activeTab);
    label.innerHTML = tabIconHtml(activeTab?.icon) + esc(activeTab?.title || '');
  }
  // Add-link: visible in all tabs including ALL_TAB (section select in dialog handles context)
  const canAdd = S.tabs.some(tab => {
    const tp = S.perms[tab.id]||{};
    return (S.sections[tab.id]||[]).some(sec => {
      if(sec.section_type && sec.section_type !== 'links') return false;
      const sp = sec.sec_perms || sec.perms || null;
      return sp ? (sp.can_create||sp.can_edit||false) : (tp.can_edit||false);
    });
  });
  const addBtn = $('tab-add-btn');
  addBtn.style.display = (canAdd && S.activeTab !== RSS_TAB) ? '' : 'none';
  addBtn.textContent = t('btn_add_link');
}

function switchTab(tabId) {
  if(_dnd) { _dnd.item.classList.remove('dragging'); _dnd.item.style.visibility=''; _dnd.line.remove(); _dnd=null; }
  S.activeTab = tabId;
  chrome.storage.local.set({ lastActiveTab: tabId });
  clearSearch(); renderTabBar(); renderTabContent(S.activeTab);
}

function openTabsDropdown() {
  const dropdown = $('tabs-dropdown');
  const chevron  = $('tabs-chevron');
  const burger   = $('tabs-burger');
  if(dropdown.style.display !== 'none') {
    dropdown.style.display = 'none'; chevron.classList.remove('open'); if(burger) burger.classList.remove('open'); return;
  }
  // "Alle Sektionen" virtual tab at top
  const allItem = '<button class="tab-drop-item'+(S.activeTab===ALL_TAB?' active':'')+'" data-id="'+ALL_TAB+'">'+
    tabIconHtml('clipboard')+'<span>'+esc(t('lbl_starttab_all'))+'</span></button>';
  const rssItem = '<button class="tab-drop-item'+(S.activeTab===RSS_TAB?' active':'')+'" data-id="'+RSS_TAB+'">'+
    tabIconHtml(SVG.rss)+'<span>'+esc(t('rss_title'))+'</span></button>';
  dropdown.innerHTML = allItem + rssItem + S.tabs.map(tab =>
    '<button class="tab-drop-item'+(tab.id===S.activeTab?' active':'')+'" data-id="'+tab.id+'">'+
    tabIconHtml(tab.icon)+
    '<span>'+esc(tab.title)+'</span></button>'
  ).join('');
  dropdown.querySelectorAll('.tab-drop-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const rawId = btn.dataset.id;
      const tabId = (rawId === ALL_TAB || rawId === RSS_TAB) ? rawId : parseInt(rawId);
      dropdown.style.display = 'none'; chevron.classList.remove('open'); if(burger) burger.classList.remove('open');
      switchTab(tabId);
    });
  });
  dropdown.style.display = ''; chevron.classList.add('open'); if(burger) burger.classList.add('open');
}

// ── Render search engine section ──
function renderSearchSection(sec) {
  let engines = [];
  // Parse engine list from content JSON
  if(sec.content) {
    try {
      const cfg = JSON.parse(sec.content);
      if(Array.isArray(cfg.engines)) engines = cfg.engines;
      else {
        // Legacy format: {web:true, ai:true}
        if(cfg.web) engines.push(...['google','bing','ddg']);
        if(cfg.ai)  engines.push(...['claude','chatgpt','gemini']);
      }
    } catch {}
  }
  if(!engines.length) engines = ['google','bing','ddg'];

  const ENGINE_MAP = {
    google:  { label:'Google',     url:'https://www.google.com/search?q={q}',         icon:'🔍' },
    bing:    { label:'Bing',       url:'https://www.bing.com/search?q={q}',            icon:'🔎' },
    ddg:     { label:'DuckDuckGo', url:'https://duckduckgo.com/?q={q}',               icon:'🦆' },
    claude:  { label:'Claude',     url:'https://claude.ai/new?q={q}',                 icon:'🤖' },
    chatgpt: { label:'ChatGPT',    url:'https://chat.openai.com/?q={q}',              icon:'💬' },
    gemini:  { label:'Gemini',     url:'https://gemini.google.com/app?q={q}',         icon:'✨' },
    brave:   { label:'Brave',      url:'https://search.brave.com/search?q={q}',       icon:'🦁' },
    ecosia:  { label:'Ecosia',     url:'https://www.ecosia.org/search?method=index&q={q}', icon:'🌱' },
  };

  const buttons = engines
    .filter(id => ENGINE_MAP[id])
    .map(id => {
      const e = ENGINE_MAP[id];
      return '<button class="search-engine-btn" data-url="'+esc(e.url)+'" title="'+esc(e.label)+'">'
        + e.icon + ' ' + esc(e.label) + '</button>';
    }).join('');

  return '<div class="section-block search-section-widget" data-sec-id="'+sec.id+'">'
    + '<div class="section-header">'
    + sectionIconHtml(sec.icon)
    + '<span class="section-title">'+esc(sec.title)+'</span>'
    + '</div>'
    + '<div class="search-widget">'
    + '<input type="text" class="search-input search-widget-input" placeholder="'+t('lbl_search_section_placeholder')+'">'
    + '<div class="search-engine-btns">'+buttons+'</div>'
    + '</div></div>';
}

// ── Wire interactive widgets (search/tasks/translate) in a container ──
function wireWidgets(container) {
  container.querySelectorAll('.search-section-widget').forEach(widget => {
    const input = widget.querySelector('.search-widget-input');
    widget.querySelectorAll('.search-engine-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = input.value.trim();
        if(!q) { input.focus(); return; }
        chrome.tabs.create({url: btn.dataset.url.replace('{q}', encodeURIComponent(q)), active:true});
      });
    });
    input.addEventListener('keydown', e => {
      if(e.key === 'Enter') { const f = widget.querySelector('.search-engine-btn'); if(f) f.click(); }
    });
  });
  container.querySelectorAll('.tasks-section-widget').forEach(w =>
    loadTasksInto(w, parseInt(w.dataset.secId)));
  container.querySelectorAll('.translate-section-widget').forEach(w =>
    wireTranslateWidget(w));
  container.querySelectorAll('.widget-section-widget').forEach(w =>
    loadWidgetInto(w, parseInt(w.dataset.secId), w.dataset.widget));
}

// ── Render ALL SECTIONS virtual tab ──
function renderAllSections() {
  const content = $('tab-content');
  let html = '', has = false;
  for(const tab of S.tabs) {
    const secs = S.sections[tab.id]||[];
    const tabPerm = S.perms[tab.id]||{};
    for(const sec of secs) {
      const st = sec.section_type || 'links';
      if(st !== 'links' && st !== 'search' && st !== 'tasks' && st !== 'translate' && st !== 'widget') continue;
      if(st === 'links' && !(S.links[sec.id]||[]).length) continue;
      if(has) html += '<div class="section-divider"></div>';
      has = true;
      // Tab label above first section of each tab
      const sp = sec.sec_perms || sec.perms || null;
      const canEdit = sp ? (sp.can_edit||false) : (tabPerm.can_edit||false);
      const canDel  = sp ? (sp.can_delete||false) : (tabPerm.can_delete||false);
      if(st === 'search')    { html += renderSearchSection(sec); continue; }
      if(st === 'tasks')     { html += renderTasksSection(sec); continue; }
      if(st === 'translate') { html += renderTranslateSection(sec); continue; }
      if(st === 'widget')    { html += renderWidgetSection(sec); continue; }
      const lnks = S.links[sec.id]||[];
      html += '<div class="section-block" data-sec-id="'+sec.id+'"><div class="section-header">'
        + sectionIconHtml(sec.icon)
        + '<span class="section-title">'+esc(sec.title)+'</span>'
        + '<span class="all-tab-label">'+esc(tab.title)+'</span>'
        + '<button class="section-count" data-sec-id="'+sec.id+'" title="'+t('open_all_links')+'">'+lnks.length+'</button>'
        + (canEdit && sec.health_check !== false?'<button class="section-check" data-sec-id="'+sec.id+'" title="'+t('check_links')+'">'+SVG.refresh+'</button>':'')
        + '</div>'
        + lnks.map(l=>linkHtml({...l, sectionId:sec.id}, canEdit, canDel)).join('')
        + '</div>';
    }
  }
  content.innerHTML = has ? html : '<div class="empty-tab"><div class="empty-icon">'+iconSvg('inbox')+'</div><p>'+t('no_links')+'</p></div>';
  bindLinks(content, null);
  wireSectionChecks(content);
  content.querySelectorAll('.section-count[data-sec-id]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      (S.links[parseInt(btn.dataset.secId)]||[]).forEach(l => chrome.tabs.create({url:l.url,active:false}));
    });
  });
  wireWidgets(content);
}

// F: RSS view — feeds from /api/settings, content via /api/rss.
// Sortable: grouped by feed, or merged and sorted by date (newest first).
// Default mode comes from the portal preference rss_group_by; toggling reuses a short cache.
function _rssItemHtml(it, withSource){
  return '<a class="link-item rss-item" href="#" data-url="'+esc(it.link || '')+'">'
    + '<div class="link-info"><div class="link-title">'+esc(it.title || it.link || '')+'</div>'
    + '<div class="link-desc rss-meta">'
      + (withSource && it._feed ? '<span class="rss-source">'+esc(it._feed)+'</span>' : '')
      + (it.date ? '<span class="rss-date">'+esc(it.date)+'</span>' : '')
    + '</div></div></a>';
}

function layoutRss(c, mode){
  const results = (_rssCache && _rssCache.results) || [];
  if(!results.length){
    c.innerHTML = '<div class="empty-tab"><div class="empty-icon">'+SVG.rss+'</div><p>'+esc(t('rss_empty'))+'</p></div>';
    return;
  }
  const bar = '<div class="rss-sortbar">'
    + '<button class="rss-sort-btn'+(mode==='date'?' active':'')+'" data-mode="date">'+esc(t('rss_by_date'))+'</button>'
    + '<button class="rss-sort-btn'+(mode==='feed'?' active':'')+'" data-mode="feed">'+esc(t('rss_by_feed'))+'</button>'
    + '</div>';
  let body;
  if(mode === 'date'){
    const all = [];
    for(const { f, items } of results)
      for(const it of items) all.push({ ...it, _feed: f.title || f.url });
    all.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
    body = all.length
      ? '<div class="rss-flat">'+all.map(it => _rssItemHtml(it, true)).join('')+'</div>'
      : '<div class="widget-empty">'+esc(t('widget_empty'))+'</div>';
  } else {
    body = '<div class="rss-wrap">'+results.map(({ f, items }) =>
      '<div class="section-block rss-feed"><div class="section-header">'+sectionIconHtml(SVG.rss)
      + '<span class="section-title">'+esc(f.title || f.url)+'</span></div>'
      + '<div class="rss-items">'+(items.length ? items.map(it => _rssItemHtml(it, false)).join('')
          : '<div class="widget-empty">'+esc(t('widget_empty'))+'</div>')+'</div></div>'
    ).join('')+'</div>';
  }
  c.innerHTML = bar + body;
  c.querySelectorAll('.rss-item').forEach(el =>
    el.addEventListener('click', e => { e.preventDefault(); if(el.dataset.url) openLink(el.dataset.url, 'blank'); }));
  c.querySelectorAll('.rss-sort-btn').forEach(btn =>
    btn.addEventListener('click', () => { c.dataset.rssSort = btn.dataset.mode; layoutRss(c, btn.dataset.mode); }));
}

async function renderRss(){
  const c = $('tab-content');
  if(!_rssCache || Date.now() - _rssCache.ts > 60000){      // refetch only if stale (cache survives toggles)
    c.innerHTML = '<div class="rss-loading" style="padding:16px;color:var(--text-dim)">'+spin()+'</div>';
    let feeds = [], maxItems = 8, groupBy = 'date';
    try { const s = await apiGet('/settings'); feeds = (s && s.rss_feeds) || []; maxItems = (s && s.rss_max_items) || 8; groupBy = (s && s.rss_group_by) || 'date'; } catch {}
    if(S.activeTab !== RSS_TAB) return;                       // navigated away while loading
    if(!c.dataset.rssSort) c.dataset.rssSort = (groupBy === 'feed' ? 'feed' : 'date');
    if(!feeds.length){
      _rssCache = { results: [], ts: Date.now() };
      c.innerHTML = '<div class="empty-tab"><div class="empty-icon">'+SVG.rss+'</div><p>'+esc(t('rss_empty'))+'</p></div>';
      return;
    }
    const results = await Promise.all(feeds.map(async f => {
      try { const r = await apiGet('/rss?url='+encodeURIComponent(f.url)); return { f, items: ((r && r.items) || []).slice(0, maxItems) }; }
      catch { return null; }                                  // failed feed -> dropped
    }));
    if(S.activeTab !== RSS_TAB) return;
    _rssCache = { results: results.filter(Boolean), ts: Date.now() };
  }
  layoutRss(c, c.dataset.rssSort || 'date');
}

// ── Render tab content ──
function renderTabContent(tabId) {
  // Virtual "All Sections" tab
  if(tabId === ALL_TAB) { renderAllSections(); return; }
  if(tabId === RSS_TAB) { renderRss(); return; }
  const content = $('tab-content');
  const secs = S.sections[tabId]||[];
  const tabPerm = S.perms[tabId]||{};
  const tabEdit = tabPerm.can_edit||false;
  const tabDel  = tabPerm.can_delete||false;
  let html='', has=false;
  for(const sec of secs){
    const st = sec.section_type || 'links';
    // Only render 'links', 'search', 'tasks', 'translate', 'widget' types
    if(st !== 'links' && st !== 'search' && st !== 'tasks' && st !== 'translate' && st !== 'widget') continue;

    if(st === 'search') {
      if(has) html+='<div class="section-divider"></div>'; has=true;
      html += renderSearchSection(sec); continue;
    }

    if(st === 'tasks') {
      if(has) html+='<div class="section-divider"></div>'; has=true;
      html += renderTasksSection(sec); continue;
    }

    if(st === 'translate') {
      if(has) html+='<div class="section-divider"></div>'; has=true;
      html += renderTranslateSection(sec); continue;
    }

    if(st === 'widget') {
      if(has) html+='<div class="section-divider"></div>'; has=true;
      html += renderWidgetSection(sec); continue;
    }

    // links section
    const lnks=S.links[sec.id]||[];
    if(!lnks.length) continue;
    const sp = sec.sec_perms || sec.perms || null;
    const canEdit   = sp ? (sp.can_edit  ||false) : tabEdit;
    const canDel    = sp ? (sp.can_delete||false) : tabDel;
    if(has) html+='<div class="section-divider"></div>'; has=true;
    html+='<div class="section-block" data-sec-id="'+sec.id+'"><div class="section-header">'+
      sectionIconHtml(sec.icon)+
      '<span class="section-title">'+esc(sec.title)+'</span>'+
      '<button class="section-count" data-sec-id="'+sec.id+'" title="'+t('open_all_links')+'">'+lnks.length+'</button>'+
      (canEdit && sec.health_check !== false?'<button class="section-check" data-sec-id="'+sec.id+'" title="'+t('check_links')+'">'+SVG.refresh+'</button>':'')+
      '</div>'+
      lnks.map(l=>linkHtml({...l, sectionId:sec.id}, canEdit, canDel)).join('')+'</div>';
  }
  content.innerHTML = has ? html :
    '<div class="empty-tab"><div class="empty-icon">'+iconSvg('inbox')+'</div><p>'+t('no_links')+'</p></div>';
  bindLinks(content, tabId);
  wireSectionChecks(content);

  // Section count: open all links
  content.querySelectorAll('.section-count[data-sec-id]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      (S.links[parseInt(btn.dataset.secId)]||[]).forEach(l => chrome.tabs.create({url:l.url,active:false}));
    });
  });

  wireWidgets(content); // search, tasks, translate
}

// ── Tasks section ──
function renderTasksSection(sec) {
  return '<div class="section-block tasks-section-widget" data-sec-id="'+sec.id+'">'
    + '<div class="section-header">'
    + sectionIconHtml(sec.icon)
    + '<span class="section-title">'+esc(sec.title)+'</span>'
    + '</div>'
    + '<div class="tasks-body"><div class="tasks-loading"><span class="lp-spin">'+iconSvg('loader')+'</span></div></div>'
    + '</div>';
}

async function loadTasksInto(widget, secId) {
  const body = widget.querySelector('.tasks-body');
  // Check if user can edit (for add + toggle)
  const sec = Object.values(S.sections).flat().find(s => s.id === secId);
  const tabIdStr = Object.entries(S.sections).find(([,secs]) => secs.some(s=>s.id===secId))?.[0];
  const tabId = tabIdStr ? parseInt(tabIdStr) : null;
  const sp  = sec ? (sec.sec_perms || sec.perms || null) : null;
  const tp  = tabId ? (S.perms[tabId] || {}) : {};
  const canEdit = sp ? (sp.can_edit||false) : (tp.can_edit||false);

  try {
    const showDone = widget.dataset.showDone === '1';
    const tasks = await apiGet('/sections/'+secId+'/tasks' + (showDone ? '?show_done=true' : ''));
    const open   = tasks.filter(t => !t.done);
    const done   = tasks.filter(t =>  t.done);
    const PRIO = { high:SVG.prioHigh, medium:SVG.prioMedium, low:SVG.prioLow, none:'' };
    const PRIO_ORDER = ['none','low','medium','high'];

    const renderTask = task => {
      const prio = PRIO[task.priority] || '';
      const due  = task.due_date ? ' <span class="task-due">'+SVG.calendar+' '+task.due_date.slice(0,10)+'</span>' : '';
      let html = '<label class="task-item'+(task.done?' task-done':'')+'" data-id="'+task.id+'">'
        + '<input type="checkbox"'+(task.done?' checked':'')+'>'
        + '<span class="task-title">'+(prio?prio+' ':'')+esc(task.title)+due+'</span>';
      if(canEdit) html += '<button type="button" class="task-edit-btn" title="'+esc(t('task_edit'))+'">'+iconSvg('edit')+'</button>';
      html += '</label>';
      if(canEdit) {
        const popts = PRIO_ORDER.map(pr => '<option value="'+pr+'"'+((task.priority||'none')===pr?' selected':'')+'>'
          + esc(t('prio_'+pr)) + '</option>').join('');
        html += '<div class="task-editor" data-id="'+task.id+'" style="display:none">'
          + '<select class="task-prio">'+popts+'</select>'
          + '<input type="date" class="task-date" value="'+(task.due_date?esc(task.due_date.slice(0,10)):'')+'">'
          + '<button type="button" class="task-save btn btn-primary">'+iconSvg('check')+'<span>'+esc(t('task_save'))+'</span></button>'
          + '</div>';
      }
      return html;
    };

    body.innerHTML = open.map(renderTask).join('')
      + (done.length ? '<div class="task-done-divider">'+iconSvg('check')+' '+done.length+'</div>'
          + done.map(renderTask).join('') : '')
      + (canEdit ? '<div class="task-add-row"><input class="task-add-input" placeholder="'
          + t('task_add_placeholder') + '" type="text"><button class="task-add-btn">+</button></div>' : '')
      + '<button type="button" class="task-toggle-done btn btn-ghost btn-sm">'
          + esc(t(showDone ? 'tasks_hide_done' : 'tasks_show_done')) + '</button>';

    // Show/hide completed tasks — fetched from the server only on demand (show_done param)
    body.querySelector('.task-toggle-done')?.addEventListener('click', () => {
      widget.dataset.showDone = showDone ? '' : '1';
      loadTasksInto(widget, secId);
    });

    // Toggle done — dedicated /toggle endpoint needs only read permission, so any viewer can check tasks off
    body.querySelectorAll('.task-item input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', async () => {
        const id = parseInt(cb.closest('.task-item').dataset.id);
        try { await apiFetch('PUT', '/tasks/'+id+'/toggle'); }
        catch { cb.checked = !cb.checked; return; }
        loadTasksInto(widget, secId);
      });
    });

    // Add task
    if(canEdit) {
      // Toggle inline priority/due editor (stop the label from toggling the checkbox)
      body.querySelectorAll('.task-edit-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          const id = btn.closest('.task-item').dataset.id;
          const ed = body.querySelector('.task-editor[data-id="'+id+'"]');
          if(ed) ed.style.display = ed.style.display === 'none' ? 'flex' : 'none';
        });
      });
      // Save priority/due
      body.querySelectorAll('.task-editor').forEach(ed => {
        const save = ed.querySelector('.task-save');
        save.addEventListener('click', async () => {
          const id   = parseInt(ed.dataset.id);
          const prio = ed.querySelector('.task-prio').value;
          const date = ed.querySelector('.task-date').value;
          save.disabled = true;
          try {
            await apiFetch('PUT', '/tasks/'+id, { priority: prio, due_date: date || null });
            loadTasksInto(widget, secId);
          } catch { save.disabled = false; }
        });
      });

      const addInput = body.querySelector('.task-add-input');
      const addBtn   = body.querySelector('.task-add-btn');
      const doAdd = async () => {
        const title = addInput.value.trim();
        if(!title) { addInput.focus(); return; }
        try {
          await apiPost('/sections/'+secId+'/tasks', {title, priority:'none', sort_order:0});
          addInput.value = '';
          loadTasksInto(widget, secId);
        } catch {}
      };
      addBtn.addEventListener('click', doAdd);
      addInput.addEventListener('keydown', e => { if(e.key==='Enter') doAdd(); });
    }
  } catch {
    body.innerHTML = '<div class="tasks-error">'+iconSvg('warning')+'</div>';
  }
}

// ── Translate section ──
// ── Widget section (weather / favorites / tags / status / calendar) ──
function widgetCfg(sec) {
  const c = (sec.content || '').trim();
  if(c[0] === '{' || c[0] === '[') { try { const d = JSON.parse(c); if(d && d.widget) return d; } catch {} }
  return { widget:'status', services:sec.content||'' };
}
// Weather glyphs as SVG (extension-local; keeps icons.js identical to the portal set).
const _wx = (p) => '<svg class="lpi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>';
const WX = {
  sun:    _wx('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'),
  partly: _wx('<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>'),
  cloud:  _wx('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'),
  fog:    _wx('<path d="M16 17H7"/><path d="M17 21H9"/><path d="M17.5 13H9a4.5 4.5 0 1 1 1.42-8.78A6 6 0 0 1 19.5 9.5"/>'),
  drizzle:_wx('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M8 19v1"/><path d="M8 14v1"/><path d="M16 19v1"/><path d="M16 14v1"/><path d="M12 21v1"/><path d="M12 16v1"/>'),
  rain:   _wx('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>'),
  snow:   _wx('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M8 15h.01"/><path d="M8 19h.01"/><path d="M12 17h.01"/><path d="M12 21h.01"/><path d="M16 15h.01"/><path d="M16 19h.01"/>'),
  thunder:_wx('<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/>'),
  thermo: _wx('<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>'),
};
const WMO_ICON = {
  0:WX.sun, 1:WX.sun, 2:WX.partly, 3:WX.cloud,
  45:WX.fog, 48:WX.fog,
  51:WX.drizzle, 53:WX.drizzle, 55:WX.drizzle, 56:WX.drizzle, 57:WX.drizzle,
  61:WX.rain, 63:WX.rain, 65:WX.rain, 66:WX.rain, 67:WX.rain,
  71:WX.snow, 73:WX.snow, 75:WX.snow, 77:WX.snow,
  80:WX.rain, 81:WX.rain, 82:WX.rain,
  85:WX.snow, 86:WX.snow,
  95:WX.thunder, 96:WX.thunder, 99:WX.thunder
};
const WEEKDAY = ['So','Mo','Di','Mi','Do','Fr','Sa'];

function renderWidgetSection(sec) {
  const cfg = widgetCfg(sec);
  return '<div class="section-block widget-section-widget" data-sec-id="'+sec.id+'" data-widget="'+esc(cfg.widget||'')+'">'
    + '<div class="section-header">'+sectionIconHtml(sec.icon)
    + '<span class="section-title">'+esc(sec.title)+'</span></div>'
    + '<div class="widget-body"><div class="tasks-loading"><span class="lp-spin">'+iconSvg('loader')+'</span></div></div>'
    + '</div>';
}

async function loadWidgetInto(widget, secId, kind) {
  const body = widget.querySelector('.widget-body');
  const fail = () => { body.innerHTML = '<div class="tasks-error">'+iconSvg('warning')+' '+esc(t('widget_error'))+'</div>'; };
  try {
    if(kind === 'weather') {
      const w = await apiGet('/sections/'+secId+'/weather');
      if(!w || w.error) { body.innerHTML = '<div class="widget-empty">'+esc(t('widget_empty'))+'</div>'; return; }
      const cur = w.current || {};
      const icon = WMO_ICON[cur.code] || WX.thermo;
      let html = '<div class="wx-current"><span class="wx-icon">'+icon+'</span>'
        + '<span class="wx-temp">'+(cur.temp!=null?Math.round(cur.temp)+'°':'–')+'</span>'
        + '<span class="wx-meta"><span class="wx-place">'+esc(w.place||'')+'</span>'
        + '<span class="wx-label">'+esc(cur.label||'')+'</span></span></div>';
      if(cur.wind!=null) html += '<div class="wx-wind">'+esc(t('widget_wind'))+': '+Math.round(cur.wind)+' km/h</div>';
      if(Array.isArray(w.days) && w.days.length) {
        html += '<div class="wx-days">' + w.days.map((d,i) => {
          const dt = new Date(d.date+'T00:00:00');
          const lbl = i===0 ? t('widget_today') : (isNaN(dt) ? esc(d.date) : WEEKDAY[dt.getDay()]);
          return '<div class="wx-day"><span class="wx-day-name">'+esc(lbl)+'</span>'
            + '<span class="wx-day-icon">'+(WMO_ICON[d.code]||'')+'</span>'
            + '<span class="wx-day-temp">'+(d.max!=null?Math.round(d.max)+'°':'')
            + ' <em>'+(d.min!=null?Math.round(d.min)+'°':'')+'</em></span></div>';
        }).join('') + '</div>';
      }
      body.innerHTML = html;
    } else if(kind === 'favorites' || kind === 'tags') {
      const path = kind === 'favorites' ? '/favorites' : '/taglinks';
      const r = await apiGet('/sections/'+secId+'/'+path.replace(/^\//,''));
      const links = (r && r.links) || [];
      if(!links.length) { body.innerHTML = '<div class="widget-empty">'+esc(t('widget_empty'))+'</div>'; return; }
      body.innerHTML = links.map(l => '<a class="link-item widget-link" href="#" data-url="'+esc(l.url)+'" data-open="'+esc(l.open_mode||'blank')+'">'
        + favicon({url:l.url, logo_url:l.logo_url, logo_icon:l.logo_icon})
        + '<div class="link-info"><div class="link-title">'+esc(l.title||l.url)+'</div></div></a>').join('');
      resolveFavicons(body);
      body.querySelectorAll('.widget-link').forEach(a =>
        a.addEventListener('click', e => { e.preventDefault(); openLink(a.dataset.url, a.dataset.open); }));
    } else if(kind === 'status') {
      const r = await apiGet('/sections/'+secId+'/status');
      const svcs = (r && r.services) || [];
      if(!svcs.length) { body.innerHTML = '<div class="widget-empty">'+esc(t('widget_empty'))+'</div>'; return; }
      body.innerHTML = svcs.map(s => '<div class="status-row"><span class="status-dot status-'+esc(s.status||'down')+'"></span>'
        + '<span class="status-name">'+esc(s.name||s.url||'')+'</span>'
        + '<span class="status-latency">'+(s.latency_ms!=null?s.latency_ms+' ms':'')+'</span></div>').join('');
    } else if(kind === 'calendar') {
      const r = await apiGet('/sections/'+secId+'/calendar');
      const evs = (r && r.events) || [];
      if(!evs.length) { body.innerHTML = '<div class="widget-empty">'+esc(t('widget_empty'))+'</div>'; return; }
      body.innerHTML = evs.map(ev => {
        const dt = new Date(ev.start);
        const when = isNaN(dt) ? esc((ev.start||'').slice(0,10))
          : dt.toLocaleDateString() + (ev.allday ? '' : ' ' + dt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));
        return '<div class="cal-row"><span class="cal-when">'+when+'</span>'
          + '<span class="cal-summary">'+esc(ev.summary||'')+'</span></div>';
      }).join('');
    } else {
      body.innerHTML = '<div class="widget-empty">'+esc(t('widget_empty'))+'</div>';
    }
  } catch { fail(); }
}

function renderTranslateSection(sec) {
  const LANGS = [
    ['auto','🔄 Auto'],['de','🇩🇪 Deutsch'],['en','🇬🇧 English'],['fr','🇫🇷 Français'],
    ['es','🇪🇸 Español'],['it','🇮🇹 Italiano'],['pt','🇵🇹 Português'],['nl','🇳🇱 Nederlands'],
    ['pl','🇵🇱 Polski'],['ru','🇷🇺 Русский'],['zh','🇨🇳 中文'],['ja','🇯🇵 日本語'],
    ['ko','🇰🇷 한국어'],['ar','🇸🇦 العربية'],['tr','🇹🇷 Türkçe'],['sv','🇸🇪 Svenska'],
  ];
  const optsNoAuto = LANGS.filter(([v])=>v!=='auto');
  const opts   = optsNoAuto.map(([v,l]) => '<option value="'+v+'"'+(v==='de'?' selected':'')+'>'+l+'</option>').join('');
  const enOpts = optsNoAuto.map(([v,l]) => '<option value="'+v+'"'+(v==='en'?' selected':'')+'>'+l+'</option>').join('');
  return '<div class="section-block translate-section-widget" data-sec-id="'+sec.id+'">'
    + '<div class="section-header">'
    + sectionIconHtml(sec.icon)
    + '<span class="section-title">'+esc(sec.title)+'</span>'
    + '</div>'
    + '<div class="translate-body">'
    + '<div class="translate-controls">'
    + '<select class="tr-from input-sel">'+opts+'</select>'
    + '<button class="tr-swap" title="Tauschen">'+iconSvg('swap')+'</button>'
    + '<select class="tr-to input-sel">'+enOpts+'</select>'
    + '<button class="tr-go btn btn-primary">'+iconSvg('globe')+'</button>'
    + '</div>'
    + '<textarea class="tr-input" placeholder="'+t('tr_input_placeholder')+'" rows="3"></textarea>'
    + '<div class="tr-result" style="display:none"></div>'
    + '</div></div>';
}

function wireTranslateWidget(widget) {
  const fromSel = widget.querySelector('.tr-from');
  const toSel   = widget.querySelector('.tr-to');
  const input   = widget.querySelector('.tr-input');
  const goBtn   = widget.querySelector('.tr-go');
  const swapBtn = widget.querySelector('.tr-swap');
  const result  = widget.querySelector('.tr-result');

  const doTranslate = async () => {
    const text = input.value.trim();
    if(!text) { input.focus(); return; }
    if(result){ result.style.display=''; result.innerHTML = '<span class="tr-status">'+spin()+' '+esc(t('tr_translating'))+'</span>'; }
    goBtn.disabled = true;
    try {
      const r = await apiFetch('POST', '/translate', { text, from_lang: fromSel.value, to_lang: toSel.value });
      if(r && r.translated){
        const det = String(r.detected || '').slice(0,2).toLowerCase();
        const detOpt = (det && det !== fromSel.value) ? fromSel.querySelector('option[value="'+det+'"]') : null;
        const detLabel = detOpt ? detOpt.textContent : '';
        result.innerHTML = '<div class="tr-output">'+esc(r.translated)+'</div>'
          + '<button class="tr-copy btn btn-ghost btn-sm" title="'+esc(t('tr_copy'))+'">'+iconSvg('copy')+'</button>'
          + (detLabel ? '<button class="tr-detected btn btn-ghost btn-sm" data-lang="'+det+'">'+esc(t('tr_detected').replace('{lang}', detLabel))+'</button>' : '');
        result.querySelector('.tr-copy')?.addEventListener('click', ev => {
          try { navigator.clipboard && navigator.clipboard.writeText(r.translated); } catch {}
          const b = ev.currentTarget, old = b.innerHTML; b.textContent = '✓';
          setTimeout(() => { b.innerHTML = old; }, 1200);
        });
        result.querySelector('.tr-detected')?.addEventListener('click', () => { fromSel.value = det; doTranslate(); });
      } else {
        result.innerHTML = '<div class="tr-error">'+esc((r && r.error) || t('tr_error'))+'</div>';
      }
    } catch(e) {
      result.innerHTML = '<div class="tr-error">'+esc(t('tr_error'))+'</div>';
    } finally { goBtn.disabled = false; }
  };

  swapBtn.addEventListener('click', () => {
    const fromVal = fromSel.value, toVal = toSel.value;
    fromSel.value = toVal; toSel.value = fromVal;
  });

  goBtn.addEventListener('click', doTranslate);
  input.addEventListener('keydown', e => {
    if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doTranslate();
  });
}

// ── Link HTML ──
function linkHtml(link, canEdit, canDel, hi='') {
  const title = hi?hilite(link.title||'',hi):esc(link.title||'');
  const desc  = hi?hilite(link.description||'',hi):esc(link.description||'');
  const tags  = (link.tags && link.tags.length)
    ? '<div class="link-tags">'+link.tags.map(tg=>'<span class="link-tag">'+esc(tg)+'</span>').join('')+'</div>' : '';
  return '<a class="link-item" data-id="'+link.id+'" data-sec="'+link.sectionId+'" data-url="'+esc(link.url)+'" data-open="'+esc(link.open_mode||'blank')+'" href="#">'+
    (canEdit?'<span class="drag-handle">'+SVG.drag+'</span>':'')+
    favicon(link)+
    '<div class="link-info"><div class="link-title">'+healthDot(link)+title+'</div>'+
    (link.description?'<div class="link-desc">'+desc+'</div>':'')+
    tags+
    '</div><div class="link-actions">'+
    '<button class="link-action-btn fav-btn'+(link.is_favorite?' is-fav':'')+'" data-id="'+link.id+'" title="'+t('favorite')+'" aria-pressed="'+(link.is_favorite?'true':'false')+'">'+(link.is_favorite?SVG.star:SVG.starOff)+'</button>'+
    (canEdit?'<button class="link-action-btn edit-btn" data-id="'+link.id+'">'+SVG.edit+'</button>':'')+
    (canDel?'<button class="link-action-btn del" data-id="'+link.id+'">'+SVG.del+'</button>':'')+
    '<button class="link-action-btn open-btn">'+SVG.open+'</button>'+
    '</div></a>';
}

// Open a portal link honoring its open_mode: 'self' navigates the current active tab,
// anything else opens a new tab.
function openLink(url, mode){
  if(!url) return;
  if(mode === 'self'){ try { chrome.tabs.update({ url }); return; } catch {} }
  chrome.tabs.create({ url, active:true });
}

// Health status dot (data already present on the link: health_status/health_code).
function healthDot(link){
  if(link._secHealth === false || link.health_check === false) return '';  // health-check disabled (section or link)
  const st = link.health_status;
  if(!st) return '';
  const color = st==='ok' ? '#3fb950' : st==='down' ? '#d29922' : st==='error' ? '#f85149' : 'var(--text3)';
  const code = link.health_code ? (' ('+link.health_code+')') : '';
  return '<span class="link-health" title="'+esc(st+code)+'" style="display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:middle;background:'+color+'"></span>';
}

// Authenticated blob fetch (for the portal favicon proxy, which requires auth).
const _favCache = new Map();
async function apiBlob(path){
  const res = await fetch(apiUrl(path), { credentials:'omit', headers:{ 'Authorization':mkAuth(S.username,S.token) } });
  if(!res.ok) throw new Error('HTTP '+res.status);
  return res.blob();
}
// Resolve favicons via the portal proxy (privacy: the browser never calls Google directly).
// On failure the initial fallback (title initials) stays visible.
async function resolveFavicons(root){
  const imgs = [...(root||document).querySelectorAll('img.link-favicon[data-fav]')];
  if(!imgs.length) return;
  // Group by hostname and resolve each unique domain once, all in parallel
  // (was a sequential await-loop = one round-trip per icon).
  const byDom = new Map();
  for(const img of imgs){
    const url = img.getAttribute('data-fav');
    img.removeAttribute('data-fav');
    let dom; try { dom = new URL(url).hostname; } catch { continue; }
    let grp = byDom.get(dom);
    if(!grp){ grp = { url, imgs: [] }; byDom.set(dom, grp); }
    grp.imgs.push(img);
  }
  await Promise.all([...byDom.entries()].map(async ([dom, grp]) => {
    try {
      let obj = _favCache.get(dom);
      if(!obj){ obj = URL.createObjectURL(await apiBlob('/favicon?url='+encodeURIComponent(grp.url))); _favCache.set(dom, obj); }
      for(const img of grp.imgs){
        img.src = obj; img.style.display = '';
        const fb = img.nextElementSibling; if(fb) fb.style.display = 'none';
      }
    } catch { /* keep initials */ }
  }));
}

function favicon(link) {
  const base=S.baseUrl.replace(/\/$/,''), logo=link.logo_url||link.logo||'';
  if(logo){
    if(logo.startsWith('http')||logo.startsWith('/')) {
      const src=logo.startsWith('/')?base+logo:logo;
      return '<img class="link-favicon" src="'+esc(src)+'" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'"><div class="link-favicon-fallback" style="display:none">'+ini(link.title)+'</div>';
    }
    return '<div class="link-favicon-fallback" style="background:var(--bg3);font-size:14px">'+logo+'</div>';
  }
  try{
    new URL(link.url); // validate
    // No stored logo: resolve via portal proxy after render (see resolveFavicons); show initials until then.
    return '<img class="link-favicon" data-fav="'+esc(link.url)+'" alt="" style="display:none" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'"><div class="link-favicon-fallback">'+ini(link.title)+'</div>';
  } catch { return '<div class="link-favicon-fallback">'+ini(link.title)+'</div>'; }
}

function bindLinks(container, tabId) {
  container.querySelectorAll('.link-item').forEach(el => {
    el.addEventListener('click', e => {
      if(e.target.closest('.link-action-btn')||e.target.closest('.drag-handle')) return;
      e.preventDefault(); openLink(el.dataset.url, el.dataset.open);
    });
    el.querySelector('.open-btn')?.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); openLink(el.dataset.url, el.dataset.open);
    });
    el.querySelector('.edit-btn')?.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const id=parseInt(el.dataset.id);
      const link=S.allLinks.find(l=>l.id===id);
      if(link) openLinkDialog(link, link.tabId ?? tabId);
    });
    el.querySelector('.del')?.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const id=parseInt(el.dataset.id);
      const link=S.allLinks.find(l=>l.id===id);
      deleteLink(id, link?.tabId ?? tabId);
    });
    el.querySelector('.fav-btn')?.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      toggleFavorite(parseInt(el.dataset.id), parseInt(el.dataset.sec), e.currentTarget);
    });
  });
  resolveFavicons(container);
}

// A: toggle a link's favorite state (needs only read permission server-side).
async function toggleFavorite(id, sid, btn){
  const inLinks = (S.links && S.links[sid]) ? S.links[sid].find(l=>l.id===id) : null;
  const inAll   = Array.isArray(S.allLinks) ? S.allLinks.find(l=>l.id===id) : null;
  const want = !((inLinks||inAll||{}).is_favorite);
  if(btn) btn.disabled = true;
  try {
    await apiFetch(want?'POST':'DELETE', '/links/'+id+'/favorite');
    if(inLinks) inLinks.is_favorite = want;
    if(inAll)   inAll.is_favorite   = want;
    if(btn){
      btn.classList.toggle('is-fav', want);
      btn.setAttribute('aria-pressed', want?'true':'false');
      btn.innerHTML = want?SVG.star:SVG.starOff;
    }
  } catch {}
  finally { if(btn) btn.disabled = false; }
}

// D: trigger a server-side health check for a section (needs edit permission),
// then refresh that section's links and re-render the status dots.
async function runHealthCheck(sid, btn){
  if(btn){ btn.disabled = true; btn.innerHTML = spin(); }
  try {
    await apiPost('/sections/'+sid+'/links/check');
    const fresh = await apiGet('/sections/'+sid+'/links');
    const map = new Map((fresh||[]).map(l=>[l.id,l]));
    const apply = l => { const f=map.get(l.id); if(f){ l.health_status=f.health_status; l.health_code=f.health_code; l.health_checked_at=f.health_checked_at; } return l; };
    if(S.links && S.links[sid]) S.links[sid] = S.links[sid].map(apply);
    if(Array.isArray(S.allLinks)) S.allLinks.forEach(l=>{ if(map.has(l.id)) apply(l); });
    renderAll();
  } catch {
    if(btn){ btn.disabled = false; btn.innerHTML = SVG.refresh; }
  }
}

// Wire the per-section "check links" buttons within a rendered container.
function wireSectionChecks(container){
  container.querySelectorAll('.section-check[data-sec-id]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      runHealthCheck(parseInt(btn.dataset.secId), btn);
    });
  });
}

// ── Drag & Drop — pointer events with capture (works in Extension popups) ──
// ── Global DnD — one-time init, avoids listener buildup on tab switches ──
let _dnd = null;

function initGlobalDnD() {
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('.drag-handle')) return;
    const item = e.target.closest('.link-item');
    if (!item || !item.closest('#tab-content')) return;
    e.preventDefault();

    const secId = parseInt(item.dataset.sec);
    if (isNaN(secId)) { console.warn('[LP] drag: NaN secId, dataset.sec=', item.dataset.sec); return; }
    const secBlock = item.closest('.section-block');
    if (!secBlock) return;

    const line = document.createElement('div');
    line.className = 'drop-line';
    item.after(line);
    item.classList.add('dragging');
    _dnd = { item, secId, secBlock, line, dropTarget: null, dropBefore: true };
  }, { passive: false });

  document.addEventListener('pointermove', e => {
    if (!_dnd) return;
    e.preventDefault();
    _dnd.item.style.visibility = 'hidden';
    const under = document.elementFromPoint(e.clientX, e.clientY);
    _dnd.item.style.visibility = '';
    if (!under) return;
    const target = under.closest('.link-item');
    if (!target || target === _dnd.item) return;
    if (parseInt(target.dataset.sec) !== _dnd.secId) return;
    const rect = target.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    _dnd.dropTarget = target;
    _dnd.dropBefore = before;
    _dnd.line.style.display = 'block';
    if (before) target.before(_dnd.line);
    else target.after(_dnd.line);
  }, { passive: false });

  const finishDnD = async () => {
    if (!_dnd) return;
    const { item, secId, secBlock, line, dropTarget, dropBefore } = _dnd;
    _dnd = null;
    item.classList.remove('dragging');
    item.style.visibility = '';
    line.remove();
    if (!dropTarget) return;
    if (dropBefore) dropTarget.before(item);
    else dropTarget.after(item);
    const newOrder = [...secBlock.querySelectorAll('.link-item')]
      .map(i => parseInt(i.dataset.id)).filter(id => !isNaN(id));
    S.links[secId] = newOrder.map(id => (S.links[secId]||[]).find(l => l.id===id)).filter(Boolean);
    try {
      await apiPut('/sections/'+secId+'/links/sort', { ids: newOrder });
      const { cache } = await chrome.storage.local.get(['cache']);
      if (cache) { cache.links[secId] = S.links[secId]; await chrome.storage.local.set({ cache }); }
    } catch(err) { console.warn('[LP] sort:', err.message); }
  };
  document.addEventListener('pointerup', finishDnD);
  document.addEventListener('pointercancel', () => {
    if (!_dnd) return;
    _dnd.item.classList.remove('dragging');
    _dnd.item.style.visibility = '';
    _dnd.line.remove();
    _dnd = null;
  });
}

// ── Search ──
// ── Search keyboard navigation ──
let searchKbdIdx = -1;
function kbdSelectResult(idx) {
  const items = $('results-list')?.querySelectorAll('.link-item') || [];
  if(!items.length) return;
  // Clamp
  if(idx < 0) idx = items.length - 1;
  if(idx >= items.length) idx = 0;
  // Remove old selection
  items.forEach(el => el.classList.remove('kbd-selected'));
  items[idx].classList.add('kbd-selected');
  items[idx].scrollIntoView({block:'nearest'});
  searchKbdIdx = idx;
}

function performSearch(q) {
  q=q.trim().toLowerCase();
  const sr=$('search-results'),tc=$('tab-content'),tb=$('tabs-bar');
  if(!q){_srvSearchSeq++;clearTimeout(_srvSearchTimer);sr.style.display='none';tc.style.display='';tb.style.display='';return;}
  tc.style.display='none';tb.style.display='none';sr.style.display='';
  searchKbdIdx = -1; // reset keyboard selection on new query
  // "#tag" → match links carrying that exact tag; otherwise full-text (incl. tags)
  let m;
  if(q[0] === '#' && q.length > 1) {
    const tag = q.slice(1).trim();
    m = S.allLinks.filter(l => (l._tags||[]).includes(tag));
  } else {
    m = S.allLinks.filter(l => l._search.includes(q));
  }
  const cnt=m.length;
  $('results-header').textContent=cnt+' '+(cnt===1?t('results_suffix_one'):t('results_suffix_many'));
  const list=$('results-list');
  if(!cnt){list.innerHTML='<div class="no-results"><div class="no-results-icon">'+iconSvg('search')+'</div><span>'+t('no_results_prefix')+' "'+esc(q)+'"</span></div>'; scheduleServerSearch(q, new Set()); return;}
  list.innerHTML = m.map(link => {
    // Use section-level perms (sec_perms) with tab-level fallback
    const sec = (S.sections[link.tabId]||[]).find(s=>s.id===link.sectionId);
    const sp = sec ? (sec.sec_perms || sec.perms || null) : null;
    const tp = S.perms[link.tabId]||{};
    const canEdit = sp ? (sp.can_edit  ||false) : (tp.can_edit  ||false);
    const canDel  = sp ? (sp.can_delete||false) : (tp.can_delete||false);
    return '<a class="link-item" data-id="'+link.id+'" data-sec="'+link.sectionId+'" data-url="'+esc(link.url)+'" href="#">'+
      favicon(link)+
      '<div class="link-info"><div class="link-title">'+hilite(link.title||'',q)+'</div>'+
      (link.description?'<div class="link-desc">'+hilite(link.description,q)+'</div>':'')+
      '<div class="result-breadcrumb"><span>'+esc(link.tabTitle)+'</span> › '+esc(link.sectionTitle)+'</div>'+
      '</div><div class="link-actions">'+
      (canEdit?'<button class="link-action-btn edit-btn" data-id="'+link.id+'">'+SVG.edit+'</button>':'')+
      (canDel?'<button class="link-action-btn del" data-id="'+link.id+'">'+SVG.del+'</button>':'')+
      '<button class="link-action-btn open-btn">'+SVG.open+'</button>'+
      '</div></a>';
  }).join('');
  list.querySelectorAll('.link-item').forEach(el=>{
    el.addEventListener('click',e=>{if(e.target.closest('.link-action-btn'))return;e.preventDefault();chrome.tabs.create({url:el.dataset.url});});
    el.querySelector('.open-btn')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();chrome.tabs.create({url:el.dataset.url});});
    const id=parseInt(el.dataset.id),link=S.allLinks.find(l=>l.id===id);
    el.querySelector('.edit-btn')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(link)openLinkDialog(link,link.tabId);});
    el.querySelector('.del')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(link)deleteLink(id,link.tabId);});
  });
  scheduleServerSearch(q, new Set(m.map(l=>l.id)));
}

// H: server-side global search, appended below the offline results (debounced, de-duplicated).
let _srvSearchSeq = 0, _srvSearchTimer = null;
function scheduleServerSearch(q, shownIds){
  clearTimeout(_srvSearchTimer);
  if(!q || q[0] === '#' || q.length < 2) return;
  if(!(S.baseUrl && S.token && S.username)) return;
  const seq = ++_srvSearchSeq;
  _srvSearchTimer = setTimeout(async () => {
    let res;
    try { res = await apiGet('/search?q='+encodeURIComponent(q)); } catch { return; }
    if(seq !== _srvSearchSeq) return;
    const cur = ($('search-input').value || '').trim().toLowerCase();
    if(cur !== q) return;
    const extra = (res || []).filter(r => !(r.type === 'link' && shownIds.has(r.id)));
    const list = $('results-list');
    if(!extra.length || !list) return;
    const base = (S.baseUrl || '').replace(/\/$/, '');
    const rows = extra.map(r => {
      const isLink = r.type === 'link' && r.url;
      const url = isLink ? r.url : base;
      const crumbTail = r.type === 'section' ? '' : (' › ' + esc(r.title || ''));
      return '<a class="link-item srv-result" data-url="'+esc(url)+'" data-open="blank" href="#">'
        + favicon({ url: r.url || '', logo_url: '', title: r.title || r.match || '' })
        + '<div class="link-info"><div class="link-title">'+hilite(r.title || r.match || '', q)+'</div>'
        + '<div class="result-breadcrumb"><span>'+esc(r.tab_title || '')+'</span>'+crumbTail+'</div></div>'
        + '<div class="link-actions"><button class="link-action-btn open-btn">'+SVG.open+'</button></div></a>';
    }).join('');
    const group = document.createElement('div');
    group.className = 'search-server-group';
    group.innerHTML = '<div class="results-subhead">'+esc(t('search_portal_more'))+'</div>'+rows;
    list.appendChild(group);
    group.querySelectorAll('.srv-result').forEach(el => {
      el.addEventListener('click', e => { if(e.target.closest('.link-action-btn')) return; e.preventDefault(); openLink(el.dataset.url, el.dataset.open); });
      el.querySelector('.open-btn')?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openLink(el.dataset.url, el.dataset.open); });
    });
    resolveFavicons(group);
  }, 350);
}

function clearSearch(){
  _srvSearchSeq++; clearTimeout(_srvSearchTimer);
  $('search-input').value='';
  $('search-clear').style.display='none';
  // Restore both tab-content and tabs-bar directly (don't call performSearch to avoid re-render)
  $('search-results').style.display='none';
  $('tab-content').style.display='';
  $('tabs-bar').style.display='';
}
function hilite(t2,q){return esc(t2).replace(new RegExp('('+escRx(q)+')','gi'),'<mark>$1</mark>');}

// ══════════════════════════════════════════
// LINK CRUD
// ══════════════════════════════════════════
let _dlgEditLink = null;   // link being edited (preserves open_mode/sort_order/health_check on save)
function openLinkDialog(link, tabId) {
  _dlgEditLink = link || null;
  const secSel=$('dlg-sec'); secSel.innerHTML='';
  let hasOptions=false;
  for(const tab of S.tabs){
    const tp = S.perms[tab.id]||{};
    for(const sec of (S.sections[tab.id]||[])){
      if(sec.section_type && sec.section_type !== 'links') continue;
      const sp = sec.sec_perms || sec.perms || null;
      const secCreate = sp ? (sp.can_create||sp.can_edit||false) : (tp.can_edit||false);
      if(!secCreate) continue;
      const opt=document.createElement('option');
      opt.value=sec.id; opt.textContent=tab.title+' › '+sec.title;
      if(link&&link.sectionId===sec.id) opt.selected=true;
      else if(!link&&tab.id===tabId&&!hasOptions) opt.selected=true;
      secSel.appendChild(opt); hasOptions=true;
    }
  }
  if(!hasOptions){alert(t('no_edit_sections'));return;}
  $('dlg-title').textContent = link?t('dlg_edit_title'):t('dlg_add_title');
  $('dlg-link-id').value  = link?link.id:'';
  $('dlg-url').value       = link?(link.url||''):'';
  $('dlg-title-inp').value = link?(link.title||''):'';
  $('dlg-desc').value      = link?(link.description||''):'';
  $('dlg-logo').value      = link?(link.logo_url||link.logo||''):'';
  $('dlg-err').style.display='none';
  $('dlg-sec-field').style.display = link?'none':'';
  $('dlg-backdrop').style.display='flex';
  $('dlg-url').focus();
  // B: when adding, prefill with the current page (activeTab; fill only while fields are still empty)
  if(!link && typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query){
    chrome.tabs.query({active:true, currentWindow:true}, tabs => {
      const tb = tabs && tabs[0];
      if(!tb || !tb.url || !/^https?:/i.test(tb.url)) return;   // skip chrome://, about:, file:
      const u=$('dlg-url'), ti=$('dlg-title-inp');
      if(u && !u.value.trim()){ u.value = tb.url; if(ti && !ti.value.trim() && tb.title) ti.value = tb.title; ti && ti.focus(); }
    });
  }
}
function closeLinkDialog(){$('dlg-backdrop').style.display='none';}

async function saveLinkDialog() {
  const url  = $('dlg-url').value.trim();
  const title= $('dlg-title-inp').value.trim();
  const desc = $('dlg-desc').value.trim();
  const logo = $('dlg-logo').value.trim();
  const secId= parseInt($('dlg-sec').value);
  const linkId= parseInt($('dlg-link-id').value);
  const isEdit= !!linkId;
  if(!url){showDlgErr(t('err_url_required'));return;}
  if(!title){showDlgErr(t('err_title_required'));return;}
  $('dlg-save').disabled=true;
  try {
    const body={url,title,description:desc||null,logo_url:logo||null};
    if(isEdit){
      // Preserve fields the dialog doesn't expose — otherwise LinkIn defaults would
      // reset open_mode to "blank", sort_order to 0 and health_check to true on every edit.
      const l=_dlgEditLink||{};
      body.open_mode   = l.open_mode || 'blank';
      body.sort_order  = Number.isFinite(l.sort_order) ? l.sort_order : 0;
      body.health_check= l.health_check !== false;
      body.logo_icon   = l.logo_icon || null;
      await apiPut('/links/'+linkId,body);
    }
    else await apiPost('/sections/'+secId+'/links',body);
    closeLinkDialog();
    applyData(await fetchFromApi(), S.activeTab, 'last'); // preserve active tab on CRUD
    renderAll();
  } catch(err){showDlgErr(err.message);}
  finally{$('dlg-save').disabled=false;}
}

async function deleteLink(linkId, tabId) {
  if(!confirm(t('confirm_delete_link'))) return;
  try {
    await apiDel('/links/'+linkId);
    applyData(await fetchFromApi(), S.activeTab, 'last'); // preserve active tab on CRUD
    renderAll();
  } catch(err){alert(err.message);}
}

function showDlgErr(msg){$('dlg-err').style.display='';$('dlg-err').textContent=msg;}

// ══════════════════════════════════════════
// SETTINGS (inline panel)
// ══════════════════════════════════════════
// "Settings view is open" flag — kept in SESSION storage so it is cleared on browser
// restart. This guarantees Settings is NEVER auto-opened on a fresh start (also not with
// "remember last tab"). Within one browser session it still re-opens across popup re-opens.
async function setSettingsOpen(v){
  try {
    if (chrome.storage.session) {
      if (v) await chrome.storage.session.set({ settingsOpen: true });
      else   await chrome.storage.session.remove(['settingsOpen']);
    }
  } catch {}
  try { await chrome.storage.local.remove(['settingsOpen']); } catch {} // never persist across restart
}
async function getSettingsOpen(){
  try { if (chrome.storage.session) { const r = await chrome.storage.session.get(['settingsOpen']); return !!r.settingsOpen; } } catch {}
  return false; // fail-safe: do not auto-open settings when session storage is unavailable
}

async function openSettings() {
  closeDropdown();
  // Mark settings as open (session-only) so it re-opens within the same browser session,
  // but never after a browser restart.
  await setSettingsOpen(true);

  const stored=await chrome.storage.sync.get(['baseUrl','token','username']);
  $('s-base-url').value  = stored.baseUrl||'';
  $('s-username').value  = stored.username||'';
  if(stored.token){
    S.tokenSaved=true; S.testPassed=true;
    S.lastTestedUrl=stored.baseUrl||''; S.lastTestedUser=stored.username||''; 
    $('s-api-token').value=''; $('s-api-token').placeholder=t('lbl_token_hint');
    $('s-api-token').readOnly=true; $('s-api-token').type='password';
    $('s-btn-edit-tok').style.display=''; $('s-btn-show-tok').style.display='none';
  } else {
    S.tokenSaved=false; S.testPassed=false;
    $('s-api-token').value=''; $('s-api-token').readOnly=false;
    $('s-api-token').placeholder='eyJhbGciOiJIUzI1NiIs…';
    $('s-btn-edit-tok').style.display='none'; $('s-btn-show-tok').style.display='';
  }
  $('s-lang').value=_lang;
  // Load start tab setting
  const { startTab } = await chrome.storage.local.get(['startTab']);
  if($('s-starttab')) $('s-starttab').value = startTab || 'last';
  // Load bookmark-sync toggle
  const { bmSync } = await chrome.storage.sync.get(['bmSync']);
  if($('s-bm-toggle')) $('s-bm-toggle').checked = !!bmSync;
  S.bmSync = !!bmSync;
  const { bmParent, bmWrap, bmFav, bmPrivate } = await chrome.storage.sync.get(['bmParent','bmWrap','bmFav','bmPrivate']);
  if($('s-bm-wrap')) $('s-bm-wrap').checked = (bmWrap !== false);  // default on
  if($('s-bm-fav'))  $('s-bm-fav').checked  = (bmFav === true);    // default off
  if($('s-bm-private')) $('s-bm-private').checked = (bmPrivate === true); // default off
  if($('s-bm-parent')) await loadBmFolders();
  updateSaveBtn(); loadCacheInfo();
  showScreen('settings');
  loadPortalInfo(); // I: portal version + features (non-blocking)
}

// I: show the portal version (and feature flags) in the settings version bar.
async function loadPortalInfo(){
  const el = $('s-portal-version'); if(!el) return;
  if(!(S.baseUrl && S.token && S.username)) { el.textContent = ''; return; }
  try {
    const v = await apiGet('/version');
    let txt = v?.version ? (t('portal_version')+': '+v.version) : '';
    try {
      const f = await apiGet('/features');
      const flags = [];
      if(f && f.api_enabled) flags.push('API');
      if(f && f.plugin_auto_config_enabled) flags.push('Auto-Config');
      if(flags.length) txt += ' · '+flags.join(', ');
    } catch {}
    el.textContent = txt;
  } catch { el.textContent = ''; }
}
async function closeSettings(){
  setSettingsOpen(false);
  if(S.baseUrl && S.token) {
    showScreen('main');
    // Refresh data — fixes empty view after first setup or credential change
    await loadData(true);
  } else {
    showScreen('setup');
  }
}

function updateSaveBtn(){
  const ok=S.testPassed&&($('s-base-url')?.value.trim())&&($('s-username')?.value.trim());
  if($('s-btn-save')) $('s-btn-save').disabled=!ok;
}

function watchSettingsFields(){
  let autoTestTimer = null;
  let autoSaveTimer = null;

  // Auto-save partial credentials so they survive popup close during setup
  function autoSavePartial() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      const url  = $('s-base-url').value.trim().replace(/\/$/,'');
      const user = $('s-username').value.trim();
      const tok  = S.tokenSaved ? null : $('s-api-token').value.trim();
      const patch = {};
      if(url)  patch.baseUrl  = url;
      if(user) patch.username = user;
      if(tok)  patch.token    = tok;
      if(Object.keys(patch).length) await chrome.storage.sync.set(patch);
    }, 800);
  }

  function maybeAutoTest() {
    const url   = $('s-base-url').value.trim();
    const user  = $('s-username').value.trim();
    const token = S.tokenSaved ? '(saved)' : $('s-api-token').value.trim();
    if(!url || !user || !token) return;
    if(!url.startsWith('https://')) return;
    clearTimeout(autoTestTimer);
    autoTestTimer = setTimeout(() => {
      if(!S.testPassed) testConnection();
    }, 600);
  }

  ['s-base-url','s-username'].forEach(id=>{
    $(id)?.addEventListener('input',()=>{
      if($('s-base-url').value.trim()!==S.lastTestedUrl||$('s-username').value.trim()!==S.lastTestedUser) S.testPassed=false;
      updateSaveBtn(); maybeAutoTest(); autoSavePartial();
    });
  });
  $('s-api-token')?.addEventListener('input',()=>{
    if(!S.tokenSaved){ S.testPassed=false; }
    updateSaveBtn(); maybeAutoTest(); autoSavePartial();
  });
}

async function testConnection(){
  const baseUrl=$('s-base-url').value.trim().replace(/\/$/,'');
  const username=$('s-username').value.trim();
  let token=S.tokenSaved?'':$('s-api-token').value.trim();
  const res=$('s-test-result');
  if(!baseUrl||!username){showSResult(res,'error',iconSvg('warning')+' '+t('err_fields'));return;}
  if(!baseUrl.startsWith('https://')){showSResult(res,'error',iconSvg('warning')+' '+t('err_https'));return;}
  if(S.tokenSaved&&!token){const st=await chrome.storage.sync.get(['token']);token=st.token||'';}
  if(!token){showSResult(res,'error',iconSvg('warning')+' '+t('err_fields'));return;}
  showSResult(res,'loading',spin()+t('test_loading')); $('s-btn-test').disabled=true;
  try{
    const r=await fetch(baseUrl+'/api/tabs',{headers:{'Authorization':mkAuth(username,token),'Cache-Control':'no-cache'},credentials:'omit'});
    if(r.status===403){S.testPassed=false;showSResult(res,'error',iconSvg('x')+' '+t('test_err_403'));}
    else if(r.status===401){S.testPassed=false;showSResult(res,'error',iconSvg('x')+' '+t('test_err_401'));}
    else if(r.ok){
      const tabs=await r.json().catch(()=>[]);
      S.testPassed=true; S.lastTestedUrl=baseUrl; S.lastTestedUser=username; 
      showSResult(res,'success',iconSvg('check')+' '+t('test_ok')+'<br><small>'+iconSvg('folder')+' '+tabs.length+' '+t('test_tabs')+'</small>');
    } else {S.testPassed=false;showSResult(res,'error',iconSvg('x')+' '+t('test_err_http')+' '+r.status);}
  }catch(err){S.testPassed=false;showSResult(res,'error',iconSvg('x')+' '+esc(err.message));}
  $('s-btn-test').disabled=false; updateSaveBtn();
}

async function saveSettings(){
  const baseUrl=$('s-base-url').value.trim().replace(/\/$/,'');
  const username=$('s-username').value.trim();
  if(!baseUrl||!username){showStatus(iconSvg('warning')+' '+t('err_fields'),'error');return;}
  if(!baseUrl.startsWith('https://')){showStatus(iconSvg('warning')+' '+t('err_https'),'error');return;}
  if(!S.testPassed){showStatus(iconSvg('warning')+' '+t('err_test_first'),'error');return;}
  let token=S.tokenSaved?'':$('s-api-token').value.trim();
  if(S.tokenSaved){const st=await chrome.storage.sync.get(['token']);token=st.token||'';}
  if(!token){showStatus(iconSvg('warning')+' No token','error');return;}
  await chrome.storage.sync.set({baseUrl,token,username});
  S.baseUrl=baseUrl; S.token=token; S.username=username;
  clear403(); // reset error count on fresh save
  S.tokenSaved=true;
  $('s-api-token').value=''; $('s-api-token').readOnly=true;
  $('s-api-token').placeholder=t('lbl_token_hint');
  $('s-btn-edit-tok').style.display=''; $('s-btn-show-tok').style.display='none';
  showStatus(iconSvg('check')+' '+t('save_ok'),'success'); updateSaveBtn();
  // Close settings and refresh after short delay so user sees the success message
  setTimeout(() => closeSettings(), 800);
}

async function resetSettings(){
  if(!confirm(t('confirm_reset'))) return;
  // Remove the managed bookmark folder + give back the optional permission before wiping settings
  try { await chrome.runtime.sendMessage({ action:'removeBookmarks' }); } catch {}
  try { if(chrome.permissions?.remove) await chrome.permissions.remove({ permissions:['bookmarks'] }); } catch {}
  await chrome.storage.sync.clear();
  // Preserve UI prefs (lang, theme, logo cache) — only clear session data
  await chrome.storage.local.remove(['cache','cacheTime','err403','logoutReason','lastActiveTab','bmRootId','bmHash','bmDirectIds']);
  if($('s-bm-toggle')) $('s-bm-toggle').checked=false;
  if($('s-bm-wrap')) $('s-bm-wrap').checked=true;
  if($('s-bm-fav')) $('s-bm-fav').checked=false;
  if($('s-bm-private')) $('s-bm-private').checked=false;
  S.bmSync=false;
  S.baseUrl='';S.token='';S.username='';S.tabs=[];S.activeTab=null;S.tokenSaved=false;S.testPassed=false;
  $('s-base-url').value='';$('s-username').value='';
  $('s-api-token').value='';$('s-api-token').readOnly=false;
  $('s-api-token').placeholder='eyJhbGciOiJIUzI1NiIs…';
  $('s-btn-edit-tok').style.display='none';$('s-btn-show-tok').style.display='';
  $('s-test-result').style.display='none';$('s-sync-result').style.display='none';
  $('portal-logo').style.display='none';$('default-icon').style.display='';
  $('portal-title').textContent='LinkPortal';
  loadCacheInfo(); updateSaveBtn();
  showStatus(iconSvg('check')+' '+t('reset_ok'),'success');
  setTimeout(()=>showScreen('setup'),1200);
}

function editToken(){
  S.tokenSaved=false; S.testPassed=false;
  $('s-api-token').value=''; $('s-api-token').readOnly=false;
  $('s-api-token').placeholder='eyJhbGciOiJIUzI1NiIs…'; $('s-api-token').type='password';
  $('s-btn-edit-tok').style.display='none'; $('s-btn-show-tok').style.display='';
  updateSaveBtn(); $('s-api-token').focus();
}

function toggleTokenVis(){
  if($('s-api-token').readOnly) return;
  const show=$('s-api-token').type==='password';
  $('s-api-token').type=show?'text':'password';
  $('s-eye').innerHTML=show
    ?'<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
    :'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
}

// ── Bookmark sync toggle (opt-in, requests the optional 'bookmarks' permission on enable) ──
// Populate the target-folder dropdown from the bookmark tree (only possible once the permission is granted).
async function loadBmFolders(){
  const sel = $('s-bm-parent'); if(!sel) return;
  const { bmParent } = await chrome.storage.sync.get(['bmParent']);
  const cur = bmParent || 'other';
  let granted = false;
  try { granted = await chrome.permissions.contains({ permissions:['bookmarks'] }); } catch {}
  if(!granted || !chrome.bookmarks){
    // Not granted yet → only the two top-level defaults are selectable
    sel.innerHTML = '<option value="other">'+esc(t('bm_loc_other'))+'</option>'
                  + '<option value="bar">'+esc(t('bm_loc_bar'))+'</option>';
    sel.value = (cur === 'bar') ? 'bar' : 'other';
    return;
  }
  let tree; try { tree = await chrome.bookmarks.getTree(); } catch { return; }
  const roots = (tree[0] && tree[0].children) || [];
  const opts = [];
  const walk = (node, depth) => {
    for(const c of (node.children || [])){
      if(c.url) continue;                         // folders only
      opts.push({ id:c.id, label:'\u00A0\u00A0'.repeat(depth) + (c.title || '—') });
      walk(c, depth + 1);
    }
  };
  walk(tree[0], 0);
  if(!opts.length){ sel.innerHTML = '<option value="other">'+esc(t('bm_loc_other'))+'</option>'; sel.value='other'; return; }
  sel.innerHTML = opts.map(o => '<option value="'+esc(o.id)+'">'+esc(o.label)+'</option>').join('');
  // Resolve current selection: map legacy 'bar'/'other' keywords to their root folder ids
  let curId = cur;
  if(cur === 'bar' || cur === 'other'){ const r = bmPickRoot(roots, cur); curId = r ? r.id : undefined; }
  sel.value = (curId && opts.some(o => o.id === curId)) ? curId : opts[0].id;
}

// ── Popup-side bookmark mirror ──
// Runs the same logic as the service worker, but directly from the popup so interactive
// syncs always use the current code (immune to a stale/old background service worker).
// Resolve a bookmark root by preference, robust across Chrome (ids '1'/'2') and
// Firefox (ids 'toolbar_____'/'unfiled_____'), with an index fallback as last resort.
function bmPickRoot(roots, pref){
  const byId = id => roots.find(r => r.id === id);
  if(pref === 'bar')   return byId('toolbar_____') || byId('1') || roots[0];
  if(pref === 'other') return byId('unfiled_____') || byId('2') || roots[1] || roots[0];
  return null;
}
// Does a folder with this id exist anywhere in the tree? (Robust for root ids like
// 'toolbar_____'/'unfiled_____', where chrome.bookmarks.get(rootId) can throw in Firefox
// and previously caused a silent fallback to "Other Bookmarks".)
function bmFolderExists(tree, id){
  let found = false;
  const walk = n => { for(const c of (n.children || [])){ if(found) return; if(c.id === id && !c.url){ found = true; return; } walk(c); } };
  if(tree && tree[0]) walk(tree[0]);
  return found;
}
async function bmParentIdLocal(pref){
  try{
    const tree = await chrome.bookmarks.getTree();
    const roots = (tree[0] && tree[0].children) || [];
    if(pref==='bar' || pref==='other'){ const r = bmPickRoot(roots, pref); return r ? r.id : undefined; }
    if(pref && bmFolderExists(tree, pref)) return pref;   // chosen folder (incl. roots) verified via tree
  }catch{}
  return undefined;
}
async function bmFindManagedLocal(title){
  const out=[]; let tree; try{ tree=await chrome.bookmarks.getTree(); }catch{ return out; }
  const walk=n=>{ for(const c of (n.children||[])){ if(!c.url){ if(c.title===title) out.push(c.id); walk(c);} } };
  if(tree[0]) walk(tree[0]); return out;
}
// Serialize all popup-side mirror calls: concurrent triggers (auto + explicit) must NOT
// build simultaneously, or folders get created multiple times. Each run tears down the
// previously tracked nodes, so the chain always converges to a single set.
let bmLocalChain = Promise.resolve();
function mirrorBookmarksLocal(){
  const run = bmLocalChain.then(() => _doMirrorLocal());
  bmLocalChain = run.then(() => {}, () => {});
  return run;
}
async function _doMirrorLocal(){
  const BM_ROOT='LinkPortal', BM_FAV='Favoriten';
  if(!chrome.bookmarks) return { ok:false, reason:'no-bookmarks-api' };
  let granted=false; try{ granted = await chrome.permissions.contains({permissions:['bookmarks']}); }catch{}
  if(!granted) return { ok:false, reason:'no-permission' };
  const { bmSync,bmParent,bmWrap,bmFav,bmPrivate } = await chrome.storage.sync.get(['bmSync','bmParent','bmWrap','bmFav','bmPrivate']);
  if(!bmSync) return { ok:false, reason:'sync-off' };
  const { cache, bmRootId, bmDirectIds, bmHashLocal } = await chrome.storage.local.get(['cache','bmRootId','bmDirectIds','bmHashLocal']);
  if(!cache || !cache.tabs) return { ok:false, reason:'no-cache' };
  const wrap = bmWrap !== false, fav = bmFav === true, incPrivate = bmPrivate === true;
  const tabs = cache.tabs.filter(tb => incPrivate || !tb.is_private);
  const favs = (fav && Array.isArray(cache.favorites)) ? cache.favorites.filter(f => f && f.url) : [];
  const secLinksOf = sec => (sec.section_type === 'links')
    ? (cache.links[sec.id]||[])
    : ((cache.widgetLinks && cache.widgetLinks[sec.id]) || []);
  // Content+config signature → skip a full rebuild when nothing relevant changed
  // (fetchFromApi triggers this on every load/CRUD, so the skip avoids constant churn).
  const sig = [wrap?'w':'d', (bmParent||'other'), incPrivate?'p1':'p0', fav?'f1':'f0'];
  favs.forEach(f => sig.push('F:'+(f.title||'')+'|'+f.url));
  let builtTabs = 0;
  for(const tab of tabs){
    const secs=(cache.sections[tab.id]||[]).filter(s=>secLinksOf(s).length);
    if(!secs.length) continue;
    builtTabs++; sig.push('T:'+tab.id+':'+(tab.title||''));
    for(const sec of secs){ sig.push('S:'+sec.id+':'+(sec.title||'')); secLinksOf(sec).forEach(l=>sig.push('L:'+(l.title||'')+'|'+(l.url||''))); }
  }
  const str = sig.join('\n'); let h = 5381; for(let i=0;i<str.length;i++){ h = ((h<<5)+h+str.charCodeAt(i))|0; } const hash = String(h);
  const stats = { ok:true, wrap, favCount:favs.length, tabCount:builtTabs, privateIncluded:incPrivate, favInCache:(Array.isArray(cache.favorites)?cache.favorites.length:0), privateInCache:cache.tabs.filter(tb=>tb.is_private).length };
  if(bmHashLocal === hash){
    let alive = false;
    try{
      if(wrap && bmRootId){ const n = await chrome.bookmarks.get(bmRootId); alive = !!(n && n.length); }
      else if(!wrap && Array.isArray(bmDirectIds) && bmDirectIds.length){ const n = await chrome.bookmarks.get(bmDirectIds[0]); alive = !!(n && n.length); }
    }catch{}
    if(alive) return Object.assign(stats, { skipped:true });
  }
  // teardown previously created nodes
  if(bmRootId){ try{ await chrome.bookmarks.removeTree(bmRootId); }catch{} }
  for(const id of (bmDirectIds||[])){ try{ await chrome.bookmarks.removeTree(id); }catch{} }
  const pid = await bmParentIdLocal(bmParent||'other');
  // remove EVERY stray "LinkPortal" folder anywhere (orphans from any prior config)
  for(const id of await bmFindManagedLocal(BM_ROOT)){ try{ await chrome.bookmarks.removeTree(id); }catch{} }
  let rootId, directIds=[];
  if(wrap){ const r = await chrome.bookmarks.create(pid?{parentId:pid,title:BM_ROOT}:{title:BM_ROOT}); rootId=r.id; }
  else {
    rootId = pid || await bmParentIdLocal('other');
    // Direct mode: remove any existing folders in the target that carry a name we manage
    // (tab titles + "Favoriten") — clears leftover duplicates from earlier runs.
    const managed = new Set([BM_FAV, ...tabs.map(t => t.title || 'Tab')]);
    try { for(const c of await chrome.bookmarks.getChildren(rootId)) if(!c.url && managed.has(c.title)) { try{ await chrome.bookmarks.removeTree(c.id); }catch{} } } catch {}
  }
  if(favs.length){
    const ff = await chrome.bookmarks.create({parentId:rootId,title:BM_FAV});
    if(!wrap) directIds.push(ff.id);
    for(const f of favs) await chrome.bookmarks.create({parentId:ff.id,title:f.title||f.url,url:f.url});
  }
  for(const tab of tabs){
    const secs=(cache.sections[tab.id]||[]).filter(s=>secLinksOf(s).length);
    if(!secs.length) continue;
    const tf=await chrome.bookmarks.create({parentId:rootId,title:tab.title||'Tab'});
    if(!wrap) directIds.push(tf.id);
    for(const sec of secs){
      const sf=await chrome.bookmarks.create({parentId:tf.id,title:sec.title||'Section'});
      for(const l of secLinksOf(sec)){ if(l.url) await chrome.bookmarks.create({parentId:sf.id,title:l.title||l.url,url:l.url}); }
    }
  }
  // persist managed-node tracking + local hash; clear SW hash so the background stays consistent
  await chrome.storage.local.set({ bmRootId: wrap?rootId:null, bmDirectIds: wrap?[]:directIds, bmHash:'', bmHashLocal:hash });
  return stats;
}

async function onBookmarkToggle(e){
  const res = $('s-bm-result');
  const on  = e.target.checked;
  if(on){
    if(!chrome.permissions || !chrome.permissions.request){
      e.target.checked = false; showSResult(res,'error', iconSvg('warning')+' '+t('bm_unsupported')); return;
    }
    let granted = false;
    try { granted = await chrome.permissions.request({ permissions:['bookmarks'] }); } catch { granted = false; }
    if(!granted){
      e.target.checked = false; showSResult(res,'error', iconSvg('warning')+' '+t('bm_perm_denied')); return;
    }
    await chrome.storage.sync.set({ bmSync:true }); S.bmSync = true;
    await loadBmFolders();   // permission just granted → show the full folder tree
    showSResult(res,'loading', spin()+t('sync_loading'));
    try { await mirrorBookmarksLocal(); } catch {}
    showSResult(res,'success', iconSvg('check')+' '+t('bm_enabled'));
  } else {
    await chrome.storage.sync.set({ bmSync:false }); S.bmSync = false;
    try { await chrome.runtime.sendMessage({ action:'removeBookmarks' }); } catch {}
    try { if(chrome.permissions?.remove) await chrome.permissions.remove({ permissions:['bookmarks'] }); } catch {}
    showSResult(res,'success', iconSvg('check')+' '+t('bm_disabled'));
  }
}

// ── FIX: syncNow uses in-memory state directly ──
async function syncNow(){
  if(!S.baseUrl||!S.token||!S.username){
    showSResult($('s-sync-result'),'error',iconSvg('warning')+' '+t('sync_err')); return;
  }
  $('s-btn-sync').disabled=true;
  showSResult($('s-sync-result'),'loading',spin()+t('sync_loading'));
  try {
    // Use fetchFromApi directly (same as refresh button) — avoids message passing issues
    applyData(await fetchFromApi(), S.activeTab, 'last'); // preserve active tab on CRUD
    renderAll();
    await loadCacheInfo();
    showSResult($('s-sync-result'),'success',iconSvg('check')+' '+t('sync_ok')+' '+new Date().toLocaleTimeString());
  } catch(err) {
    if(err.status===403){showSResult($('s-sync-result'),'error',iconSvg('x')+' '+t('test_err_403'));}
    else showSResult($('s-sync-result'),'error',iconSvg('x')+' '+esc(err.message));
  }
  $('s-btn-sync').disabled=false;
}

async function clearCache(){
  if(!confirm(t('confirm_cache'))) return;
  await chrome.storage.local.remove(['cache','cacheTime']);
  loadCacheInfo(); showSResult($('s-sync-result'),'success',iconSvg('check')+' '+t('cache_cleared'));
}

async function loadCacheInfo(){
  const {cache}=await chrome.storage.local.get(['cache']);
  $('s-sync-time').textContent=cache?.syncTime?new Date(cache.syncTime).toLocaleString():t('lbl_sync_never');
  if(cache?.links){let n=0;for(const l of Object.values(cache.links))n+=(l||[]).length;$('s-cache-cnt').textContent=n+' Links';}
  else $('s-cache-cnt').textContent='0 Links';
}

async function changeLang(code, skipPortalSync=false){
  setLang(code); await chrome.storage.local.set({lang:code}); applyLang();
  if($('s-lang')) $('s-lang').value=code;
  if($('dd-lang-sel')) $('dd-lang-sel').value=code;
  // Only sync back to portal if change came from user (not from portal itself)
  if(!skipPortalSync && S.baseUrl && S.token){
    try{await apiFetch('PUT','/settings',{language:code});}catch{}
  }
}

// Spinner markup for loading status messages (SVG instead of emoji)
const spin = () => '<span class="lp-spin">'+iconSvg('loader')+'</span> ';
function showStatus(msg,type){const s=$('s-save-status');s.innerHTML=msg;s.className='save-status '+type;setTimeout(()=>{s.textContent='';s.className='save-status';},3000);}
function showSResult(el,type,html){if(!el)return;el.style.display='';el.className='test-result '+type;el.innerHTML=html;}

// ── Dropdown ──
function openDropdown(){const d=$('dropdown-menu');d.style.display=d.style.display==='none'?'block':'none';}
function closeDropdown(){const d=$('dropdown-menu');if(d)d.style.display='none';}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
async function init(){
  // Default to English before anything loads (prevents missing text on error)
  setLang('en'); applyLang();
  paintIcons(); // swap static emoji placeholders for SVG icons

  // Check logout triggered by background
  const {logoutReason}=await chrome.storage.local.get(['logoutReason']);
  if(logoutReason){await chrome.storage.local.remove(['logoutReason']);await doLogout(logoutReason);return;}

  // Load stored prefs
  const stored=await chrome.storage.sync.get(['baseUrl','token','username','bmSync']);
  const local=await chrome.storage.local.get(['lang','theme','logoDisplayUrl']);
  S.bmSync=!!stored.bmSync;

  S.baseUrl=stored.baseUrl||''; S.token=stored.token||''; S.username=stored.username||'';

  // Theme
  applyTheme(local.theme||'auto');

  // Language — fallback to English on any error
  const activeLang=local.lang||'en';
  try { setLang(activeLang); } catch { setLang('en'); }
  applyLang();

  // Show cached logo immediately (theme-matched: dark variant when applicable)
  if(local.logoDisplayUrl){
    applyLogoForTheme();
  }

  // Re-open settings only if it was open earlier in THIS browser session (session storage,
  // cleared on restart). Any legacy persistent flag is removed so it can never trigger.
  const settingsOpen = await getSettingsOpen();
  if(settingsOpen) { await openSettings(); return; }

  if(!S.baseUrl||!S.token||!S.username){showScreen('setup');return;}

  loadBranding(); // non-blocking
  await loadData();
  // lang sync happens inside bgRefresh() / syncLangFromPortal()
}

document.addEventListener('DOMContentLoaded',()=>{
  initGlobalDnD(); // one-time global DnD — must be first
  watchSettingsFields();

  // React immediately when background sync updates the language
  chrome.storage.onChanged.addListener((changes, area) => {
    if(area === 'local' && changes.lang) {
      const newLang = changes.lang.newValue;
      if(newLang && I18N[newLang] && newLang !== _lang) {
        setLang(newLang); applyLang();
        if($('dd-lang-sel')) $('dd-lang-sel').value = newLang;
        if($('s-lang')) $('s-lang').value = newLang;
      }
    }
  });

  // Setup/Logout buttons
  $('btn-open-settings').addEventListener('click',openSettings);
  $('btn-logout-settings').addEventListener('click',openSettings);
  $('btn-retry').addEventListener('click',()=>loadData(true));
  $('btn-refresh').addEventListener('click',async()=>{
    $('btn-refresh').classList.add('spinning');
    await loadData(true);
    $('btn-refresh').classList.remove('spinning');
  });

  // Logo + title → open portal
  ['portal-logo','portal-title','default-icon'].forEach(id => {
    $(id)?.addEventListener('click', () => { if(S.baseUrl) chrome.tabs.create({url:S.baseUrl}); });
  });
  $('portal-title').style.cursor = 'pointer';
  $('portal-logo').style.cursor  = 'pointer';
  $('default-icon').style.cursor = 'pointer';

  // Dropdown
  $('btn-menu').addEventListener('click',e=>{e.stopPropagation();openDropdown();});
  $('dd-settings').addEventListener('click',openSettings);
  $('dd-open-portal').addEventListener('click',()=>{closeDropdown();if(S.baseUrl)chrome.tabs.create({url:S.baseUrl});});
  document.addEventListener('click',e=>{
    if(!e.target.closest('.dropdown-wrap'))closeDropdown();
    if(!e.target.closest('.tabs-toggle-wrap')){
      $('tabs-dropdown').style.display='none';
      $('tabs-chevron').classList.remove('open');
      const b=$('tabs-burger'); if(b) b.classList.remove('open');
    }
  });

  // Theme buttons (in settings panel)
  document.querySelectorAll('.theme-btn-lg').forEach(b=>b.addEventListener('click',()=>changeTheme(b.dataset.theme)));

  // Language dropdown in menu
  $('dd-lang-sel').addEventListener('change',e=>{e.stopPropagation();changeLang(e.target.value);});

  // Tab toggle
  $('tabs-toggle-btn').addEventListener('click',e=>{e.stopPropagation();openTabsDropdown();});
  $('tab-add-btn').addEventListener('click',()=>openLinkDialog(null, S.activeTab === ALL_TAB ? null : S.activeTab));

  // Search
  const si=$('search-input'),sc=$('search-clear');let tm;
  si.addEventListener('input',()=>{sc.style.display=si.value?'':'none';clearTimeout(tm);tm=setTimeout(()=>performSearch(si.value),200);});
  sc.addEventListener('click',clearSearch);
  si.addEventListener('keydown',e=>{
    if(e.key==='Escape'){clearSearch();return;}
    if($('search-results').style.display==='none') return;
    if(e.key==='ArrowDown'){e.preventDefault();kbdSelectResult(searchKbdIdx+1);return;}
    if(e.key==='ArrowUp')  {e.preventDefault();kbdSelectResult(searchKbdIdx-1);return;}
    if(e.key==='Enter'){
      e.preventDefault();
      const items=$('results-list')?.querySelectorAll('.link-item');
      if(items&&searchKbdIdx>=0&&items[searchKbdIdx]) chrome.tabs.create({url:items[searchKbdIdx].dataset.url});
      else if(items&&items.length===1) chrome.tabs.create({url:items[0].dataset.url});
    }
  });

  // Settings panel
  $('btn-settings-back').addEventListener('click',closeSettings);
  // Version click → toggle extension ID
  $('s-version-btn')?.addEventListener('click', () => {
    const col = $('s-extid-collapse');
    const show = col.style.display === 'none';
    col.style.display = show ? '' : 'none';
    if(show) {
      const id = chrome.runtime.id || '—';
      $('s-ext-id').textContent = id;
    }
  });
  $('s-btn-copy-id')?.addEventListener('click', () => {
    const id = $('s-ext-id').textContent;
    navigator.clipboard.writeText(id).then(() => {
      const btn = $('s-btn-copy-id');
      btn.innerHTML = iconSvg('check')||'✓';
      setTimeout(() => btn.innerHTML = iconSvg('copy')||'📋', 1500);
    }).catch(() => {});
  });
  $('s-btn-test').addEventListener('click',testConnection);
  $('s-btn-save').addEventListener('click',saveSettings);
  $('s-btn-reset').addEventListener('click',resetSettings);
  $('s-btn-edit-tok').addEventListener('click',editToken);
  $('s-btn-show-tok').addEventListener('click',toggleTokenVis);
  $('s-btn-sync').addEventListener('click',syncNow);
  $('s-bm-toggle')?.addEventListener('change', onBookmarkToggle);
  const showBmStats = (resp) => {
    const res = $('s-bm-result');
    if(resp && resp.ok){
      const st = resp;
      const mode = st.wrap ? t('bm_mode_wrap') : t('bm_mode_direct');
      let line = iconSvg('check')+' '+t('bm_synced')+' — '+esc(mode)
        + ' · '+t('bm_stat_fav')+': '+(st.favCount||0)
        + ' · '+t('bm_stat_tabs')+': '+(st.tabCount||0);
      if(st.privateIncluded) line += ' ('+t('bm_stat_private')+')';
      // Ground-truth diagnostics: what the server actually delivered into the cache
      const diag = [];
      if(typeof st.favInCache === 'number')     diag.push('Fav/Server: '+st.favInCache);
      if(typeof st.privateInCache === 'number') diag.push('Privat/Server: '+st.privateInCache);
      if(diag.length) line += '<br><small style="opacity:.7">'+esc(diag.join(' · '))+'</small>';
      showSResult(res,'success', line);
    } else {
      const why = (resp && resp.reason) ? ' ('+esc(resp.reason)+')' : '';
      showSResult(res,'error', iconSvg('x')+' '+t('bm_disabled')+why);
    }
  };
  const onBmOptionChange = async () => {
    await chrome.storage.sync.set({
      bmWrap: $('s-bm-wrap') ? $('s-bm-wrap').checked : true,
      bmFav:  $('s-bm-fav')  ? $('s-bm-fav').checked  : false,
      bmPrivate: $('s-bm-private') ? $('s-bm-private').checked : false,
    });
    if($('s-bm-toggle')?.checked){
      showSResult($('s-bm-result'),'loading', spin()+t('sync_loading'));
      // Refresh data first so cache.favorites / private tabs are current, then mirror
      try { await fetchFromApi(); } catch {}
      let resp; try { resp = await mirrorBookmarksLocal(); } catch {}
      showBmStats(resp);
    }
  };
  $('s-bm-wrap')?.addEventListener('change', onBmOptionChange);
  $('s-bm-fav')?.addEventListener('change', onBmOptionChange);
  $('s-bm-private')?.addEventListener('change', onBmOptionChange);
  $('s-btn-bm-newfolder')?.addEventListener('click', async () => {
    const res = $('s-bm-result');
    let granted = false;
    try { granted = await chrome.permissions.contains({ permissions:['bookmarks'] }); } catch {}
    if(!granted || !chrome.bookmarks){ showSResult(res,'error', iconSvg('warning')+' '+t('bm_perm_denied')); return; }
    const name = (prompt(t('bm_new_folder_prompt')) || '').trim();
    if(!name) return;
    const sel = $('s-bm-parent');
    let parentId = sel?.value;
    if(parentId === 'bar' || parentId === 'other'){   // resolve legacy keyword to a real root id
      try { const tree = await chrome.bookmarks.getTree(); const roots = tree[0].children || []; parentId = bmPickRoot(roots, parentId)?.id; } catch {}
    }
    try {
      const folder = await chrome.bookmarks.create(parentId ? { parentId, title:name } : { title:name });
      await chrome.storage.sync.set({ bmParent: folder.id });
      await loadBmFolders();
      if(sel) sel.value = folder.id;
      if($('s-bm-toggle')?.checked){
        showSResult(res,'loading', spin()+t('sync_loading'));
        try { await mirrorBookmarksLocal(); } catch {}
        showSResult(res,'success', iconSvg('check')+' '+t('bm_enabled'));
      }
    } catch { showSResult(res,'error', iconSvg('x')+' '+t('bm_disabled')); }
  });
  $('s-btn-bm-sync')?.addEventListener('click', async () => {
    const res = $('s-bm-result');
    if(!$('s-bm-toggle')?.checked){ showSResult(res,'error', iconSvg('warning')+' '+t('bm_disabled')); return; }
    $('s-btn-bm-sync').disabled = true;
    showSResult(res,'loading', spin()+t('sync_loading'));
    try { await fetchFromApi(); } catch {}
    try { const resp = await mirrorBookmarksLocal(); showBmStats(resp); }
    catch { showSResult(res,'error', iconSvg('x')+' '+t('bm_disabled')); }
    $('s-btn-bm-sync').disabled = false;
  });
  $('s-bm-parent')?.addEventListener('change', async e => {
    await chrome.storage.sync.set({ bmParent: e.target.value });
    if($('s-bm-toggle')?.checked){
      showSResult($('s-bm-result'),'loading', spin()+t('sync_loading'));
      try { await mirrorBookmarksLocal(); } catch {}
      showSResult($('s-bm-result'),'success', iconSvg('check')+' '+t('bm_enabled'));
    }
  });
  $('s-btn-clear').addEventListener('click',clearCache);
  $('s-lang').addEventListener('change',e=>changeLang(e.target.value));
  $('s-starttab')?.addEventListener('change', e => {
    chrome.storage.local.set({ startTab: e.target.value });
  });

  // Link dialog
  $('dlg-close').addEventListener('click',closeLinkDialog);
  $('dlg-cancel').addEventListener('click',closeLinkDialog);
  $('dlg-save').addEventListener('click',saveLinkDialog);
  $('dlg-btn-current').addEventListener('click',async()=>{
    try{const[tab]=await chrome.tabs.query({active:true,currentWindow:true});
      if(tab){if(!$('dlg-url').value)$('dlg-url').value=tab.url||'';if(!$('dlg-title-inp').value)$('dlg-title-inp').value=tab.title||'';}}catch{}
  });
  $('dlg-backdrop').addEventListener('click',e=>{if(e.target===$('dlg-backdrop'))closeLinkDialog();});

  // Keyboard
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeLinkDialog();closeDropdown();}});

  init();
});
