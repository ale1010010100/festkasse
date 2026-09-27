-- =====================================================================
-- FestKasse – Datenbank-Schema für Supabase
-- Im Supabase-Dashboard unter «SQL Editor» komplett ausführen.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------

-- Ein Verein gehört genau einem Admin-Konto (E-Mail/Passwort-Login).
create table if not exists public.clubs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 80),
  email       text,
  created_at  timestamptz not null default now()
);

-- Zugangsdaten zum Zahlungsanbieter. Kein Client kann diese Tabelle lesen
-- (RLS aktiv, keine Policies). Nur die Edge Functions (service_role) lesen sie.
create table if not exists public.club_secrets (
  club_id           uuid primary key references public.clubs(id) on delete cascade,
  payrexx_instance  text,
  payrexx_secret    text,
  updated_at        timestamptz not null default now()
);

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 80),
  date        date not null default current_date,
  place       text not null default '',
  code        text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  open        boolean not null default true,
  methods     jsonb not null default '{"twint": true, "cash": true}'::jsonb,
  hide_out    boolean not null default false,
  next_no     integer not null default 1001,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists events_club_idx on public.events(club_id);

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists categories_event_idx on public.categories(event_id);

create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  category_id  uuid references public.categories(id) on delete set null,
  name         text not null check (char_length(name) between 1 and 40),
  sub          text not null default '',
  price_cents  integer not null check (price_cents between 5 and 99900),
  icon         text not null default '🍽️',
  photo_url    text,
  sold_out     boolean not null default false,
  sort         integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists products_event_idx on public.products(event_id);

-- Helfer brauchen kein Konto: Sie melden sich anonym an (Supabase
-- «Anonymous Sign-In») und treten mit dem Event-Code bei.
create table if not exists public.helpers (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  name        text not null check (char_length(name) between 2 and 30),
  blocked     boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index if not exists helpers_event_name_uq on public.helpers(event_id, lower(name));
create index if not exists helpers_user_idx on public.helpers(user_id);

create table if not exists public.orders (
  id                  uuid primary key,                -- vom Gerät erzeugt (verhindert Doppelbuchungen)
  event_id            uuid not null references public.events(id) on delete cascade,
  helper_id           uuid references public.helpers(id) on delete set null,
  helper_name         text not null,
  no                  integer not null,
  items               jsonb not null,                  -- [{product_id, name, price_cents, qty}]
  total_cents         integer not null check (total_cents > 0),
  method              text not null check (method in ('twint','cash')),
  status              text not null check (status in ('pending','paid','cancelled','failed')),
  cash_given_cents    integer,
  payrexx_gateway_id  bigint,
  payrexx_link        text,
  created_at          timestamptz not null default now(),
  paid_at             timestamptz
);
create index if not exists orders_event_idx on public.orders(event_id, created_at desc);
create unique index if not exists orders_event_no_uq on public.orders(event_id, no);

-- ---------------------------------------------------------------------
-- Hilfsfunktionen für die Rechteprüfung
-- ---------------------------------------------------------------------

create or replace function public.is_real_user() returns boolean
language sql stable as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

create or replace function public.is_club_owner(p_club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from clubs where id = p_club and owner_id = auth.uid())
$$;

create or replace function public.is_event_admin(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events e join clubs c on c.id = e.club_id
    where e.id = p_event and c.owner_id = auth.uid()
  )
$$;

create or replace function public.my_helper_id(p_event uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from helpers where event_id = p_event and user_id = auth.uid() and not blocked limit 1
$$;

create or replace function public.can_view_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_event_admin(p_event) or public.my_helper_id(p_event) is not null
$$;

create or replace function public.random_code() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.events where code = c);
  end loop;
  return c;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.clubs        enable row level security;
alter table public.club_secrets enable row level security;
alter table public.events       enable row level security;
alter table public.categories   enable row level security;
alter table public.products     enable row level security;
alter table public.helpers      enable row level security;
alter table public.orders       enable row level security;

drop policy if exists clubs_owner on public.clubs;
create policy clubs_owner on public.clubs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid() and public.is_real_user());

drop policy if exists events_admin on public.events;
create policy events_admin on public.events
  for all using (public.is_club_owner(club_id)) with check (public.is_club_owner(club_id));
