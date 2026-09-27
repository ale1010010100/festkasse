// =====================================================================
// FestKasse – App
// =====================================================================
import { CONFIG } from './config.js';
import { createDemoApi } from './api-demo.js';
import { qrSvg } from './qr.js';
import { LIBRARY, libraryUrl } from './library.js';

// ---------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------
const S = {
  api: null, mode: 'demo', session: null, role: null,
  club: null, event: null, categories: [], products: [], helpers: [], payrexx: null,
  helper: null,           // { event_id, helper_id, name, code }
  cart: {}, admTab: 'event', stats: null, unsub: null,
  pay: null,              // laufende Zahlung
  editing: null,          // Produkt im Editor
  joinStep: 1, joinCode: '', preview: null, registerMode: false,
  successTimer: null,
};

// ---------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const attr = (s) => esc(s).replace(/`/g, '&#96;');
function fmt(cents, dec = 2) {
  const n = cents / 100; const neg = n < 0;
  let [i, d] = Math.abs(n).toFixed(dec).split('.');
  i = i.replace(/\B(?=(\d{3})+(?!\d))/g, '’');
  return (neg ? '−' : '') + i + (dec ? '.' + d : '');
}
const chf = (c, dec = 2) => 'CHF ' + fmt(c, dec);
const timeStr = (d) => new Date(d).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
const dateStr = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : '';
const haptic = () => { try { navigator.vibrate?.(12); } catch { /* */ } };
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } },
};
function toast(msg, ms = 2400) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}
function errMsg(e) { return e?.network ? 'Keine Verbindung. Bitte später nochmals versuchen.' : (e?.message || 'Unbekannter Fehler'); }
const appUrl = () => new URL('.', location.href).href;
const joinUrl = () => `${appUrl()}?code=${S.event?.code ?? ''}`;
const prod = (id) => S.products.find((p) => p.id === id);
const cartCount = () => Object.values(S.cart).reduce((a, b) => a + b, 0);
const cartTotal = () => Object.entries(S.cart).reduce((s, [id, q]) => s + (prod(id)?.price_cents ?? 0) * q, 0);
const isAdmin = () => S.role === 'admin';
const methodsOn = () => S.event?.methods ?? {};

const ICON_CHEV = '<svg class="chev-r" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg>';
const ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
const ICON_MENU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';
const RAYS = '<svg class="rays" viewBox="0 0 60 30" aria-hidden="true"><g stroke="#5DA531" stroke-width="6" stroke-linecap="round"><path d="M30 4v16M12 9l7 12M48 9l-7 12"/></g></svg>';
const METHOD = {
  twint: { label: 'TWINT', sub: 'QR-Code scannen lassen', color: '#14151C', soft: '#ECECEF',
    icon: '<div class="m-ico" style="background:#000;color:#fff"><svg viewBox="0 0 28 28"><rect x="3" y="3" width="10" height="10" rx="2.5" fill="#fff"/><rect x="15" y="3" width="10" height="10" rx="2.5" fill="#fff" opacity=".55"/><rect x="3" y="15" width="10" height="10" rx="2.5" fill="#fff" opacity=".55"/><rect x="15" y="15" width="10" height="10" rx="2.5" fill="#fff"/></svg></div>' },
  cash: { label: 'Bar', sub: 'Bargeld entgegennehmen', color: '#E59A1A', soft: '#FFF1DC',
    icon: '<div class="m-ico" style="background:#FFF1DC;color:#B26A00"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v5M18 9.5v5"/></svg></div>' },
};
const EMOJIS = ['🍺', '🍷', '🥂', '💧', '🥤', '☕', '🍵', '🧃', '🌭', '🍔', '🍟', '🍕', '🥨', '🧀', '🥗', '🍰', '🍦', '🍫', '🍪', '🍿', '🥔', '🎟️', '🎈', '🍽️'];

function tile(p, sm) {
  if (p.photo_url) return `<div class="tile photo ${sm ? 'sm' : ''}"><img src="${attr(p.photo_url)}" alt="" loading="lazy"></div>`;
  return `<div class="tile ${sm ? 'sm' : ''}">${RAYS}<div class="food"><span>${esc(p.icon || '🍽️')}</span></div></div>`;
}
const topBar = (title, sub, left = '<div class="logo">🎡</div>') =>
  `<header class="top">${left}<div class="grow"><h1>${esc(title)}</h1><p>${sub}</p></div>
   <button class="menu-btn" onclick="FK.openMenu()" aria-label="Menü">${ICON_MENU}</button></header>`;

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
  ({ 's-welcome': renderWelcome, 's-join': renderJoin, 's-login': renderLogin, 's-setup': renderSetup,
     's-admin': renderAdmin, 's-pos': renderPOS, 's-dash': renderDash })[id]?.();
}
const current = () => document.querySelector('.screen.active')?.id;

function openSheet(html) { $('sheet').innerHTML = '<div class="grab"></div>' + html; $('modal').classList.add('open'); }
function closeSheet() { $('modal').classList.remove('open'); }
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeSheet(); });

// ---------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------
async function boot() {
  const live = !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
  try {
    if (live) { const { createLiveApi } = await import('./api.js'); S.api = await createLiveApi(CONFIG); }
    else S.api = createDemoApi();
  } catch (e) {
    $('s-loading').innerHTML = `<div class="center-wrap"><div class="hero-t">Keine Verbindung</div><p class="hero-p">Die App konnte nicht geladen werden. Prüfe die Internetverbindung und lade die Seite neu.</p><button class="btn primary" onclick="location.reload()">Neu laden</button></div>`;
    return;
  }
  S.mode = S.api.mode;
  S.helper = store.get('fk-helper');
  S.session = await S.api.session();

  const code = new URLSearchParams(location.search).get('code');
  if (code) { history.replaceState(null, '', location.pathname); return startJoin(code); }
  if (S.session?.kind === 'admin') return enterAdmin();
  if (S.session?.kind === 'anon' && S.helper) return enterHelper();
  show('s-welcome');
}

async function loadEvent(eventId) {
  const d = await S.api.loadEventData(eventId, isAdmin());
  if (!d.event) return false;
  Object.assign(S, { event: d.event, categories: d.categories, products: d.products, helpers: d.helpers });
  for (const id of Object.keys(S.cart)) if (!prod(id) || prod(id).sold_out) delete S.cart[id];
  return true;
}

function subscribe() {
  S.unsub?.();
  let t = null; const pending = new Set();
  S.unsub = S.api.subscribe(S.event.id, (table) => {
    pending.add(table); clearTimeout(t);
    t = setTimeout(() => { const tables = [...pending]; pending.clear(); onRemoteChange(tables); }, 350);
  });
}
async function onRemoteChange(tables) {
  const scr = current();
  if (tables.some((t) => t !== 'orders')) {
    const ok = await loadEvent(S.event.id).catch(() => true);
    if (!ok && S.role === 'helper') return lostAccess();
    if (scr === 's-pos') renderPOS();
    if (scr === 's-admin' && !$('modal').classList.contains('open')) renderAdmin();
  }
  if (tables.includes('orders')) {
    if (scr === 's-dash') renderDash();
    if (scr === 's-admin' && S.admTab === 'event') refreshAdminKpis();
    if (S.pay?.orderId && scr === 's-pay') pollTwint(true);
  }
}
// Rückfall, falls Live-Updates ausfallen
setInterval(() => { if (S.event && document.visibilityState === 'visible' && current() !== 's-pay') onRemoteChange(['products']); }, 30000);

// ---------------------------------------------------------------------
// Willkommen / Beitreten
// ---------------------------------------------------------------------
function renderWelcome() {
  $('s-welcome').innerHTML = `<div class="center-wrap">
    <div class="brand"><i>F</i>FestKasse</div>
    <div class="hero-t">Kassieren am Vereinsfest, direkt auf dem eigenen Handy.</div>
    <p class="hero-p">Helfer brauchen kein Konto. Der Verein richtet das Event einmal ein, alle anderen scannen den QR-Code und legen los.</p>
    <div class="roles">
      <button class="role" onclick="FK.startJoin()">
        <div class="m-ico" style="background:var(--accent);color:#fff"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 9h2v2H8zM14 9h2v2h-2zM8 14h2v1M14 13v3h2"/></svg></div>
        <div style="flex:1"><b>Als Helfer beitreten</b><span>Event-Code eingeben oder QR-Code mit der Kamera scannen</span></div>${ICON_CHEV}</button>
      <button class="role" onclick="FK.goLogin()">
        <div class="m-ico" style="background:var(--dark);color:#fff"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/></svg></div>
        <div style="flex:1"><b>Verein verwalten</b><span>Anmelden, um Event, Produkte und Helfer einzurichten</span></div>${ICON_CHEV}</button>
    </div>
    <div class="foot-note">${S.mode === 'demo' ? 'Demo-Modus: Daten bleiben nur in diesem Browser. Demo-Code: <b>CH26MU</b>' : 'Tipp: Über «Zum Home-Bildschirm» wird FestKasse wie eine App geöffnet.'}</div>
  </div>`;
}

