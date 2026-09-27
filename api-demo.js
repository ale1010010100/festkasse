// =====================================================================
// FestKasse – Demo-Modus ohne Server
// Gleiche Funktionen wie api.js, Daten liegen nur in diesem Browser.
// Wird genutzt, solange config.js leer ist, und für automatische Tests.
// =====================================================================
import { LIBRARY, libraryUrl } from './library.js';

const KEY = 'fk-demo-db-v1';
const SKEY = 'fk-demo-session';
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function seed() {
  const club = { id: uid(), owner_id: 'demo-admin', name: 'Verein Musterhausen', email: 'kasse@verein-musterhausen.ch' };
  const event = {
    id: uid(), club_id: club.id, name: 'Chilbi 2026', date: new Date().toISOString().slice(0, 10), place: 'Festplatz Musterhausen',
    code: 'CH26MU', open: true, methods: { twint: true, cash: true }, hide_out: false, next_no: 1001, archived: false, created_at: now(),
  };
  const cats = ['Getränke', 'Essen'].map((name, i) => ({ id: uid(), event_id: event.id, name, sort: i + 1, created_at: now() }));
  const products = LIBRARY.map((l, i) => ({
    id: uid(), event_id: event.id, category_id: cats.find((c) => c.name === l.cat).id, name: l.name, sub: l.sub,
    price_cents: l.price, icon: '🍽️', photo_url: libraryUrl(l.key), sold_out: false, sort: i, created_at: now(),
  }));
  const helpers = ['Marco', 'Laura', 'Simon', 'Nina'].map((name) => ({ id: uid(), event_id: event.id, user_id: null, name, blocked: false, created_at: now() }));
  // Beispielbestellungen für die Auswertung
  const orders = [];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const popular = products.filter((p) => ['Bier', 'Bratwurst', 'Pommes', 'Cola', 'Valser prickelnd', 'Cervelat'].includes(p.name));
  for (let i = 0; i < 60; i++) {
    const n = 1 + Math.floor(Math.random() * 3);
    const items = [];
    for (let k = 0; k < n; k++) {
      const p = Math.random() < 0.75 ? pick(popular) : pick(products);
      const ex = items.find((x) => x.product_id === p.id);
      if (ex) ex.qty++; else items.push({ product_id: p.id, name: p.name, price_cents: p.price_cents, qty: 1 });
    }
    const h = pick(helpers);
    const t = new Date(Date.now() - (60 - i) * 4 * 60000).toISOString();
    orders.push({
      id: uid(), event_id: event.id, helper_id: h.id, helper_name: h.name, no: event.next_no++, items,
      total_cents: items.reduce((s, x) => s + x.price_cents * x.qty, 0), method: Math.random() < 0.7 ? 'twint' : 'cash',
      status: 'paid', created_at: t, paid_at: t,
    });
  }
  return { clubs: [club], events: [event], categories: cats, products, helpers, orders, secrets: {} };
}