drop policy if exists events_helper_read on public.events;
create policy events_helper_read on public.events
  for select using (public.my_helper_id(id) is not null);

drop policy if exists categories_admin on public.categories;
create policy categories_admin on public.categories
  for all using (public.is_event_admin(event_id)) with check (public.is_event_admin(event_id));
drop policy if exists categories_helper_read on public.categories;
create policy categories_helper_read on public.categories
  for select using (public.my_helper_id(event_id) is not null);

drop policy if exists products_admin on public.products;
create policy products_admin on public.products
  for all using (public.is_event_admin(event_id)) with check (public.is_event_admin(event_id));
drop policy if exists products_helper_read on public.products;
create policy products_helper_read on public.products
  for select using (public.my_helper_id(event_id) is not null);

drop policy if exists helpers_admin on public.helpers;
create policy helpers_admin on public.helpers
  for all using (public.is_event_admin(event_id)) with check (public.is_event_admin(event_id));
drop policy if exists helpers_self_read on public.helpers;
create policy helpers_self_read on public.helpers
  for select using (user_id = auth.uid());

-- Bestellungen: lesen ja, schreiben nur über die Funktionen unten.
drop policy if exists orders_admin_read on public.orders;
create policy orders_admin_read on public.orders
  for select using (public.is_event_admin(event_id));
drop policy if exists orders_helper_read on public.orders;
create policy orders_helper_read on public.orders
  for select using (helper_id is not null and helper_id = public.my_helper_id(event_id));

-- ---------------------------------------------------------------------
-- Funktionen (RPC) für die App
-- ---------------------------------------------------------------------

-- Verein anlegen (nach der Registrierung). Legt gleich ein erstes Event an.
create or replace function public.create_club(p_name text, p_event_name text default 'Mein Fest')
returns json language plpgsql security definer set search_path = public as $$
declare
  v_club clubs;
  v_event events;
begin
  if not public.is_real_user() then raise exception 'Nur für angemeldete Vereine'; end if;
  select * into v_club from clubs where owner_id = auth.uid();
  if found then
    return json_build_object('club_id', v_club.id);
  end if;
  insert into clubs(owner_id, name, email)
    values (auth.uid(), trim(p_name), auth.jwt() ->> 'email')
    returning * into v_club;
  insert into events(club_id, name, code)
    values (v_club.id, trim(p_event_name), public.random_code())
    returning * into v_event;
  insert into categories(event_id, name, sort) values
    (v_event.id, 'Getränke', 1), (v_event.id, 'Essen', 2);
  return json_build_object('club_id', v_club.id, 'event_id', v_event.id);
end $$;

