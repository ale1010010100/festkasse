// =====================================================================
// FestKasse – Datenzugriff (Supabase)
// Alle Zugriffe der App laufen über dieses Modul. api-demo.js bietet
// dieselben Funktionen ohne Server (Demo-Modus und Tests).
// =====================================================================

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export async function createLiveApi(config) {
  const { createClient } = await import(SUPABASE_JS);
  const sb = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'festkasse-auth' },
  });

  const must = ({ data, error }) => { if (error) throw normError(error); return data; };

  async function fn(name, body) {
    const { data, error } = await sb.functions.invoke(name, { body });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
      throw normError({ message: msg, network: /Failed to send|fetch/i.test(error.message) });
    }
    return data;
  }

  return {
    mode: 'live',

    // ---------------- Sitzung ----------------
    async session() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      if (!u) return null;
      return { kind: u.is_anonymous ? 'anon' : 'admin', userId: u.id, email: u.email };
    },
    async signIn(email, password) {
      must(await sb.auth.signInWithPassword({ email, password }));
    },
    async signUp(email, password) {
      const data = must(await sb.auth.signUp({ email, password }));
      return { needsConfirm: !data.session };
    },
    async signOut() { await sb.auth.signOut(); },
    async ensureAnon() {
      const s = await this.session();
      if (s?.kind === 'anon') return;
      if (s) await sb.auth.signOut();
      must(await sb.auth.signInAnonymously());
    },

    // ---------------- Verein ----------------
    async loadClub() {
      return must(await sb.from('clubs').select('*').maybeSingle());
    },
    async createClub(name, eventName) {
      return must(await sb.rpc('create_club', { p_name: name, p_event_name: eventName }));
    },
    async currentEvent(clubId) {
      return must(await sb.from('events').select('*').eq('club_id', clubId).eq('archived', false)
        .order('created_at', { ascending: false }).limit(1).maybeSingle());
    },
    async loadEventData(eventId, withHelpers) {
      const [event, categories, products, helpers] = await Promise.all([
        sb.from('events').select('*').eq('id', eventId).maybeSingle().then(must),
        sb.from('categories').select('*').eq('event_id', eventId).order('sort').order('created_at').then(must),
        sb.from('products').select('*').eq('event_id', eventId).order('sort').order('created_at').then(must),
        withHelpers ? sb.from('helpers').select('*').eq('event_id', eventId).order('name').then(must) : Promise.resolve([]),
      ]);
      return { event, categories, products, helpers };
    },
    async updateEvent(id, patch) {
      return must(await sb.from('events').update(patch).eq('id', id).select().single());
    },
    async regenerateCode(eventId) {
      return must(await sb.rpc('regenerate_code', { p_event: eventId }));
    },
    async startEvent(clubId, name, date, place, copyFrom) {
      return must(await sb.rpc('start_event', { p_club: clubId, p_name: name, p_date: date, p_place: place, p_copy_from: copyFrom }));
    },
    async saveCategory(c) {
      if (c.id) return must(await sb.from('categories').update({ name: c.name, sort: c.sort }).eq('id', c.id).select().single());
      return must(await sb.from('categories').insert({ event_id: c.event_id, name: c.name, sort: c.sort ?? 99 }).select().single());
    },
    async deleteCategory(id) { must(await sb.from('categories').delete().eq('id', id)); },
    async saveProduct(p) {
      const row = {
        event_id: p.event_id, category_id: p.category_id, name: p.name, sub: p.sub ?? '',
        price_cents: p.price_cents, icon: p.icon ?? '🍽️', photo_url: p.photo_url ?? null,
        sold_out: !!p.sold_out, sort: p.sort ?? 0,
      };
      if (p.id) return must(await sb.from('products').update(row).eq('id', p.id).select().single());
      return must(await sb.from('products').insert(row).select().single());
    },
    async insertProducts(rows) { return must(await sb.from('products').insert(rows).select()); },
    async deleteProduct(id) { must(await sb.from('products').delete().eq('id', id)); },
    async uploadPhoto(clubId, blob) {
      const path = `${clubId}/${crypto.randomUUID()}.jpg`;
      must(await sb.storage.from('product-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false }));
      return sb.storage.from('product-photos').getPublicUrl(path).data.publicUrl;
    },
    async addHelper(eventId, name) {
      return must(await sb.from('helpers').insert({ event_id: eventId, name }).select().single());
    },
    async setHelperBlocked(id, blocked) {
      must(await sb.from('helpers').update({ blocked }).eq('id', id));
    },
    async setPayrexx(clubId, instance, secret) {
      must(await sb.rpc('set_payrexx', { p_club: clubId, p_instance: instance, p_secret: secret }));
    },
    async payrexxStatus(clubId) {
      return must(await sb.rpc('payrexx_status', { p_club: clubId }));
    },
    async listOrders(eventId) {
      return must(await sb.from('orders').select('*').eq('event_id', eventId).order('created_at'));
    },

    // ---------------- Helfer ----------------
    async eventPreview(code) {
      return must(await sb.rpc('event_preview', { p_code: code }));
    },
    async joinEvent(code, name) {
      return must(await sb.rpc('join_event', { p_code: code, p_name: name }));
    },

    // ---------------- Kasse ----------------
    async createOrder(o) {
      return must(await sb.rpc('create_order', {
        p_id: o.id, p_event: o.event_id, p_items: o.items, p_method: o.method,
        p_cash_given_cents: o.cash_given_cents ?? null,
      }));
    },
    async cancelOrder(id) { must(await sb.rpc('cancel_order', { p_id: id })); },
    async twintCreate(orderId) { return fn('twint-create', { order_id: orderId }); },
    async twintStatus(orderId) { return fn('twint-status', { order_id: orderId }); },
    async stats(eventId) { return must(await sb.rpc('event_stats', { p_event: eventId })); },

    /** Live-Änderungen eines Events abonnieren. Gibt eine Abmelde-Funktion zurück. */
    subscribe(eventId, onChange) {
      const ch = sb.channel(`event-${eventId}-${Math.random().toString(36).slice(2)}`);
      for (const table of ['events', 'categories', 'products', 'orders', 'helpers']) {
        const filter = table === 'events' ? `id=eq.${eventId}` : `event_id=eq.${eventId}`;
        ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, (p) => onChange(table, p));
      }
      ch.subscribe();
      return () => sb.removeChannel(ch);
    },
  };
}

function normError(e) {
  const err = new Error(e.message || 'Unbekannter Fehler');
  err.network = !!e.network || /Failed to fetch|NetworkError|network|Load failed/i.test(e.message || '');
  return err;
}