export function createDemoApi() {
  let db;
  const load = () => { try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; } if (!db) { db = seed(); persist(); } };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* voll */ } };
  load();
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('fk-demo') : null;
  const listeners = new Set();
  const changed = (table, row) => {
    persist();
    listeners.forEach((l) => l(table, row));
    bc?.postMessage({ table, event_id: row?.event_id ?? row?.id });
  };
  bc?.addEventListener('message', (m) => { load(); listeners.forEach((l) => l(m.data.table, { event_id: m.data.event_id })); });

  // Sitzung pro Browser-Tab: So kann man Verein und Helfer in zwei Tabs gleichzeitig ausprobieren.
  const sess = () => { try { return JSON.parse(sessionStorage.getItem(SKEY)); } catch { return null; } };
  const setSess = (s) => { if (s) sessionStorage.setItem(SKEY, JSON.stringify(s)); else sessionStorage.removeItem(SKEY); };
  const me = () => sess()?.userId;
  const fail = (msg) => { throw new Error(msg); };
  const offline = () => { if (!navigator.onLine) { const e = new Error('Keine Verbindung'); e.network = true; throw e; } };
  const clubOfUser = () => db.clubs.find((c) => c.owner_id === me());
  const isAdmin = (eventId) => { const c = clubOfUser(); return !!c && db.events.some((e) => e.id === eventId && e.club_id === c.id); };
  const myHelper = (eventId) => db.helpers.find((h) => h.event_id === eventId && h.user_id === me() && !h.blocked);
  const code = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c; do { c = Array.from({ length: 6 }, () => a[Math.floor(Math.random() * a.length)]).join(''); } while (db.events.some((e) => e.code === c)); return c; };
  const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

  return {
    mode: 'demo',
    async session() { const s = sess(); return s ? { ...s } : null; },
    async signIn(email, password) {
      await delay(300);
      if (!email || !password) fail('Bitte E-Mail und Passwort eingeben.');
      setSess({ kind: 'admin', userId: 'demo-admin', email });
    },
    async signUp(email, password) {
      await delay(300);
      if (password.length < 6) fail('Das Passwort braucht mindestens 6 Zeichen.');
      setSess({ kind: 'admin', userId: 'user-' + email, email });
      return { needsConfirm: false };
    },
    async signOut() { setSess(null); },
    async ensureAnon() { const s = sess(); if (s?.kind !== 'anon') setSess({ kind: 'anon', userId: 'anon-' + uid() }); },

    async loadClub() { return clubOfUser() ?? null; },
    async createClub(name, eventName) {
      if (sess()?.kind !== 'admin') fail('Nur für angemeldete Vereine');
      if (clubOfUser()) return { club_id: clubOfUser().id };
      const club = { id: uid(), owner_id: me(), name, email: sess().email };
      const event = { id: uid(), club_id: club.id, name: eventName, date: new Date().toISOString().slice(0, 10), place: '', code: code(), open: true, methods: { twint: true, cash: true }, hide_out: false, next_no: 1001, archived: false, created_at: now() };
      db.clubs.push(club); db.events.push(event);
      ['Getränke', 'Essen'].forEach((n, i) => db.categories.push({ id: uid(), event_id: event.id, name: n, sort: i + 1, created_at: now() }));
      changed('events', event);
      return { club_id: club.id, event_id: event.id };
    },
    async currentEvent(clubId) {
      return db.events.filter((e) => e.club_id === clubId && !e.archived).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
    },
    async loadEventData(eventId, withHelpers) {
      await delay(60);
      if (!isAdmin(eventId) && !myHelper(eventId)) return { event: null, categories: [], products: [], helpers: [] };
      const by = (a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at);
      return {
        event: { ...db.events.find((e) => e.id === eventId) },
        categories: db.categories.filter((c) => c.event_id === eventId).sort(by).map((x) => ({ ...x })),
        products: db.products.filter((p) => p.event_id === eventId).sort(by).map((x) => ({ ...x })),
        helpers: withHelpers ? db.helpers.filter((h) => h.event_id === eventId).map((x) => ({ ...x })) : [],
      };
    },
    async updateEvent(id, patch) {
      if (!isAdmin(id)) fail('Keine Berechtigung');
      const e = db.events.find((x) => x.id === id); Object.assign(e, patch); changed('events', e); return { ...e };
    },
    async regenerateCode(eventId) { if (!isAdmin(eventId)) fail('Keine Berechtigung'); const e = db.events.find((x) => x.id === eventId); e.code = code(); changed('events', e); return e.code; },
    async startEvent(clubId, name, date, place, copyFrom) {
      db.events.filter((e) => e.club_id === clubId).forEach((e) => { e.archived = true; e.open = false; });
      const ev = { id: uid(), club_id: clubId, name, date, place: place || '', code: code(), open: true, methods: { twint: true, cash: true }, hide_out: false, next_no: 1001, archived: false, created_at: now() };
      db.events.push(ev);
      const oldCats = db.categories.filter((c) => c.event_id === copyFrom);
      if (copyFrom && oldCats.length) {
        const old = db.events.find((e) => e.id === copyFrom); ev.methods = { ...old.methods }; ev.hide_out = old.hide_out;
        oldCats.forEach((c) => {
          const nc = { ...c, id: uid(), event_id: ev.id }; db.categories.push(nc);
          db.products.filter((p) => p.category_id === c.id).forEach((p) => db.products.push({ ...p, id: uid(), event_id: ev.id, category_id: nc.id, sold_out: false }));
        });
      } else ['Getränke', 'Essen'].forEach((n, i) => db.categories.push({ id: uid(), event_id: ev.id, name: n, sort: i + 1, created_at: now() }));
      changed('events', ev); return ev.id;
    },
    async saveCategory(c) {
      if (c.id) { const x = db.categories.find((y) => y.id === c.id); Object.assign(x, { name: c.name, sort: c.sort ?? x.sort }); changed('categories', x); return { ...x }; }
      const x = { id: uid(), event_id: c.event_id, name: c.name, sort: c.sort ?? 99, created_at: now() }; db.categories.push(x); changed('categories', x); return { ...x };
    },
    async deleteCategory(id) {
      const c = db.categories.find((x) => x.id === id); db.categories = db.categories.filter((x) => x.id !== id);
      db.products.forEach((p) => { if (p.category_id === id) p.category_id = null; }); changed('categories', c);
    },
    async saveProduct(p) {
      if (!isAdmin(p.event_id)) fail('Keine Berechtigung');
      if (!(p.price_cents >= 5 && p.price_cents <= 99900)) fail('Ungültiger Preis');
      if (p.id) { const x = db.products.find((y) => y.id === p.id); Object.assign(x, p); changed('products', x); return { ...x }; }
      const x = { sub: '', icon: '🍽️', photo_url: null, sold_out: false, sort: 0, ...p, id: uid(), created_at: now() }; db.products.push(x); changed('products', x); return { ...x };
    },
    async insertProducts(rows) { const out = rows.map((r) => ({ sub: '', icon: '🍽️', sold_out: false, sort: 0, ...r, id: uid(), created_at: now() })); db.products.push(...out); changed('products', out[0]); return out; },
    async deleteProduct(id) { const p = db.products.find((x) => x.id === id); db.products = db.products.filter((x) => x.id !== id); changed('products', p); },
    async uploadPhoto(_clubId, blob) {
      return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
    },
    async addHelper(eventId, name) {
      if (db.helpers.some((h) => h.event_id === eventId && h.name.toLowerCase() === name.toLowerCase())) fail('Diesen Namen gibt es schon.');
      const h = { id: uid(), event_id: eventId, user_id: null, name, blocked: false, created_at: now() }; db.helpers.push(h); changed('helpers', h); return { ...h };
    },
    async setHelperBlocked(id, blocked) { const h = db.helpers.find((x) => x.id === id); h.blocked = blocked; changed('helpers', h); },
    async setPayrexx(clubId, instance, secret) { db.secrets[clubId] = { instance, secret: secret || db.secrets[clubId]?.secret }; persist(); },
    async payrexxStatus(clubId) { const s = db.secrets[clubId]; return { instance: s?.instance ?? null, configured: !!(s?.instance && s?.secret) }; },
    async listOrders(eventId) { return db.orders.filter((o) => o.event_id === eventId).sort((a, b) => a.created_at.localeCompare(b.created_at)); },

    async eventPreview(c) {
      await delay(150);
      const e = db.events.find((x) => x.code === String(c).trim().toUpperCase() && !x.archived);
      if (!e) return null;
      const club = db.clubs.find((x) => x.id === e.club_id);
      return { event_id: e.id, name: e.name, date: e.date, place: e.place, open: e.open, club: club.name,
        names: db.helpers.filter((h) => h.event_id === e.id && !h.blocked).map((h) => h.name).sort() };
    },
    async joinEvent(c, name) {
      await delay(150);
      const n = String(name).trim();
      if (n.length < 2) fail('Bitte gib deinen Vornamen ein.');
      const e = db.events.find((x) => x.code === String(c).trim().toUpperCase() && !x.archived);
      if (!e) fail('Kein Event mit diesem Code gefunden.');
      if (!e.open) fail('Dieses Event ist geschlossen.');
      let h = db.helpers.find((x) => x.event_id === e.id && x.name.toLowerCase() === n.toLowerCase());
      if (h?.blocked) fail('Dieser Zugang wurde vom Verein gesperrt.');
      if (!h) { h = { id: uid(), event_id: e.id, user_id: null, name: n[0].toUpperCase() + n.slice(1), blocked: false, created_at: now() }; db.helpers.push(h); }
      h.user_id = me(); changed('helpers', h);
      return { event_id: e.id, helper_id: h.id, name: h.name };
    },

    async createOrder(o) {
      offline(); await delay(150);
      const ex = db.orders.find((x) => x.id === o.id); if (ex) return { ...ex };
      const e = db.events.find((x) => x.id === o.event_id);
      if (!e) fail('Event nicht gefunden');
      if (!e.open) fail('Das Event ist geschlossen.');
      if (!e.methods?.[o.method]) fail('Diese Zahlungsart ist nicht aktiv.');
      let h = db.helpers.find((x) => x.event_id === e.id && x.user_id === me());
      if (h?.blocked) fail('Dieser Zugang wurde vom Verein gesperrt.');
      if (!h) {
        if (!isAdmin(e.id)) fail('Keine Berechtigung');
        h = db.helpers.find((x) => x.event_id === e.id && x.name === 'Verwaltung');
        if (!h) { h = { id: uid(), event_id: e.id, name: 'Verwaltung', blocked: false, created_at: now() }; db.helpers.push(h); }
        h.user_id = me();
      }
      if (!o.items?.length) fail('Warenkorb ist leer');
      const items = o.items.map((it) => {
        const p = db.products.find((x) => x.id === it.product_id && x.event_id === e.id);
        if (!p) fail('Ein Produkt gibt es nicht mehr. Bitte Warenkorb prüfen.');
        if (p.sold_out) fail(`${p.name} ist ausverkauft.`);
        return { product_id: p.id, name: p.name, price_cents: p.price_cents, qty: it.qty };
      });
      const order = {
        id: o.id, event_id: e.id, helper_id: h.id, helper_name: h.name, no: e.next_no++, items,
        total_cents: items.reduce((s, x) => s + x.price_cents * x.qty, 0), method: o.method,
        status: o.method === 'cash' ? 'paid' : 'pending', cash_given_cents: o.method === 'cash' ? o.cash_given_cents ?? null : null,
        created_at: now(), paid_at: o.method === 'cash' ? now() : null,
      };
      db.orders.push(order); changed('orders', order); return { ...order };
    },
    async cancelOrder(id) { const o = db.orders.find((x) => x.id === id); if (o?.status === 'pending') { o.status = 'cancelled'; changed('orders', o); } },
    async twintCreate(orderId) {
      offline(); await delay(400);
      const o = db.orders.find((x) => x.id === orderId);
      const club = db.clubs.find((c) => c.id === db.events.find((e) => e.id === o.event_id).club_id);
      o.payrexx_link = new URL(`danke.html?demo=1&betrag=${o.total_cents}`, document.baseURI).href;
      o.demo_pay_at = Date.now() + 6000; changed('orders', o);
      return { status: 'pending', link: o.payrexx_link, demo: true, club: club.name };
    },
    async twintStatus(orderId) {
      offline(); await delay(100);
      const o = db.orders.find((x) => x.id === orderId);
      if (o.status === 'pending' && o.demo_pay_at != null && Date.now() >= o.demo_pay_at) { o.status = 'paid'; o.paid_at = now(); changed('orders', o); }
      return { status: o.status };
    },
    /** Nur im Demo-Modus: Zahlung sofort als bezahlt markieren. */
    async demoConfirm(orderId) { const o = db.orders.find((x) => x.id === orderId); if (o) o.demo_pay_at = 0; return this.twintStatus(orderId); },
    async stats(eventId) {
      await delay(80);
      if (!isAdmin(eventId) && !myHelper(eventId)) fail('Keine Berechtigung');
      const all = db.orders.filter((o) => o.event_id === eventId);
      const paid = all.filter((o) => o.status === 'paid');
      const sum = (a) => a.reduce((s, o) => s + o.total_cents, 0);
      const prod = {}; const helpers = {};
      paid.forEach((o) => {
        o.items.forEach((i) => { prod[i.name] ??= { name: i.name, qty: 0, cents: 0 }; prod[i.name].qty += i.qty; prod[i.name].cents += i.qty * i.price_cents; });
        helpers[o.helper_name] ??= { name: o.helper_name, orders: 0, cents: 0 }; helpers[o.helper_name].orders++; helpers[o.helper_name].cents += o.total_cents;
      });
      return {
        revenue_cents: sum(paid), orders: paid.length, pending: all.filter((o) => o.status === 'pending').length,
        methods: { twint: sum(paid.filter((o) => o.method === 'twint')), cash: sum(paid.filter((o) => o.method === 'cash')) },
        products: Object.values(prod).sort((a, b) => b.qty - a.qty),
        helpers: Object.values(helpers).sort((a, b) => b.cents - a.cents),
        recent: all.filter((o) => ['paid', 'pending'].includes(o.status)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8),
      };
    },
    subscribe(eventId, onChange) {
      const l = (table, row) => { if (!row || row.event_id === eventId || row.id === eventId) onChange(table, row); };
      listeners.add(l); return () => listeners.delete(l);
    },
    /** Nur im Demo-Modus: alles auf Anfang. */
    resetDemo() { localStorage.removeItem(KEY); sessionStorage.removeItem(SKEY); load(); },
  };
}