-- Neues Event starten, optional mit Kategorien und Produkten eines alten Events.
create or replace function public.start_event(p_club uuid, p_name text, p_date date, p_place text, p_copy_from uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_event uuid;
  r record;
  v_cat uuid;
begin
  if not public.is_club_owner(p_club) then raise exception 'Keine Berechtigung'; end if;
  update events set archived = true, open = false where club_id = p_club and not archived;
  insert into events(club_id, name, date, place, code)
    values (p_club, trim(p_name), coalesce(p_date, current_date), coalesce(p_place, ''), public.random_code())
    returning id into v_event;
  if p_copy_from is not null and exists (select 1 from events where id = p_copy_from and club_id = p_club) then
    update events n set methods = o.methods, hide_out = o.hide_out
      from events o where n.id = v_event and o.id = p_copy_from;
    for r in select * from categories where event_id = p_copy_from order by sort loop
      insert into categories(event_id, name, sort) values (v_event, r.name, r.sort) returning id into v_cat;
      insert into products(event_id, category_id, name, sub, price_cents, icon, photo_url, sort)
        select v_event, v_cat, name, sub, price_cents, icon, photo_url, sort
        from products where event_id = p_copy_from and category_id = r.id;
    end loop;
  else
    insert into categories(event_id, name, sort) values (v_event, 'Getränke', 1), (v_event, 'Essen', 2);
  end if;
  return v_event;
end $$;

create or replace function public.regenerate_code(p_event uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.is_event_admin(p_event) then raise exception 'Keine Berechtigung'; end if;
  v_code := public.random_code();
  update events set code = v_code where id = p_event;
  return v_code;
end $$;

-- Zahlungsanbieter hinterlegen. Das Secret kann danach niemand mehr auslesen.
create or replace function public.set_payrexx(p_club uuid, p_instance text, p_secret text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_club_owner(p_club) then raise exception 'Keine Berechtigung'; end if;
  insert into club_secrets(club_id, payrexx_instance, payrexx_secret, updated_at)
    values (p_club, nullif(trim(p_instance), ''), nullif(trim(p_secret), ''), now())
  on conflict (club_id) do update
    set payrexx_instance = excluded.payrexx_instance,
        payrexx_secret   = coalesce(excluded.payrexx_secret, club_secrets.payrexx_secret),
        updated_at       = now();
end $$;

create or replace function public.payrexx_status(p_club uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare s club_secrets;
begin
  if not public.is_club_owner(p_club) then raise exception 'Keine Berechtigung'; end if;
  select * into s from club_secrets where club_id = p_club;
  return json_build_object(
    'instance', s.payrexx_instance,
    'configured', s.payrexx_instance is not null and s.payrexx_secret is not null
  );
end $$;

-- Vorschau vor dem Beitreten (Name des Events, vorbereitete Helfernamen).
create or replace function public.event_preview(p_code text)
returns json language plpgsql stable security definer set search_path = public as $$
declare e events; c clubs;
begin
  select * into e from events where code = upper(trim(p_code)) and not archived;
  if not found then return null; end if;
  select * into c from clubs where id = e.club_id;
  return json_build_object(
    'event_id', e.id, 'name', e.name, 'date', e.date, 'place', e.place, 'open', e.open,
    'club', c.name,
    'names', coalesce((select json_agg(name order by name) from helpers
                       where event_id = e.id and not blocked), '[]'::json)
  );
end $$;

-- Helfer tritt bei. Gleicher Name = gleicher Helfer (z. B. neues Handy).
create or replace function public.join_event(p_code text, p_name text)
returns json language plpgsql security definer set search_path = public as $$
declare e events; h helpers; v_name text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  v_name := trim(p_name);
  if char_length(v_name) < 2 then raise exception 'Bitte gib deinen Vornamen ein.'; end if;
  select * into e from events where code = upper(trim(p_code)) and not archived;
  if not found then raise exception 'Kein Event mit diesem Code gefunden.'; end if;
  if not e.open then raise exception 'Dieses Event ist geschlossen.'; end if;
  select * into h from helpers where event_id = e.id and lower(name) = lower(v_name);
  if found then
    if h.blocked then raise exception 'Dieser Zugang wurde vom Verein gesperrt.'; end if;
    update helpers set user_id = auth.uid() where id = h.id returning * into h;
  else
    insert into helpers(event_id, user_id, name)
      values (e.id, auth.uid(), upper(left(v_name, 1)) || substr(v_name, 2))
      returning * into h;
  end if;
  return json_build_object('event_id', e.id, 'helper_id', h.id, 'name', h.name);
end $$;

-- Bestellung erfassen. Preise werden hier aus der Datenbank genommen,
-- nicht vom Handy übernommen.
create or replace function public.create_order(
  p_id uuid, p_event uuid, p_items jsonb, p_method text, p_cash_given_cents integer default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  e events;
  v_helper helpers;
  v_existing orders;
  v_items jsonb := '[]'::jsonb;
  v_total integer := 0;
  it jsonb;
  p products;
  v_qty integer;
  v_no integer;
  v_order orders;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;

  select * into v_existing from orders where id = p_id;
  if found then
    if v_existing.event_id <> p_event then raise exception 'Ungültige Bestellung'; end if;
    return row_to_json(v_existing);   -- schon verbucht (z. B. doppelt gesendet)
  end if;

  select * into e from events where id = p_event for update;
  if not found then raise exception 'Event nicht gefunden'; end if;
  if not e.open then raise exception 'Das Event ist geschlossen.'; end if;
  if p_method not in ('twint','cash') or coalesce((e.methods ->> p_method)::boolean, false) = false then
    raise exception 'Diese Zahlungsart ist nicht aktiv.';
  end if;

  select * into v_helper from helpers where event_id = p_event and user_id = auth.uid();
  if found and v_helper.blocked then raise exception 'Dieser Zugang wurde vom Verein gesperrt.'; end if;
  if not found then
    if not public.is_event_admin(p_event) then raise exception 'Keine Berechtigung'; end if;
    -- Verein kassiert selbst
    insert into helpers(event_id, user_id, name) values (p_event, auth.uid(), 'Verwaltung')
      on conflict (event_id, lower(name)) do update set user_id = excluded.user_id
      returning * into v_helper;
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Warenkorb ist leer';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it ->> 'qty')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 99 then raise exception 'Ungültige Menge'; end if;
    select * into p from products where id = (it ->> 'product_id')::uuid and event_id = p_event;
    if not found then raise exception 'Ein Produkt gibt es nicht mehr. Bitte Warenkorb prüfen.'; end if;
    if p.sold_out then raise exception '% ist ausverkauft.', p.name; end if;
    v_items := v_items || jsonb_build_object('product_id', p.id, 'name', p.name, 'price_cents', p.price_cents, 'qty', v_qty);
    v_total := v_total + p.price_cents * v_qty;
  end loop;

  update events set next_no = next_no + 1 where id = p_event returning next_no - 1 into v_no;

  insert into orders(id, event_id, helper_id, helper_name, no, items, total_cents, method, status, cash_given_cents, paid_at)
  values (p_id, p_event, v_helper.id, v_helper.name, v_no, v_items, v_total, p_method,
          case when p_method = 'cash' then 'paid' else 'pending' end,
          case when p_method = 'cash' then p_cash_given_cents end,
          case when p_method = 'cash' then now() end)
  returning * into v_order;
  return row_to_json(v_order);
end $$;

create or replace function public.cancel_order(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_id;
  if not found then return; end if;
  if not (public.is_event_admin(o.event_id) or o.helper_id = public.my_helper_id(o.event_id)) then
    raise exception 'Keine Berechtigung';
  end if;
  update orders set status = 'cancelled' where id = p_id and status = 'pending';
end $$;

-- Auswertung eines Events (nur bezahlte Bestellungen).
create or replace function public.event_stats(p_event uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare v json;
begin
  if not public.can_view_event(p_event) then raise exception 'Keine Berechtigung'; end if;
  with paid as (
    select * from orders where event_id = p_event and status = 'paid'
  ), items as (
    select (i ->> 'name') as name, (i ->> 'qty')::int as qty, (i ->> 'price_cents')::int * (i ->> 'qty')::int as cents
    from paid, jsonb_array_elements(paid.items) i
  )
  select json_build_object(
    'revenue_cents', coalesce((select sum(total_cents) from paid), 0),
    'orders',        (select count(*) from paid),
    'pending',       (select count(*) from orders where event_id = p_event and status = 'pending'),
    'methods',       json_build_object(
                       'twint', coalesce((select sum(total_cents) from paid where method = 'twint'), 0),
                       'cash',  coalesce((select sum(total_cents) from paid where method = 'cash'), 0)),
    'products',      coalesce((select json_agg(x order by x.qty desc) from
                       (select name, sum(qty) as qty, sum(cents) as cents from items group by name) x), '[]'::json),
    'helpers',       coalesce((select json_agg(x order by x.cents desc) from
                       (select helper_name as name, count(*) as orders, sum(total_cents) as cents
                        from paid group by helper_name) x), '[]'::json),
    'recent',        coalesce((select json_agg(x) from
                       (select no, total_cents, method, helper_name, items, created_at, status
                        from orders where event_id = p_event and status in ('paid','pending')
                        order by created_at desc limit 8) x), '[]'::json)
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Rechte für die API-Rollen
-- ---------------------------------------------------------------------
-- Ausdrücklich freigeben (neue Supabase-Projekte geben Tabellen nicht mehr automatisch frei).
-- Was jemand sehen oder ändern darf, regelt danach die Row Level Security oben.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.clubs, public.events, public.categories, public.products, public.helpers to authenticated;
revoke all on public.club_secrets from anon, authenticated;
revoke insert, update, delete on public.orders from anon, authenticated;
grant select on public.orders to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Live-Abgleich (Realtime)
-- ---------------------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table public.events;     exception when others then null; end;
  begin alter publication supabase_realtime add table public.categories; exception when others then null; end;
  begin alter publication supabase_realtime add table public.products;   exception when others then null; end;
  begin alter publication supabase_realtime add table public.orders;     exception when others then null; end;
  begin alter publication supabase_realtime add table public.helpers;    exception when others then null; end;
end $$;