function startJoin(code = '') {
  S.joinStep = 1; S.joinCode = String(code).toUpperCase(); S.preview = null;
  show('s-join');
  if (S.joinCode) checkCode();
}
function renderJoin() {
  const back = `<button class="icon-btn" onclick="FK.joinBack()" aria-label="Zurück">${ICON_BACK}</button>`;
  if (S.joinStep === 1) {
    $('s-join').innerHTML = `<div class="center-wrap">
      <div class="step-h">${back}<h2>Event beitreten</h2></div>
      <div class="state-box info" style="margin-bottom:18px">Scanne den QR-Code des Vereins mit der Kamera-App. FestKasse öffnet sich dann direkt mit dem richtigen Event.</div>
      <form class="form" onsubmit="event.preventDefault();FK.checkCode()">
        <div class="field"><label for="join-code">Oder Event-Code eingeben</label>
          <input class="input code-input" id="join-code" maxlength="6" placeholder="CODE" autocomplete="off" autocapitalize="characters" value="${attr(S.joinCode)}"></div>
        <div class="err-msg" id="join-err"></div>
        <button class="btn primary" type="submit" id="join-btn">Weiter</button>
      </form></div>`;
    return;
  }
  const p = S.preview;
  $('s-join').innerHTML = `<div class="center-wrap">
    <div class="step-h">${back}<h2>Fast fertig</h2></div>
    <div class="event-card"><div class="logo">🎡</div><div style="flex:1;min-width:0"><b>${esc(p.name)}</b><span>${esc(p.club)} · ${dateStr(p.date)}</span></div>
      <span class="pill ok"><span class="d"></span>Offen</span></div>
    <form class="form" style="margin-top:22px" onsubmit="event.preventDefault();FK.finishJoin()">
      <div class="field"><label for="join-name">Wie heisst du?</label><input class="input" id="join-name" placeholder="Vorname" autocomplete="given-name" maxlength="30" value="${attr(S.helper?.name ?? '')}"></div>
      ${p.names?.length ? `<div class="field"><label>Vom Verein vorbereitet</label><div class="chips">${p.names.map((n) => `<button type="button" class="chip" onclick="FK.pickName(this)">${esc(n)}</button>`).join('')}</div></div>` : ''}
      <div class="err-msg" id="name-err"></div>
      <button class="btn primary" type="submit" id="join2-btn">Los geht’s</button>
    </form></div>`;
}
async function checkCode() {
  const input = $('join-code');
  const c = (input ? input.value : S.joinCode).trim().toUpperCase();
  S.joinCode = c;
  const errEl = () => $('join-err');
  if (c.length !== 6) { if (errEl()) errEl().textContent = 'Der Code hat 6 Zeichen.'; return; }
  const btn = $('join-btn'); if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
  try {
    await S.api.ensureAnon();
    const p = await S.api.eventPreview(c);
    if (!p) throw new Error('Kein Event mit diesem Code gefunden. Frag beim Verein nach dem aktuellen Code.');
    if (!p.open) throw new Error('Dieses Event ist geschlossen. Der Verein kann es in den Einstellungen öffnen.');
    S.preview = p; S.joinStep = 2; renderJoin();
    setTimeout(() => $('join-name')?.focus(), 60);
  } catch (e) {
    renderJoin(); errEl().textContent = errMsg(e);
  }
}
async function finishJoin() {
  const name = $('join-name').value.trim();
  if (name.length < 2) { $('name-err').textContent = 'Bitte gib deinen Vornamen ein.'; return; }
  const btn = $('join2-btn'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try {
    const r = await S.api.joinEvent(S.joinCode, name);
    S.helper = { event_id: r.event_id, helper_id: r.helper_id, name: r.name, code: S.joinCode, club: S.preview?.club ?? '' };
    store.set('fk-helper', S.helper);
    await enterHelper();
    toast(`Willkommen, ${r.name}!`);
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Los geht’s'; $('name-err').textContent = errMsg(e);
  }
}
async function enterHelper() {
  S.role = 'helper';
  try {
    const ok = await loadEvent(S.helper.event_id);
    if (!ok) return lostAccess();
  } catch (e) {
    if (e.network) { show('s-pos'); toast('Keine Verbindung – Daten werden geladen, sobald Internet da ist.'); return; }
    return lostAccess();
  }
  subscribe(); show('s-pos'); flushQueue();
}
function lostAccess() {
  S.unsub?.(); S.role = null; S.event = null; S.cart = {};
  store.set('fk-helper', null); S.helper = null;
  show('s-welcome');
  toast('Kein Zugang mehr zu diesem Event. Tritt mit dem aktuellen Code erneut bei.', 4000);
}

// ---------------------------------------------------------------------
// Verein: Login / Registrierung
// ---------------------------------------------------------------------
function renderLogin() {
  const r = S.registerMode;
  $('s-login').innerHTML = `<div class="center-wrap">
    <div class="step-h"><button class="icon-btn" onclick="FK.show('s-welcome')" aria-label="Zurück">${ICON_BACK}</button><h2>${r ? 'Verein registrieren' : 'Verein anmelden'}</h2></div>
    <form class="form" onsubmit="event.preventDefault();FK.doLogin()">
      ${r ? `<div class="field"><label for="reg-club">Name des Vereins</label><input class="input" id="reg-club" placeholder="z. B. Turnverein Rafz" maxlength="80"></div>
             <div class="field"><label for="reg-event">Erstes Event</label><input class="input" id="reg-event" placeholder="z. B. Chilbi 2026" maxlength="80"></div>` : ''}
      <div class="field"><label for="login-mail">E-Mail</label><input class="input" id="login-mail" type="email" autocomplete="email" ${S.mode === 'demo' && !r ? 'value="kasse@verein-musterhausen.ch"' : ''}></div>
      <div class="field"><label for="login-pw">Passwort</label><input class="input" id="login-pw" type="password" autocomplete="${r ? 'new-password' : 'current-password'}" ${S.mode === 'demo' && !r ? 'value="demo1234"' : ''}></div>
      <div class="err-msg" id="login-err"></div>
      <button class="btn dark" type="submit" id="login-btn">${r ? 'Konto erstellen' : 'Anmelden'}</button>
    </form>
    <button class="link-btn" onclick="FK.toggleRegister()">${r ? 'Schon ein Konto? Anmelden' : 'Noch kein Konto? Verein registrieren'}</button>
    ${S.mode === 'demo' && !r ? '<div class="foot-note">Demo: Zugangsdaten sind schon ausgefüllt.</div>' : ''}
  </div>`;
}
async function doLogin() {
  const mail = $('login-mail').value.trim(), pw = $('login-pw').value, err = $('login-err');
  const btn = $('login-btn'); const label = btn.textContent;
  err.textContent = '';
  if (!/^\S+@\S+\.\S+$/.test(mail)) { err.textContent = 'Bitte gib eine gültige E-Mail-Adresse ein.'; return; }
  if (pw.length < 6) { err.textContent = 'Das Passwort braucht mindestens 6 Zeichen.'; return; }
  let club, ev;
  if (S.registerMode) {
    club = $('reg-club').value.trim(); ev = $('reg-event').value.trim() || 'Mein Fest';
    if (club.length < 2) { err.textContent = 'Bitte gib den Namen des Vereins ein.'; return; }
  }
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try {
    if (S.registerMode) {
      store.set('fk-pending-club', { name: club, event: ev });
      const r = await S.api.signUp(mail, pw);
      if (r.needsConfirm) {
        btn.disabled = false; btn.textContent = label;
        openSheet(`<h3>Bitte E-Mail bestätigen</h3><p>Wir haben dir einen Link an <b>${esc(mail)}</b> geschickt. Öffne ihn und melde dich danach hier an.</p>
          <div class="btns"><button class="btn primary" onclick="FK.closeSheet();FK.toggleRegister()">Zur Anmeldung</button></div>`);
        return;
      }
    } else {
      await S.api.signIn(mail, pw);
    }
    S.session = await S.api.session();
    S.registerMode = false;
    await enterAdmin();
  } catch (e) {
    btn.disabled = false; btn.textContent = label;
    err.textContent = /Invalid login/i.test(e.message) ? 'E-Mail oder Passwort stimmt nicht.' : errMsg(e);
  }
}
function renderSetup() {
  const pend = store.get('fk-pending-club', {});
  $('s-setup').innerHTML = `<div class="center-wrap">
    <div class="step-h"><h2>Verein einrichten</h2></div>
    <p class="hero-p" style="margin-bottom:18px">Nur noch zwei Angaben, dann kannst du Produkte und Helfer erfassen.</p>
    <form class="form" onsubmit="event.preventDefault();FK.doSetup()">
      <div class="field"><label for="setup-club">Name des Vereins</label><input class="input" id="setup-club" maxlength="80" value="${attr(pend.name ?? '')}"></div>
      <div class="field"><label for="setup-event">Erstes Event</label><input class="input" id="setup-event" maxlength="80" value="${attr(pend.event ?? '')}" placeholder="z. B. Chilbi 2026"></div>
      <div class="err-msg" id="setup-err"></div>
      <button class="btn primary" id="setup-btn" type="submit">Verein anlegen</button>
    </form>
    <button class="link-btn" onclick="FK.logout()">Abmelden</button></div>`;
}
async function doSetup() {
  const name = $('setup-club').value.trim(), ev = $('setup-event').value.trim() || 'Mein Fest';
  if (name.length < 2) { $('setup-err').textContent = 'Bitte gib den Namen des Vereins ein.'; return; }
  const btn = $('setup-btn'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try {
    await S.api.createClub(name, ev); store.set('fk-pending-club', null);
    await enterAdmin(); toast('Verein angelegt');
  } catch (e) { btn.disabled = false; btn.textContent = 'Verein anlegen'; $('setup-err').textContent = errMsg(e); }
}
async function enterAdmin() {
  S.role = 'admin';
  try {
    S.club = await S.api.loadClub();
    if (!S.club) {
      const pend = store.get('fk-pending-club');
      if (pend?.name) { await S.api.createClub(pend.name, pend.event || 'Mein Fest'); store.set('fk-pending-club', null); S.club = await S.api.loadClub(); }
      else return show('s-setup');
    }
    let ev = await S.api.currentEvent(S.club.id);
    if (!ev) { await S.api.startEvent(S.club.id, 'Mein Fest', new Date().toISOString().slice(0, 10), '', null); ev = await S.api.currentEvent(S.club.id); }
    await loadEvent(ev.id);
    S.payrexx = await S.api.payrexxStatus(S.club.id).catch(() => null);
    subscribe(); S.admTab = 'event'; show('s-admin'); flushQueue();
  } catch (e) {
    show('s-login'); $('login-err').textContent = errMsg(e);
  }
}
async function logout() {
  S.unsub?.(); await S.api.signOut();
  Object.assign(S, { role: null, club: null, event: null, cart: {}, session: null });
  show('s-welcome'); toast('Abgemeldet');
}

// ---------------------------------------------------------------------
// Verwaltung
// ---------------------------------------------------------------------
function renderAdmin() {
  const tabs = [['event', 'Event'], ['products', 'Produkte'], ['helpers', 'Helfer'], ['settings', 'Einstellungen']];
  $('s-admin').innerHTML = topBar(S.club.name, 'Verwaltung', '<div class="logo" style="background:var(--dark);box-shadow:none;font-size:20px">🏠</div>')
    + `<nav class="seg">${tabs.map(([k, l]) => `<button class="${S.admTab === k ? 'on' : ''}" onclick="FK.admTab('${k}')">${l}</button>`).join('')}</nav>
       <div class="admin-body" id="adm-body">${({ event: admEvent, products: admProducts, helpers: admHelpers, settings: admSettings })[S.admTab]()}</div>`;
  $('s-admin').querySelectorAll('[data-qr]').forEach((el) => { el.innerHTML = qrSvg(joinUrl(), 'M', 1); });
  if (S.admTab === 'event' || S.admTab === 'helpers') refreshAdminKpis();
}
function admTab(t) { S.admTab = t; renderAdmin(); window.scrollTo(0, 0); }

function joinCard(title) {
  return `<div class="card">
    <div class="card-head"><h3>${title}</h3><span class="pill ${S.event.open ? 'ok' : 'off'}"><span class="d"></span>${S.event.open ? 'Offen' : 'Geschlossen'}</span></div>
    <div class="qr-share" style="margin-top:12px">
      <div class="qr-join" data-qr></div>
      <div style="min-width:0"><div class="muted" style="font-size:13px;font-weight:700">Event-Code</div>
        <div class="code-big num">${esc(S.event.code)}</div>
        <div class="small-note" style="margin-top:4px">Helfer scannen den QR-Code mit der Kamera oder geben den Code in der App ein.</div></div>
    </div>
    <div class="row-actions">
      <button class="btn soft sm" onclick="FK.copyJoin()">Link kopieren</button>
      <button class="btn light sm" onclick="FK.askNewCode()">Neuer Code</button>
    </div></div>`;
}
function admEvent() {
  const active = S.helpers.filter((h) => !h.blocked && h.name !== 'Verwaltung').length;
  const avail = S.products.filter((p) => !p.sold_out).length;
  const twintReady = S.mode === 'demo' || S.payrexx?.configured;
  const m = methodsOn();
  const check = (ok, t, sub, tab) => `<button class="item" onclick="FK.admTab('${tab}')">
      <div class="thumb" style="width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:${ok ? 'var(--success)' : 'var(--bg)'};color:#fff;font-size:16px">${ok ? '✓' : ''}</div>
      <div class="it"><b>${t}</b><span>${sub}</span></div>${ICON_CHEV}</button>`;
  const steps = [
    [S.products.length > 0, 'Produkte erfasst', `${S.products.length} Produkte, ${avail} verfügbar`, 'products'],
    [!m.twint || twintReady, 'TWINT eingerichtet', m.twint ? (twintReady ? 'Payrexx verbunden' : 'Payrexx-Zugang fehlt noch') : 'TWINT ist ausgeschaltet', 'settings'],
    [active > 0, 'Helfer eingeladen', `${active} Helfer mit Zugang`, 'helpers'],
    [S.event.open, 'Event offen', S.event.open ? 'Helfer können kassieren' : 'Kassieren ist gesperrt', 'settings'],
  ];
  return `<div class="event-card" style="margin-top:6px"><div class="logo">🎡</div>
      <div style="flex:1;min-width:0"><b>${esc(S.event.name)}</b><span>${dateStr(S.event.date)}${S.event.place ? ' · ' + esc(S.event.place) : ''}</span></div></div>
    ${joinCard('Helfer einladen')}
    <div class="kpis three" id="adm-kpis">
      <div class="kpi"><div class="lbl">Umsatz</div><div class="val num">…</div></div>
      <div class="kpi"><div class="lbl">Bestellungen</div><div class="val num">…</div></div>
      <div class="kpi"><div class="lbl">Helfer</div><div class="val num">${active}</div></div></div>
    <div class="card"><h3>Einrichtung <small>${steps.filter((s) => s[0]).length} von ${steps.length} erledigt</small></h3>
      ${steps.map((s) => check(...s)).join('')}</div>
    <div style="display:grid;gap:10px;margin-top:14px">
      <button class="btn primary" onclick="FK.show('s-dash')">Auswertung ansehen</button>
      <button class="btn light" onclick="FK.show('s-pos')">Selbst kassieren</button></div>`;
}
async function refreshAdminKpis() {
  try {
    S.stats = await S.api.stats(S.event.id);
    const k = $('adm-kpis');
    if (k) { const v = k.querySelectorAll('.val'); v[0].textContent = fmt(S.stats.revenue_cents, 0); v[1].textContent = S.stats.orders; }
    if (S.admTab === 'helpers' && current() === 's-admin') document.querySelectorAll('[data-hrev]').forEach((el) => {
      const h = S.stats.helpers.find((x) => x.name === el.dataset.hrev);
      el.textContent = h ? `${h.orders} Bestellungen · ${chf(h.cents, 0)}` : 'Noch keine Verkäufe';
    });
  } catch { /* offline */ }
}

function admProducts() {
  const cats = S.categories.map((c) => {
    const list = S.products.filter((p) => p.category_id === c.id);
    return `<div class="card">
      <div class="card-head"><h3>${esc(c.name)} <small>${list.length}</small></h3><button class="add-link" onclick="FK.editProduct(null,'${c.id}')">+ Produkt</button></div>
      ${list.map((p) => `<div class="item ${p.sold_out ? 'dim' : ''}">
          <button class="thumb" onclick="FK.editProduct('${p.id}')" aria-label="${attr(p.name)} bearbeiten">${tile(p, true)}</button>
          <button class="it" style="text-align:left" onclick="FK.editProduct('${p.id}')"><b>${esc(p.name)}</b><span class="num">${chf(p.price_cents)}${p.sold_out ? ' · ausverkauft' : ''}</span></button>
          <label class="switch" title="Verfügbar"><input type="checkbox" ${p.sold_out ? '' : 'checked'} onchange="FK.toggleSoldOut('${p.id}',!this.checked)" aria-label="${attr(p.name)} verfügbar"><span></span></label>
          <button class="del-btn" onclick="FK.askDelete('${p.id}')" aria-label="${attr(p.name)} löschen">${ICON_TRASH}</button>
        </div>`).join('') || '<div class="empty">Noch keine Produkte in dieser Kategorie</div>'}
      <div class="row-actions"><button class="btn ghost sm" onclick="FK.renameCategory('${c.id}')">Umbenennen</button>${list.length ? '' : `<button class="btn ghost sm" onclick="FK.deleteCategory('${c.id}')">Entfernen</button>`}</div>
    </div>`;
  }).join('');
  const orphans = S.products.filter((p) => !S.categories.some((c) => c.id === p.category_id));
  return `<div class="hint-box" style="margin-top:6px">Schalter = vorübergehend ausverkauft. Papierkorb = Produkt ganz aus der Kasse entfernen.</div>
    <div class="card"><div class="setrow" style="border:0;padding:0"><div class="st"><b>Ausverkaufte ausblenden</b><span>Ausverkaufte Produkte erscheinen nicht in der Kasse</span></div>
      <label class="switch"><input type="checkbox" ${S.event.hide_out ? 'checked' : ''} onchange="FK.setEvent({hide_out:this.checked})" aria-label="Ausverkaufte ausblenden"><span></span></label></div></div>
    ${cats}
    ${orphans.length ? `<div class="card"><h3>Ohne Kategorie</h3>${orphans.map((p) => `<div class="item"><button class="thumb" onclick="FK.editProduct('${p.id}')">${tile(p, true)}</button><button class="it" style="text-align:left" onclick="FK.editProduct('${p.id}')"><b>${esc(p.name)}</b><span>Erscheint nicht in der Kasse</span></button></div>`).join('')}</div>` : ''}
    <div style="display:grid;gap:10px;margin-top:14px">
      <button class="btn light" onclick="FK.addCategory()">+ Kategorie hinzufügen</button>
      <button class="btn light" onclick="FK.askSamples()">Beispielprodukte übernehmen</button></div>`;
}
function admHelpers() {
  const list = S.helpers.filter((h) => h.name !== 'Verwaltung').sort((a, b) => a.name.localeCompare(b.name));
  return `${joinCard('Neue Helfer einladen')}
    <div class="card"><div class="card-head"><h3>Helfer <small>${list.length}</small></h3><button class="add-link" onclick="FK.addHelper()">+ Helfer</button></div>
      ${list.map((h) => `<div class="item">
        <div class="avatar" style="${h.blocked ? 'background:var(--danger-soft);color:var(--danger)' : ''}">${esc(h.name[0])}</div>
        <div class="it"><b>${esc(h.name)}</b><span class="num" data-hrev="${attr(h.name)}">…</span></div>
        <button class="pill ${h.blocked ? 'off' : 'ok'}" style="height:34px;padding:0 12px" onclick="FK.toggleBlock('${h.id}')">${h.blocked ? 'Gesperrt' : 'Aktiv'}</button>
      </div>`).join('') || '<div class="empty">Noch keine Helfer. Teile den QR-Code oder bereite Namen vor.</div>'}
    </div>
    <p class="small-note" style="margin:12px 4px">Tippe auf «Aktiv», um einen Zugang zu sperren, zum Beispiel wenn ein Handy verloren geht. Das Handy verliert den Zugang sofort; bereits erfasste Verkäufe bleiben erhalten.</p>`;
}
function admSettings() {
  const m = methodsOn(); const px = S.payrexx;
  const twintReady = S.mode === 'demo' || px?.configured;
  return `<div class="card" style="margin-top:6px"><h3>Event</h3>
      <form class="form" onsubmit="event.preventDefault();FK.saveEventForm()">
        <div class="field"><label for="set-name">Name des Events</label><input class="input" id="set-name" value="${attr(S.event.name)}" maxlength="80"></div>
        <div class="two"><div class="field"><label for="set-date">Datum</label><input class="input" id="set-date" type="date" value="${attr(S.event.date)}"></div>
          <div class="field"><label for="set-place">Ort</label><input class="input" id="set-place" value="${attr(S.event.place)}" maxlength="80"></div></div>
        <button class="btn dark sm" type="submit">Speichern</button></form></div>
    <div class="card"><h3>Zahlungsarten</h3>
      <div class="setrow"><div style="transform:scale(.8);margin:-5px;flex:none">${METHOD.twint.icon}</div>
        <div class="st"><b>TWINT</b><span>${twintReady ? 'Über Payrexx, Geld geht direkt aufs Vereinskonto' : 'Zuerst unten die Payrexx-Zugangsdaten eintragen'}</span></div>
        <label class="switch"><input type="checkbox" ${m.twint ? 'checked' : ''} ${!twintReady && !m.twint ? 'disabled' : ''} onchange="FK.toggleMethod('twint',this.checked)" aria-label="TWINT"><span></span></label></div>
      <div class="setrow"><div style="transform:scale(.8);margin:-5px;flex:none">${METHOD.cash.icon}</div>
        <div class="st"><b>Bar</b><span>Mit Rückgeld-Rechner</span></div>
        <label class="switch"><input type="checkbox" ${m.cash ? 'checked' : ''} onchange="FK.toggleMethod('cash',this.checked)" aria-label="Bar"><span></span></label></div>
    </div>
    <div class="card"><div class="card-head"><h3>Payrexx (für TWINT)</h3><span class="pill ${px?.configured ? 'ok' : 'neutral'}">${px?.configured ? 'Verbunden' : 'Nicht eingerichtet'}</span></div>
      <form class="form" style="margin-top:10px" onsubmit="event.preventDefault();FK.savePayrexx()">
        <div class="field"><label for="px-inst">Instanz-Name</label><input class="input" id="px-inst" placeholder="z. B. turnverein-rafz" value="${attr(px?.instance ?? '')}" autocapitalize="off" autocomplete="off"></div>
        <div class="field"><label for="px-secret">API-Secret</label><input class="input" id="px-secret" type="password" placeholder="${px?.configured ? 'gespeichert – nur zum Ändern ausfüllen' : 'aus Payrexx → Integrationen → API'}" autocomplete="off"></div>
        <p class="small-note">Den Instanz-Namen siehst du in der Adresse deines Payrexx-Kontos: <b>name</b>.payrexx.com. Das Secret wird verschlüsselt übertragen und ist danach in der App für niemanden mehr sichtbar.</p>
        <button class="btn dark sm" type="submit">Payrexx speichern</button></form></div>
    <div class="card"><h3>Verkauf</h3>
      <div class="setrow"><div class="st"><b>Event offen</b><span>Wenn aus, können Helfer weder beitreten noch kassieren</span></div>
        <label class="switch"><input type="checkbox" ${S.event.open ? 'checked' : ''} onchange="FK.setEvent({open:this.checked})" aria-label="Event offen"><span></span></label></div>
      <div class="setrow"><div class="st"><b>Ausverkaufte ausblenden</b><span>Statt grau anzeigen</span></div>
        <label class="switch"><input type="checkbox" ${S.event.hide_out ? 'checked' : ''} onchange="FK.setEvent({hide_out:this.checked})" aria-label="Ausverkaufte ausblenden"><span></span></label></div></div>
    <div style="display:grid;gap:10px;margin-top:14px">
      <button class="btn light" onclick="FK.exportCsv()">Bestellungen als CSV exportieren</button>
      <button class="btn light" onclick="FK.askNewEvent()">Neues Event starten</button>
      ${S.mode === 'demo' ? '<button class="btn light" onclick="FK.resetDemo()">Demo zurücksetzen</button>' : ''}
      <button class="btn danger-soft" onclick="FK.logout()">Abmelden</button></div>`;
}

async function run(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); }
  catch (e) { toast(errMsg(e), 3500); }
  await loadEvent(S.event.id).catch(() => {});
  if (current() === 's-admin') renderAdmin();
}
const setEvent = (patch) => run(() => S.api.updateEvent(S.event.id, patch),
  'open' in patch ? (patch.open ? 'Event ist offen' : 'Event geschlossen') : 'Gespeichert');
function toggleMethod(k, on) {
  const m = { ...methodsOn(), [k]: on };
  if (!m.twint && !m.cash) { toast('Mindestens eine Zahlungsart muss aktiv sein'); return renderAdmin(); }
  return run(() => S.api.updateEvent(S.event.id, { methods: m }), `${METHOD[k].label} ${on ? 'aktiviert' : 'deaktiviert'}`);
}
function saveEventForm() {
  const name = $('set-name').value.trim();
  if (name.length < 2) return toast('Das Event braucht einen Namen');
  return run(() => S.api.updateEvent(S.event.id, { name, date: $('set-date').value || S.event.date, place: $('set-place').value.trim() }), 'Gespeichert');
}
async function savePayrexx() {
  const inst = $('px-inst').value.trim().replace(/\.payrexx\.com.*$/, '').replace(/^https?:\/\//, '');
  const secret = $('px-secret').value.trim();
  if (!inst) return toast('Bitte den Instanz-Namen eintragen');
  if (!secret && !S.payrexx?.configured) return toast('Bitte das API-Secret eintragen');
  try {
    await S.api.setPayrexx(S.club.id, inst, secret || null);
    S.payrexx = await S.api.payrexxStatus(S.club.id);
    toast('Payrexx gespeichert'); renderAdmin();
  } catch (e) { toast(errMsg(e), 3500); }
}
const toggleSoldOut = (id, out) => { const p = prod(id); return run(() => S.api.saveProduct({ ...p, sold_out: out }), out ? `${p.name} ausverkauft` : `${p.name} wieder verfügbar`); };
function askDelete(id) {
  const p = prod(id);
  openSheet(`<h3>${esc(p.name)} löschen?</h3><p>Das Produkt verschwindet aus der Kasse. Bereits verkaufte Mengen bleiben in der Auswertung.</p>
    <div class="btns"><button class="btn danger" onclick="FK.closeSheet();FK.deleteProduct('${id}')">Löschen</button><button class="btn light" onclick="FK.closeSheet()">Abbrechen</button></div>`);
}
const deleteProduct = (id) => { const n = prod(id)?.name; return run(() => S.api.deleteProduct(id), `${n} gelöscht`); };
const toggleBlock = (id) => { const h = S.helpers.find((x) => x.id === id); return run(() => S.api.setHelperBlocked(id, !h.blocked), h.blocked ? `${h.name} wieder aktiv` : `Zugang von ${h.name} gesperrt`); };
function copyJoin() {
  const t = joinUrl();
  const done = () => toast('Link kopiert');
  try { navigator.clipboard.writeText(t).then(done, () => toast(t, 5000)); } catch { toast(t, 5000); }
}
function askNewCode() {
  openSheet(`<h3>Neuen Code erzeugen?</h3><p>Der alte Code und QR-Code funktionieren danach nicht mehr. Helfer, die schon beigetreten sind, können weiter kassieren.</p>
    <div class="btns"><button class="btn primary" onclick="FK.closeSheet();FK.newCode()">Neuen Code erzeugen</button><button class="btn light" onclick="FK.closeSheet()">Abbrechen</button></div>`);
}
const newCode = () => run(() => S.api.regenerateCode(S.event.id), 'Neuer Code erstellt');
function inputSheet(title, text, label, value, onSave) {
  openSheet(`<h3>${title}</h3><p>${text}</p><form class="form" onsubmit="event.preventDefault();FK._sheetSave()">
    <div class="field"><label for="sheet-in">${label}</label><input class="input" id="sheet-in" maxlength="40" value="${attr(value)}"></div>
    <div class="btns" style="margin-top:4px"><button class="btn primary" type="submit">Speichern</button><button class="btn light" type="button" onclick="FK.closeSheet()">Abbrechen</button></div></form>`);
  FK._sheetSave = () => { const v = $('sheet-in').value.trim(); if (!v) return; closeSheet(); onSave(v); };
  setTimeout(() => $('sheet-in').focus(), 80);
}
const addCategory = () => inputSheet('Neue Kategorie', 'Zum Beispiel «Dessert», «Bar» oder «Tombola».', 'Name', '',
  (n) => run(() => S.api.saveCategory({ event_id: S.event.id, name: n, sort: S.categories.length + 1 }), `Kategorie «${n}» angelegt`));
const renameCategory = (id) => { const c = S.categories.find((x) => x.id === id); inputSheet('Kategorie umbenennen', '', 'Name', c.name, (n) => run(() => S.api.saveCategory({ ...c, name: n }), 'Gespeichert')); };
const deleteCategory = (id) => run(() => S.api.deleteCategory(id), 'Kategorie entfernt');
const addHelper = () => inputSheet('Helfer vorbereiten', 'Der Name erscheint beim Beitreten zur Auswahl. So vermeidest du Tippfehler in der Auswertung.', 'Vorname', '',
  (n) => run(() => S.api.addHelper(S.event.id, n.charAt(0).toUpperCase() + n.slice(1)), `${n} hinzugefügt`));
function askNewEvent() {
  openSheet(`<h3>Neues Event starten</h3><p>Das aktuelle Event wird abgeschlossen und archiviert. Seine Auswertung bleibt erhalten.</p>
    <form class="form" onsubmit="event.preventDefault();FK.newEvent()">
      <div class="field"><label for="ne-name">Name</label><input class="input" id="ne-name" maxlength="80" placeholder="z. B. Chilbi 2027"></div>
      <div class="two"><div class="field"><label for="ne-date">Datum</label><input class="input" id="ne-date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field"><label for="ne-place">Ort</label><input class="input" id="ne-place" value="${attr(S.event.place)}"></div></div>
      <div class="setrow" style="border:0;padding:0"><div class="st"><b>Produkte übernehmen</b><span>Kategorien, Produkte und Preise kopieren</span></div>
        <label class="switch"><input type="checkbox" id="ne-copy" checked><span></span></label></div>
      <div class="btns"><button class="btn primary" type="submit">Event starten</button><button class="btn light" type="button" onclick="FK.closeSheet()">Abbrechen</button></div></form>`);
}
async function newEvent() {
  const name = $('ne-name').value.trim();
  if (name.length < 2) return toast('Bitte einen Namen eingeben');
  try {
    const id = await S.api.startEvent(S.club.id, name, $('ne-date').value, $('ne-place').value.trim(), $('ne-copy').checked ? S.event.id : null);
    closeSheet(); await loadEvent(id); subscribe(); S.admTab = 'event'; renderAdmin(); toast('Neues Event gestartet');
  } catch (e) { toast(errMsg(e), 3500); }
}
function askSamples() {
  openSheet(`<h3>Beispielprodukte übernehmen?</h3><p>Fügt ${LIBRARY.length} Getränke und Speisen mit Bildern hinzu (Bier, Bratwurst, Pommes …). Preise und Namen kannst du danach anpassen, Unpassendes löschen.</p>
    <div class="btns"><button class="btn primary" onclick="FK.closeSheet();FK.addSamples()">Übernehmen</button><button class="btn light" onclick="FK.closeSheet()">Abbrechen</button></div>`);
}
async function addSamples() {
  await run(async () => {
    const catId = {};
    for (const name of [...new Set(LIBRARY.map((l) => l.cat))]) {
      let c = S.categories.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!c) c = await S.api.saveCategory({ event_id: S.event.id, name, sort: S.categories.length + 1 });
      catId[name] = c.id;
    }
    const have = new Set(S.products.map((p) => p.name.toLowerCase()));
    const rows = LIBRARY.filter((l) => !have.has(l.name.toLowerCase())).map((l, i) => ({
      event_id: S.event.id, category_id: catId[l.cat], name: l.name, sub: l.sub, price_cents: l.price, icon: '🍽️', photo_url: libraryUrl(l.key), sort: 100 + i,
    }));
    if (rows.length) await S.api.insertProducts(rows);
  }, 'Beispielprodukte übernommen');
}
async function exportCsv() {
  try {
    const orders = await S.api.listOrders(S.event.id);
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Nr', 'Datum', 'Zeit', 'Helfer', 'Zahlart', 'Status', 'Betrag CHF', 'Artikel'].map(q).join(';')];
    orders.forEach((o) => lines.push([o.no, new Date(o.created_at).toLocaleDateString('de-CH'), timeStr(o.created_at), o.helper_name,
      METHOD[o.method]?.label ?? o.method, { paid: 'bezahlt', pending: 'offen', cancelled: 'abgebrochen', failed: 'fehlgeschlagen' }[o.status],
      (o.total_cents / 100).toFixed(2), o.items.map((i) => `${i.qty}x ${i.name}`).join(', ')].map(q).join(';')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${S.event.name.replace(/[^\w\- ]+/g, '')}_Bestellungen.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { toast(errMsg(e), 3500); }
}
async function resetDemo() { S.api.resetDemo?.(); store.set('fk-helper', null); store.set('fk-queue', null); location.reload(); }

// Produkt-Editor
function editProduct(id, catId) {
  const p = id ? prod(id) : null;
  S.editing = p ? { ...p } : { id: null, event_id: S.event.id, name: '', sub: '', price_cents: '', category_id: catId || S.categories[0]?.id, icon: '🍽️', photo_url: null, sold_out: false };
  S.editing._lib = false;
  renderEditor(); $('modal').classList.add('open');
}
function syncEditor() {
  const e = S.editing; if (!$('pe-name')) return;
  e.name = $('pe-name').value; e.sub = $('pe-sub').value; e._price = $('pe-price').value; e.sold_out = !$('pe-avail').checked;
}
function renderEditor() {
  const e = S.editing;
  const price = e._price ?? (e.price_cents ? (e.price_cents / 100).toFixed(2) : '');
  $('sheet').innerHTML = `<div class="grab"></div><h3>${e.id ? 'Produkt bearbeiten' : 'Neues Produkt'}</h3>
    <div class="form" style="margin-top:14px">
      <div class="field"><label>Bild</label><div class="photo-row"><div class="prev">${tile(e)}</div><div class="acts">
        <label class="btn soft sm file-btn" id="pe-upl">Foto hochladen<input type="file" accept="image/*" onchange="FK.loadPhoto(this)"></label>
        <button class="btn light sm" type="button" onclick="FK.editorLib()">Aus Bibliothek</button>
        ${e.photo_url ? '<button class="btn ghost sm" type="button" onclick="FK.editorSet({photo_url:null})">Foto entfernen</button>' : ''}
      </div></div></div>
      ${e._lib ? `<div class="lib-grid">${LIBRARY.map((l) => `<button type="button" class="${e.photo_url === libraryUrl(l.key) ? 'sel' : ''}" onclick="FK.pickLib('${l.key}')"><img src="${libraryUrl(l.key)}" alt="${attr(l.name)}" loading="lazy"></button>`).join('')}</div>` : ''}
      ${e.photo_url ? '' : `<div class="field"><label>Symbol (wenn kein Foto)</label><div class="icon-grid">${EMOJIS.map((i) => `<button type="button" class="${i === e.icon ? 'sel' : ''}" onclick="FK.editorSet({icon:'${i}'})">${i}</button>`).join('')}</div></div>`}
      <div class="field"><label for="pe-name">Name</label><input class="input" id="pe-name" value="${attr(e.name)}" maxlength="40" placeholder="z. B. Weisswein"></div>
      <div class="field"><label for="pe-sub">Beschreibung (optional)</label><input class="input" id="pe-sub" value="${attr(e.sub)}" maxlength="40" placeholder="z. B. 1 dl, Rafzer Riesling"></div>
      <div class="field"><label for="pe-price">Preis</label><div class="price-wrap"><span>CHF</span><input class="input num" id="pe-price" inputmode="decimal" value="${attr(price)}" placeholder="0.00"></div></div>
      <div class="field"><label>Kategorie</label><div class="chips">${S.categories.map((c) => `<button type="button" class="chip ${c.id === e.category_id ? 'sel' : ''}" onclick="FK.editorSet({category_id:'${c.id}'})">${esc(c.name)}</button>`).join('')}</div></div>
      <div class="setrow" style="border:0;padding:4px 0"><div class="st"><b>Verfügbar</b><span>Aus = ausverkauft</span></div>
        <label class="switch"><input type="checkbox" id="pe-avail" ${e.sold_out ? '' : 'checked'} aria-label="Verfügbar"><span></span></label></div>
      <div class="err-msg" id="pe-err"></div></div>
    <div class="btns" style="margin-top:6px">
      <button class="btn primary" id="pe-save" onclick="FK.saveEditor()">Speichern</button>
      ${e.id ? `<button class="btn danger-soft" onclick="FK.askDelete('${e.id}')">Produkt löschen</button>` : ''}
      <button class="btn ghost" onclick="FK.closeSheet()">Abbrechen</button></div>`;
}
function editorSet(patch) { syncEditor(); Object.assign(S.editing, patch); renderEditor(); }
function editorLib() { syncEditor(); S.editing._lib = !S.editing._lib; renderEditor(); }
function pickLib(key) {
  syncEditor(); const l = LIBRARY.find((x) => x.key === key); const e = S.editing;
  e.photo_url = libraryUrl(key); e._lib = false;
  if (!e.name.trim()) { e.name = l.name; e.sub = l.sub; e._price = (l.price / 100).toFixed(2); }
  renderEditor();
}
async function loadPhoto(input) {
  const f = input.files?.[0]; if (!f) return;
  syncEditor();
  const lbl = $('pe-upl'); lbl.innerHTML = '<span class="spin" style="border-color:rgba(61,90,254,.25);border-top-color:var(--accent)"></span>';
  try {
    const blob = await compressImage(f);
    S.editing.photo_url = await S.api.uploadPhoto(S.club.id, blob);
  } catch (e) { toast('Foto konnte nicht gespeichert werden: ' + errMsg(e), 3500); }
  renderEditor();
}
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Weissen Rand wegschneiden, quadratisch auf 480 px verkleinern
      const tw = 200, th = Math.max(1, Math.round(200 * img.height / img.width));
      const t = document.createElement('canvas'); t.width = tw; t.height = th;
      const tc = t.getContext('2d'); tc.drawImage(img, 0, 0, tw, th);
      const d = tc.getImageData(0, 0, tw, th).data; let x0 = tw, y0 = th, x1 = 0, y1 = 0;
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { const i = (y * tw + x) * 4; if (d[i] < 238 || d[i + 1] < 238 || d[i + 2] < 238) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
      if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = tw - 1; y1 = th - 1; }
      const k = img.width / tw; let sx = x0 * k, sy = y0 * k; const sw = (x1 - x0 + 1) * k, sh = (y1 - y0 + 1) * k, sz = Math.min(sw, sh);
      sx += (sw - sz) / 2; sy += (sh - sz) / 2;
      const c = document.createElement('canvas'); c.width = c.height = 480;
      c.getContext('2d').drawImage(img, sx, sy, sz, sz, 0, 0, 480, 480);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild unlesbar'))), 'image/jpeg', 0.84);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Bild unlesbar'));
    img.src = URL.createObjectURL(file);
  });
}
async function saveEditor() {
  syncEditor(); const e = S.editing;
  const price = parseFloat(String(e._price ?? '').replace(',', '.'));
  if (!e.name.trim()) { $('pe-err').textContent = 'Bitte gib einen Namen ein.'; return; }
  if (!(price >= 0.05 && price <= 999)) { $('pe-err').textContent = 'Bitte gib einen Preis zwischen 0.05 und 999 ein.'; return; }
  if (!e.category_id) { $('pe-err').textContent = 'Bitte zuerst eine Kategorie anlegen.'; return; }
  const btn = $('pe-save'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  const row = { id: e.id, event_id: S.event.id, category_id: e.category_id, name: e.name.trim(), sub: e.sub.trim(),
    price_cents: Math.round(price * 20) * 5, icon: e.icon, photo_url: e.photo_url, sold_out: e.sold_out, sort: e.sort ?? S.products.length };
  try {
    await S.api.saveProduct(row); closeSheet();
    await run(async () => {}, e.id ? 'Produkt gespeichert' : `${row.name} hinzugefügt`);
  } catch (err) { btn.disabled = false; btn.textContent = 'Speichern'; $('pe-err').textContent = errMsg(err); }
}

// ---------------------------------------------------------------------
// Kasse
// ---------------------------------------------------------------------
function cardHTML(p) {
  const q = S.cart[p.id] || 0;
  if (p.sold_out) return `<div class="p-card out" aria-disabled="true"><div class="p-img">${tile(p)}<div class="out-badge">AUSVERKAUFT</div></div>
    <div class="p-info"><div class="p-name">${esc(p.name)}</div><div class="p-sub">${esc(p.sub) || '&nbsp;'}</div><div class="p-price num">${chf(p.price_cents)}</div></div>
    <div class="p-foot"><div class="add-pill out">Nicht verfügbar</div></div></div>`;
  return `<div class="p-card ${q ? 'has' : ''}" onclick="FK.add('${p.id}')" role="button" aria-label="${attr(p.name)} hinzufügen">
    <div class="p-img">${tile(p)}${q ? `<div class="badge num">${q}</div>` : ''}</div>
    <div class="p-info"><div class="p-name">${esc(p.name)}</div><div class="p-sub">${esc(p.sub) || '&nbsp;'}</div><div class="p-price num">${chf(p.price_cents)}</div></div>
    <div class="p-foot" onclick="event.stopPropagation()">${q
      ? `<div class="stepper"><button onclick="FK.removeOne('${p.id}')" aria-label="Weniger">−</button><span class="q num">${q}</span><button onclick="FK.add('${p.id}')" aria-label="Mehr">+</button></div>`
      : `<button class="add-pill" onclick="FK.add('${p.id}')"><span style="font-size:20px;line-height:0">+</span> Hinzufügen</button>`}</div></div>`;
}
function renderPOS() {
  if (!S.event) { $('s-pos').innerHTML = topBar('FestKasse', 'Keine Verbindung') + '<div class="pos-body"><div class="card empty">Warte auf Verbindung …</div></div>'; return; }
  const who = isAdmin() ? 'Verwaltung' : S.helper?.name ?? '';
  const queue = store.get('fk-queue', []).length, failed = store.get('fk-queue-failed', []).length;
  let body = '';
  if (!S.event.open) body += '<div class="banner">Das Event ist geschlossen. Kassieren ist erst wieder möglich, wenn der Verein es öffnet.</div>';
  if (queue) body += `<div class="queue-pill">⏳ ${queue} Barbestellung${queue > 1 ? 'en' : ''} warten auf Internet</div>`;
  if (failed) body += `<button class="banner" style="width:100%;text-align:left" onclick="FK.showFailed()">⚠︎ ${failed} Offline-Bestellung${failed > 1 ? 'en' : ''} konnte nicht verbucht werden. Antippen für Details.</button>`;
  for (const c of S.categories) {
    const list = S.products.filter((p) => p.category_id === c.id && !(S.event.hide_out && p.sold_out));
    if (!list.length) continue;
    const n = list.reduce((s, p) => s + (S.cart[p.id] || 0), 0);
    body += `<div class="section-h"><h2>${esc(c.name)}</h2><span>${n ? n + ' im Warenkorb' : ''}</span></div><div class="grid">${list.map(cardHTML).join('')}</div>`;
  }
  if (!S.products.length) body += `<div class="card empty">Noch keine Produkte. ${isAdmin() ? 'Lege sie in der Verwaltung an.' : 'Der Verein legt sie in der Verwaltung an.'}</div>`;
  const n = cartCount();
  $('s-pos').innerHTML = topBar(S.event.name, esc(S.club?.name ?? who)) + `<div class="pos-body">${body}</div>
    <div class="cartbar ${n ? '' : 'empty'}"><div class="cartbar-inner">
      <div class="cart-info"><div class="l1">${n ? `${n} Artikel` : `${esc(who)} · Produkt antippen`}</div><div class="l2 num">${chf(cartTotal())}</div></div>
      <button class="cart-clear" onclick="FK.clearCart()" aria-label="Warenkorb leeren">${ICON_TRASH}</button>
      <button class="pay-btn" onclick="FK.openPay()" ${n && S.event.open ? '' : 'disabled'}>Bezahlen</button></div></div>`;
  if (!isAdmin() && S.helper) $('s-pos').querySelector('.top p').textContent = [S.helper.name, S.helper.club].filter(Boolean).join(' · ');
}
function add(id) { const p = prod(id); if (!p || p.sold_out) return; S.cart[id] = (S.cart[id] || 0) + 1; haptic(); renderPOS(); }
function removeOne(id) { if (!S.cart[id]) return; if (--S.cart[id] <= 0) delete S.cart[id]; haptic(); renderPOS(); }
function clearCart() { S.cart = {}; renderPOS(); toast('Warenkorb geleert'); }

// ---------------------------------------------------------------------
// Zahlung
// ---------------------------------------------------------------------
function openPay() {
  if (!cartCount() || !S.event.open) return;
  S.pay = { method: null, cashGiven: null, orderId: null, state: null, link: null, error: null, timer: null };
  show('s-pay'); renderPay();
}
function renderPay() {
  const t = cartTotal(), p = S.pay, m = methodsOn();
  let inner = '';
  if (!p.method) {
    const avail = ['twint', 'cash'].filter((k) => m[k]);
    inner = `<details class="summary"><summary><span>${cartCount()} Artikel anzeigen</span><svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg></summary>
        ${Object.entries(S.cart).map(([id, q]) => `<div class="row"><span>${q}× ${esc(prod(id)?.name)}</span><b class="num">${chf(prod(id).price_cents * q)}</b></div>`).join('')}</details>
      <div class="methods">${avail.map((k) => `<button class="method" onclick="FK.chooseMethod('${k}')">${METHOD[k].icon}<div class="m-txt"><b>${METHOD[k].label}</b><span>${METHOD[k].sub}</span></div>${ICON_CHEV}</button>`).join('')}</div>`;
  } else if (p.method === 'twint') {
    if (p.state === 'creating') inner = `<div class="panel show"><h3>TWINT wird vorbereitet</h3><div class="wait"><span class="spin"></span> Einen Moment …</div></div>`;
    else if (p.state === 'waiting') inner = `<div class="panel show">
        <h3>Mit der Handy-Kamera scannen</h3><div class="sub num">${chf(t)} · danach mit TWINT bestätigen</div>
        <div class="qr-pay">${qrSvg(p.link, 'M', 1)}</div>
        <div class="wait"><span class="spin"></span> Warte auf Zahlung …</div>
        <div class="spacer"></div>
        ${S.mode === 'demo' ? '<button class="btn primary" onclick="FK.demoPaid()">Demo: Gast hat bezahlt</button>' : ''}
        <button class="btn ghost" onclick="FK.cancelTwint()">Abbrechen</button></div>`;
    else inner = `<div class="panel show"><h3>Zahlung nicht abgeschlossen</h3>
        <div class="state-box err" style="margin-top:12px">${esc(p.error || 'Die TWINT-Zahlung wurde abgebrochen oder abgelehnt.')}</div>
        <div class="spacer"></div>
        <button class="btn primary" onclick="FK.chooseMethod('twint')">Nochmals versuchen</button>
        <button class="btn ghost" onclick="FK.backToMethods()">Andere Zahlungsart</button></div>`;
  } else {
    const opts = [t];
    [Math.ceil(t / 500) * 500, Math.ceil(t / 1000) * 1000, 2000, 5000, 10000, 20000].forEach((v) => { if (v > t && !opts.includes(v) && opts.length < 6) opts.push(v); });
    opts.sort((a, b) => a - b);
    if (p.cashGiven == null || !opts.includes(p.cashGiven)) p.cashGiven = t;
    inner = `<div class="panel show"><div class="cash-card"><div class="lbl">Erhaltener Betrag</div>
        <div class="cash-chips">${opts.map((v) => `<button class="chip num ${v === p.cashGiven ? 'sel' : ''}" onclick="FK.setCash(${v})">${v === t ? 'Passend' : fmt(v, v % 100 ? 2 : 0)}</button>`).join('')}</div>
        <div class="change"><span>Rückgeld</span><b class="num">${chf(p.cashGiven - t)}</b></div></div>
      <div class="spacer"></div>
      <button class="btn success" id="cash-btn" onclick="FK.confirmCash()">Barzahlung bestätigen</button>
      <button class="btn ghost" onclick="FK.backToMethods()">Andere Zahlungsart</button></div>`;
  }
  const title = !p.method ? 'Zahlungsart wählen' : p.method === 'twint' ? 'TWINT' : 'Barzahlung';
  $('s-pay').innerHTML = `<div class="pay-wrap">
    <div class="pay-top"><button class="icon-btn" onclick="FK.payBack()" aria-label="Zurück">${ICON_BACK}</button><div class="ttl">${title}</div><div style="width:44px"></div></div>
    <div class="amount"><div class="lbl">Zu bezahlen</div><div class="big num"><small>CHF</small>${fmt(t)}</div></div>${inner}</div>`;
}
function stopPoll() { clearInterval(S.pay?.timer); if (S.pay) S.pay.timer = null; }
async function payBack() {
  if (S.pay?.method === 'twint' && S.pay.state === 'waiting') return cancelTwint();
  if (S.pay?.method) return backToMethods();
  stopPoll(); S.pay = null; show('s-pos');
}
function backToMethods() { stopPoll(); Object.assign(S.pay, { method: null, state: null, orderId: null, link: null, error: null }); renderPay(); }
function chooseMethod(k) {
  S.pay.method = k;
  if (k === 'twint') return startTwint();
  renderPay();
}
function orderItems() { return Object.entries(S.cart).map(([product_id, qty]) => ({ product_id, qty })); }
function handleOrderError(e) {
  if (/gesperrt/i.test(e.message) && !isAdmin()) { lostAccess(); return; }
  toast(errMsg(e), 4000);
  if (/ausverkauft|gibt es nicht mehr|geschlossen/i.test(e.message)) { loadEvent(S.event.id).then(() => { S.pay = null; show('s-pos'); }); }
}
async function startTwint() {
  if (!navigator.onLine) { S.pay.method = null; toast('TWINT braucht Internet. Bitte bar kassieren.'); return renderPay(); }
  Object.assign(S.pay, { state: 'creating', orderId: crypto.randomUUID(), error: null }); renderPay();
  try {
    const order = await S.api.createOrder({ id: S.pay.orderId, event_id: S.event.id, items: orderItems(), method: 'twint' });
    S.pay.order = order;
    const r = await S.api.twintCreate(order.id);
    if (!S.pay || S.pay.orderId !== order.id) return;
    if (r.status === 'paid') return finishOrder(order);
    Object.assign(S.pay, { state: 'waiting', link: r.link }); renderPay();
    S.pay.started = Date.now();
    S.pay.timer = setInterval(() => pollTwint(), 2500);
  } catch (e) {
    if (!S.pay) return;
    if (S.pay.orderId) S.api.cancelOrder(S.pay.orderId).catch(() => {});
    if (/gesperrt|ausverkauft|gibt es nicht mehr|geschlossen/i.test(e.message)) { S.pay.method = null; renderPay(); return handleOrderError(e); }
    Object.assign(S.pay, { state: 'failed', error: errMsg(e) }); renderPay();
  }
}
async function pollTwint(immediate) {
  const p = S.pay; if (!p || p.state !== 'waiting' || p.polling) return;
  p.polling = true;
  try {
    const r = await S.api.twintStatus(p.orderId);
    if (S.pay !== p) return;
    if (r.status === 'paid') { stopPoll(); finishOrder({ ...p.order, status: 'paid' }); }
    else if (r.status === 'failed' || r.status === 'cancelled') { stopPoll(); Object.assign(p, { state: 'failed', error: 'Die TWINT-Zahlung wurde abgebrochen oder abgelehnt.' }); renderPay(); }
  } catch { /* nächster Versuch */ } finally { p.polling = false; }
  if (!immediate && p.started && Date.now() - p.started > 10 * 60000) { stopPoll(); cancelTwint(true); }
}
async function demoPaid() { await S.api.demoConfirm?.(S.pay.orderId); pollTwint(true); }
async function cancelTwint(timeout) {
  const p = S.pay; stopPoll();
  if (p?.orderId) {
    // Zuerst prüfen, ob doch schon bezahlt wurde
    try { const r = await S.api.twintStatus(p.orderId); if (r.status === 'paid') return finishOrder({ ...p.order, status: 'paid' }); } catch { /* */ }
    S.api.cancelOrder(p.orderId).catch(() => {});
  }
  backToMethods();
  if (timeout) toast('Zahlung nach 10 Minuten abgebrochen');
}
function setCash(v) { S.pay.cashGiven = v; haptic(); renderPay(); }
async function confirmCash() {
  const btn = $('cash-btn'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Wird erfasst …';
  const o = { id: crypto.randomUUID(), event_id: S.event.id, items: orderItems(), method: 'cash', cash_given_cents: S.pay.cashGiven };
  try {
    const order = await S.api.createOrder(o);
    finishOrder(order);
  } catch (e) {
    if (e.network) {
      const q = store.get('fk-queue', []); q.push({ ...o, total_cents: cartTotal(), created: Date.now(), names: Object.entries(S.cart).map(([id, n]) => `${n}× ${prod(id)?.name}`).join(', ') });
      store.set('fk-queue', q);
      finishOrder({ total_cents: cartTotal(), method: 'cash', no: null, offline: true, cash_given_cents: S.pay.cashGiven, created_at: new Date().toISOString() });
    } else { btn.disabled = false; btn.textContent = 'Barzahlung bestätigen'; handleOrderError(e); }
  }
}
function finishOrder(order) {
  const count = cartCount(); const given = order.cash_given_cents;
  S.cart = {}; stopPoll(); S.pay = null;
  const m = METHOD[order.method];
  $('s-success').innerHTML = `<div class="success-wrap" onclick="FK.stopAuto()">
    <div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
    <div class="s-amt num">${chf(order.total_cents)} bezahlt</div>
    <div class="s-no">${order.no ? `Bestellung #${order.no}` : 'Offline gespeichert · Nummer folgt'}</div>
    <div class="s-meta"><span class="tag" style="background:${m.soft};color:${m.color}">${m.label}</span> ${count} Artikel · ${timeStr(order.created_at || Date.now())}${given > order.total_cents ? ` · Rückgeld ${chf(given - order.total_cents)}` : ''}</div>
    <div class="autobar" id="autobar"><i id="autobar-i"></i></div>
    <div class="autotxt" id="autotxt">Automatisch zurück zur Kasse · Tippen zum Anhalten</div>
    <div class="s-actions"><button class="btn primary" onclick="FK.newOrder()">Neue Bestellung</button>
      <button class="btn light" onclick="FK.stopAuto();FK.show('s-dash')">Auswertung</button></div></div>`;
  show('s-success'); startAuto();
}
function startAuto() {
  stopAuto(true); const dur = 4000, start = performance.now();
  const step = (t) => { const p = Math.min(1, (t - start) / dur); const i = $('autobar-i'); if (i) i.style.width = p * 100 + '%'; if (p < 1 && S.successTimer) requestAnimationFrame(step); };
  S.successTimer = setTimeout(newOrder, dur); requestAnimationFrame(step);
}
function stopAuto(silent) {
  clearTimeout(S.successTimer); S.successTimer = null;
  if (!silent) { ['autobar', 'autotxt'].forEach((id) => { const el = $(id); if (el) el.style.visibility = 'hidden'; }); }
}
function newOrder() { stopAuto(); show('s-pos'); }

// Offline-Warteschlange (nur Bar)
let flushing = false;
async function flushQueue() {
  if (flushing || !navigator.onLine || !S.api) return;
  let q = store.get('fk-queue', []); if (!q.length) return;
  flushing = true; let done = 0;
  try {
    for (const o of [...q]) {
      try {
        await S.api.createOrder(o); done++;
      } catch (e) {
        if (e.network) break;
        const failed = store.get('fk-queue-failed', []); failed.push({ ...o, error: e.message }); store.set('fk-queue-failed', failed);
      }
      q = q.filter((x) => x.id !== o.id); store.set('fk-queue', q);
    }
  } finally { flushing = false; }
  if (done) toast(`${done} Offline-Bestellung${done > 1 ? 'en' : ''} verbucht`);
  if (current() === 's-pos') renderPOS();
}
window.addEventListener('online', flushQueue);
setInterval(flushQueue, 20000);
function showFailed() {
  const f = store.get('fk-queue-failed', []);
  openSheet(`<h3>Nicht verbuchte Barbestellungen</h3><p>Diese Bestellungen wurden offline kassiert, konnten aber nicht gespeichert werden (z. B. weil ein Produkt inzwischen gelöscht wurde). Bitte dem Verein melden.</p>
    ${f.map((o) => `<div class="lrow"><div class="name" style="flex-direction:column;align-items:flex-start;gap:2px"><b>${chf(o.total_cents)}</b><span class="small-note">${esc(o.names)} · ${new Date(o.created).toLocaleString('de-CH')}<br>${esc(o.error)}</span></div></div>`).join('')}
    <div class="btns"><button class="btn light" onclick="FK.clearFailed()">Gesehen, Liste leeren</button></div>`);
}
function clearFailed() { store.set('fk-queue-failed', null); closeSheet(); renderPOS(); }

// ---------------------------------------------------------------------
// Auswertung
// ---------------------------------------------------------------------
async function renderDash() {
  const back = `<button class="icon-btn" onclick="FK.dashBack()" aria-label="Zurück">${ICON_BACK}</button>`;
  if (!$('dash-body')) $('s-dash').innerHTML = topBar('Auswertung', 'Heute', back) + '<div class="dash-body" id="dash-body"><div class="empty">Lädt …</div></div>';
  $('s-dash').querySelector('.top p').textContent = `${S.event.name} · ${new Date().toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' })}`;
  let st;
  try { st = await S.api.stats(S.event.id); } catch (e) { $('dash-body').innerHTML = `<div class="card empty">${esc(errMsg(e))}</div>`; return; }
  const avg = st.orders ? st.revenue_cents / st.orders : 0;
  const mTotal = (st.methods.twint + st.methods.cash) || 1;
  const mRows = ['twint', 'cash'].map((k) => `<div class="lrow"><i class="sw" style="background:${METHOD[k].color}"></i><div class="name">${METHOD[k].label}</div><div class="pct num">${Math.round(st.methods[k] / mTotal * 100)}%</div><div class="v num">${chf(st.methods[k], 0)}</div></div>`).join('');
  const stack = ['twint', 'cash'].map((k) => `<i style="width:${st.methods[k] / mTotal * 100}%;background:${METHOD[k].color}"></i>`).join('');
  const maxP = st.products[0]?.qty || 1;
  const items = st.products.reduce((s, p) => s + Number(p.qty), 0);
  const pRows = st.products.map((p, i) => `<div class="prow" ${i > 4 ? 'data-extra hidden' : ''}><div class="top-l"><span>${esc(p.name)}</span><b class="num">${p.qty}</b></div><div class="bar"><i style="width:${p.qty / maxP * 100}%"></i></div></div>`).join('');
  const me = isAdmin() ? 'Verwaltung' : S.helper?.name;
  const hRows = st.helpers.map((h, i) => `<div class="lrow"><div class="rank ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</div><div class="name">${esc(h.name)}${h.name === me ? '<span class="you">DU</span>' : ''}</div><div class="v num">${chf(h.cents, 0)}</div></div>`).join('');
  const oRows = st.recent.map((o) => `<div class="order-row"><span class="tag" style="background:${METHOD[o.method].soft};color:${METHOD[o.method].color}">${o.status === 'pending' ? 'offen' : METHOD[o.method].label}</span>
      <div class="oi"><b>#${o.no}</b> · <span style="color:var(--muted);font-size:13px">${timeStr(o.created_at)} · ${esc(o.helper_name)}</span><div>${o.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(', ')}</div></div>
      <b class="num">${chf(o.total_cents)}</b></div>`).join('');
  $('dash-body').innerHTML = `
    <div class="kpi-main"><div class="lbl">Umsatz · ${esc(S.event.name)}</div><div class="val num">${chf(st.revenue_cents)}</div><div class="live"><span class="dot"></span> Live · alle Helfer</div></div>
    <div class="kpis"><div class="kpi"><div class="lbl">Bestellungen</div><div class="val num">${fmt(st.orders * 100, 0)}</div></div><div class="kpi"><div class="lbl">Ø pro Bestellung</div><div class="val num">${chf(avg)}</div></div></div>
    ${st.pending ? `<div class="hint-box" style="margin-top:12px">${st.pending} TWINT-Zahlung${st.pending > 1 ? 'en' : ''} gerade offen</div>` : ''}
    <div class="card"><h3>Zahlungsarten</h3><div class="stack">${stack}</div>${mRows}</div>
    <div class="card"><h3>Verkaufte Produkte <small class="num">${items} Artikel</small></h3>${pRows || '<div class="empty">Noch keine Verkäufe</div>'}${st.products.length > 5 ? '<button class="show-more" onclick="FK.toggleProducts(this)">Alle Produkte anzeigen</button>' : ''}</div>
    <div class="card"><h3>Umsatz pro Helfer</h3>${hRows || '<div class="empty">Noch keine Verkäufe</div>'}</div>
    <div class="card"><h3>Letzte Bestellungen</h3>${oRows || '<div class="empty">Noch keine Bestellungen</div>'}</div>
    ${isAdmin() ? '<button class="btn light" style="margin-top:14px" onclick="FK.exportCsv()">Bestellungen als CSV exportieren</button>' : ''}`;
}
function toggleProducts(btn) { const ex = document.querySelectorAll('[data-extra]'); const open = ex[0].hidden; ex.forEach((e) => { e.hidden = !open; }); btn.textContent = open ? 'Weniger anzeigen' : 'Alle Produkte anzeigen'; }
function dashBack() { show(isAdmin() ? 's-admin' : 's-pos'); }
setInterval(() => { if (current() === 's-dash' && document.visibilityState === 'visible') renderDash(); }, 15000);

// ---------------------------------------------------------------------
// Menü
// ---------------------------------------------------------------------
const MI = {
  pos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 7h8M8 11h2M12 11h2M8 15h2M12 15h2M8 18h8"/></svg>',
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 20V11M12 20V5M19 20v-6"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/></svg>',
  leave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/></svg>',
};
function openMenu() {
  const cur = current(), admin = isAdmin();
  const who = admin ? S.club?.name : S.helper?.name;
  $('menu-inner').innerHTML = `<div class="who"><div class="avatar">${esc((who || '?')[0])}</div><div><b>${esc(who)}</b><span>${admin ? 'Verwaltung' : 'Helfer · ' + esc(S.event?.name ?? '')}${S.mode === 'demo' ? ' · Demo-Modus' : ''}</span></div></div>
    <button class="${cur === 's-pos' ? 'cur' : ''}" onclick="FK.nav('s-pos')">${MI.pos}Kasse</button>
    <button class="${cur === 's-dash' ? 'cur' : ''}" onclick="FK.nav('s-dash')">${MI.dash}Auswertung</button>
    ${admin ? `<button class="${cur === 's-admin' ? 'cur' : ''}" onclick="FK.nav('s-admin')">${MI.admin}Verwaltung</button>` : ''}
    <button class="danger" onclick="FK.closeMenu();${admin ? 'FK.logout()' : 'FK.askLeave()'}">${MI.leave}${admin ? 'Abmelden' : 'Event verlassen'}</button>`;
  $('menu').classList.add('open');
}
function askLeave() {
  const q = store.get('fk-queue', []).length;
  openSheet(`<h3>Event verlassen?</h3><p>Du wirst von «${esc(S.event?.name)}» abgemeldet. ${q ? `<b>Achtung: ${q} Offline-Bestellung${q > 1 ? 'en sind' : ' ist'} noch nicht verbucht.</b> Warte, bis Internet da ist.` : 'Deine erfassten Bestellungen bleiben gespeichert.'}</p>
    <div class="btns"><button class="btn danger" onclick="FK.closeSheet();FK.leave()">Event verlassen</button><button class="btn light" onclick="FK.closeSheet()">Abbrechen</button></div>`);
}
async function leave() { S.unsub?.(); store.set('fk-helper', null); S.helper = null; S.role = null; S.event = null; S.cart = {}; await S.api.signOut(); show('s-welcome'); toast('Event verlassen'); }

// ---------------------------------------------------------------------
// Öffentliche Aktionen für onclick-Handler
// ---------------------------------------------------------------------
const FK = window.FK = {
  show, openMenu, closeMenu: () => $('menu').classList.remove('open'), nav: (id) => { $('menu').classList.remove('open'); show(id); },
  closeSheet, startJoin, joinBack: () => { if (S.joinStep === 2) { S.joinStep = 1; renderJoin(); } else show('s-welcome'); },
  checkCode, finishJoin, pickName: (b) => { $('join-name').value = b.textContent; document.querySelectorAll('#s-join .chip').forEach((c) => c.classList.toggle('sel', c === b)); },
  goLogin: () => { S.registerMode = false; show('s-login'); }, toggleRegister: () => { S.registerMode = !S.registerMode; renderLogin(); },
  doLogin, doSetup, logout, admTab, setEvent, toggleMethod, saveEventForm, savePayrexx, toggleSoldOut, askDelete, deleteProduct,
  toggleBlock, copyJoin, askNewCode, newCode, addCategory, renameCategory, deleteCategory, addHelper, askNewEvent, newEvent,
  askSamples, addSamples, exportCsv, resetDemo, editProduct, editorSet, editorLib, pickLib, loadPhoto, saveEditor,
  add, removeOne, clearCart, openPay, payBack, backToMethods, chooseMethod, cancelTwint, demoPaid, setCash, confirmCash,
  stopAuto, newOrder, showFailed, clearFailed, toggleProducts, dashBack, askLeave, leave, _sheetSave: null,
};

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
