-- ==========================================================================
-- Roster: the Supabase schema. Run once, whole (it is safe to run again):
--   node scripts/sql.mjs < businesses/roster/schema.sql
--
-- Roster manages participants, meetings, attendance and payments for MANY
-- businesses on one set of tables. Two layers of people:
--   * the owner ("super admin", roster_superadmins): defines the businesses and,
--     for each, the Google accounts that belong to it. Can open every business.
--   * a business account (roster_business_users): sees and edits ONLY the rows
--     of its own business. Nothing else.
-- The visitor (anon) gets nothing from roster, not a table and not a function.
--
-- How a request is scoped. The admin page sends the header `x-business: <id>`
-- on every REST and RPC call. The database never trusts the header on its own:
-- a row is reachable only if the signed-in account BELONGS to the row's
-- business (roster_can) and, when a header is present, the header names that
-- same business. Without a header (Supabase Realtime evaluates RLS with no HTTP
-- headers) membership alone decides what can be READ or DELETED. An INSERT or an
-- UPDATE needs the header: business_id is filled from it, and the policy then
-- insists the caller may act for it, which is also what stops a row from being
-- moved to another business.
--
-- This project serves other apps too, so every object here is named `roster_*`
-- and nothing that is not `roster_*` is dropped, altered or replaced. The one
-- exception is adding the tables to the existing `supabase_realtime`
-- publication, guarded by an existence check.
--
-- Needs Postgres 15 or newer (composite foreign keys with
-- ON DELETE SET NULL (column), so the business column is never nulled).
-- ==========================================================================

do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'roster/schema.sql needs Postgres 15 or newer (ON DELETE SET NULL (column))';
  end if;
end $$;

-- ==========================================================================
-- 1. Who is who: the owner, the businesses, and the accounts of each business
-- ==========================================================================

-- The owner. Read only inside the security definer functions below: no policy
-- for authenticated at all, and every privilege revoked.
create table if not exists public.roster_superadmins (
  email text primary key check (email = lower(email))
);
alter table public.roster_superadmins enable row level security;
revoke all on public.roster_superadmins from anon, authenticated;
insert into public.roster_superadmins (email) values ('ofir.aviram@gmail.com') on conflict do nothing;

create table if not exists public.roster_businesses (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  created_at  timestamptz not null default now(),
  constraint roster_businesses_slug_shape check (slug ~ '^[a-z][a-z0-9-]{1,39}$'),
  constraint roster_businesses_name_len   check (char_length(btrim(name)) between 1 and 80)
);
alter table public.roster_businesses enable row level security;

-- The Google accounts of a business. The email is stored lower case and trimmed,
-- and compared to the signed-in account's email (also lower case).
create table if not exists public.roster_business_users (
  business_id  uuid not null references public.roster_businesses(id) on delete cascade,
  email        text not null,
  created_at   timestamptz not null default now(),
  primary key (business_id, email),
  constraint roster_business_users_email_norm  check (email = lower(btrim(email))),
  constraint roster_business_users_email_shape check (position('@' in email) > 1 and char_length(email) <= 254)
);
alter table public.roster_business_users enable row level security;

-- ==========================================================================
-- 2. The tenancy functions. All security definer (they read tables the caller
--    has no policy on), all callable only by a signed-in account.
-- ==========================================================================

create or replace function public.roster_email()
returns text language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.roster_is_super()
returns boolean language sql stable security definer set search_path = public as $$
  select public.roster_email() <> ''
     and exists (select 1 from public.roster_superadmins s where s.email = public.roster_email());
$$;

-- May the signed-in account act for business b? The owner, or an account listed for it.
-- Every policy calls this once per row, so it does its own lookups in one pass instead of
-- going through roster_is_super() and roster_email() (twice as fast, same answer).
create or replace function public.roster_can(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with me as (select lower(coalesce(auth.jwt() ->> 'email', '')) as e)
  select b is not null and me.e <> ''
     and (exists (select 1 from public.roster_superadmins s where s.email = me.e)
          or exists (select 1 from public.roster_business_users u where u.business_id = b and u.email = me.e))
    from me;
$$;

-- The business the request names in the `x-business` header, or NULL. Never raises:
-- no setting, no header, or something that is not a uuid all give NULL.
-- NULL means "unscoped", never "allowed": every policy still checks membership.
create or replace function public.roster_current_business()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  h text := nullif(current_setting('request.headers', true), '');
  v text;
begin
  if h is null then return null; end if;
  v := (h::json) ->> 'x-business';
  if v is null then   -- header names are lower case in PostgREST, but do not depend on it
    select e.value into v from json_each_text(h::json) e where lower(e.key) = 'x-business' limit 1;
  end if;
  v := btrim(v);
  if v is null or v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  return v::uuid;
exception when others then
  return null;
end $$;

-- The businesses the caller may open: the owner gets all, an account only its own.
create or replace function public.roster_my_businesses()
returns table (id uuid, slug text, name text, is_super boolean)
language sql stable security definer set search_path = public as $$
  select b.id, b.slug, b.name, public.roster_is_super()
    from public.roster_businesses b
   where public.roster_can(b.id)
   order by b.name, b.created_at;
$$;

revoke all on function public.roster_email()              from public, anon;
revoke all on function public.roster_is_super()           from public, anon;
revoke all on function public.roster_can(uuid)            from public, anon;
revoke all on function public.roster_current_business()   from public, anon;
revoke all on function public.roster_my_businesses()      from public, anon;
grant execute on function public.roster_email()            to authenticated;
grant execute on function public.roster_is_super()         to authenticated;
grant execute on function public.roster_can(uuid)          to authenticated;
grant execute on function public.roster_current_business() to authenticated;
grant execute on function public.roster_my_businesses()    to authenticated;

-- Policies of the tenancy tables. The owner does everything; a business account
-- only reads the businesses it belongs to (and nothing of roster_business_users).
-- Supabase grants every privilege on a new table to anon and authenticated. Take away
-- what nobody needs (TRUNCATE skips RLS) and keep exactly four verbs. This is written as
-- "revoke the extras, then grant", never "revoke all", so running the file again on a live
-- project never locks a signed-in page out.
revoke all on public.roster_businesses, public.roster_business_users from anon;
revoke truncate, references, trigger on public.roster_businesses, public.roster_business_users from authenticated;
grant select, insert, update, delete on public.roster_businesses, public.roster_business_users to authenticated;

drop policy if exists "owner manages businesses" on public.roster_businesses;
create policy "owner manages businesses" on public.roster_businesses
  for all to authenticated
  using (public.roster_is_super()) with check (public.roster_is_super());

drop policy if exists "members see their businesses" on public.roster_businesses;
create policy "members see their businesses" on public.roster_businesses
  for select to authenticated
  using (public.roster_can(id));

drop policy if exists "owner manages accounts" on public.roster_business_users;
create policy "owner manages accounts" on public.roster_business_users
  for all to authenticated
  using (public.roster_is_super()) with check (public.roster_is_super());

-- ==========================================================================
-- 3. The data tables. Every one carries business_id (NOT NULL, filled from the
--    x-business header, deleted with its business). Every reference between two
--    tenant tables is composite, (business_id, parent_id), so a row can never
--    point at another business's parent, even by someone who learns a uuid.
-- ==========================================================================

-- Paid marketing channels ("sources"): where a participant came from.
create table if not exists public.roster_promoters (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null default public.roster_current_business() references public.roster_businesses(id) on delete cascade,
  name               text not null,
  color              text not null default 'red',
  rate_type          text not null default 'fixed' check (rate_type in ('fixed', 'percent')),   -- fixed = shekels, percent = share of the payment
  rate               numeric not null default 0,
  cost_on_lead       boolean not null default false,
  cost_from_payment  boolean not null default false,
  cost_total         boolean not null default false,
  created_at         timestamptz not null default now(),
  unique (business_id, id)
);

-- Kinds of meeting: defaults for a new meeting, and the home of tags and message templates.
create table if not exists public.roster_meeting_types (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null default public.roster_current_business() references public.roster_businesses(id) on delete cascade,
  name              text not null default '' check (char_length(name) <= 80),
  sort              int not null default 0,
  meeting_time      time,
  place             text,
  city              text check (city is null or char_length(city) <= 40),
  max_participants  int,
  directions        text check (directions is null or char_length(directions) <= 800),
  price_tiers       jsonb,                 -- { "base": number, "steps": [ { "days": int, "price": number } ] }
  event_open        text,                  -- the "meeting details" message feature (switched off in the page)
  event_msg         text,
  created_at        timestamptz not null default now(),
  unique (business_id, id)
);

create table if not exists public.roster_participants (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null default public.roster_current_business() references public.roster_businesses(id) on delete cascade,
  first_name   text not null default '',
  last_name    text not null default '',
  name         text generated always as (btrim(first_name || ' ' || last_name)) stored,   -- the page reads it back, never sends it
  phone        text not null default '',
  phone_norm   text,                        -- +972... from phone, by trigger; NULL when empty or invalid
  age          int,                         -- as typed; shown age = age + whole years since age_set_at
  age_set_at   date not null default current_date,
  gender       text check (gender in ('male', 'female')),
  promoter_id  uuid,
  active       boolean not null default true,   -- "deleted" = false: hidden, history kept, comes back with the same phone
  created_at   timestamptz not null default now(),
  unique (business_id, id),
  constraint roster_participants_promoter_fk foreign key (business_id, promoter_id)
    references public.roster_promoters (business_id, id) on delete set null (promoter_id)
);

create table if not exists public.roster_meetings (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null default public.roster_current_business() references public.roster_businesses(id) on delete cascade,
  meeting_date      date not null,
  meeting_time      time not null default '20:00',
  name              text check (name is null or char_length(name) <= 80),
  type_id           uuid,
  place             text,
  city              text,
  max_participants  int check (max_participants is null or max_participants between 1 and 500),
  directions        text not null default '',
  price_tiers       jsonb,
  inherit           text[] not null default '{}',   -- the fields this meeting takes from its type
  created_at        timestamptz not null default now(),
  unique (business_id, id),
  -- a type with meetings cannot be deleted. Deferred, so deleting a whole business
  -- (which removes types and meetings in whatever order) still goes through.
  constraint roster_meetings_type_fk foreign key (business_id, type_id)
    references public.roster_meeting_types (business_id, id) deferrable initially deferred
);

-- Participant x meeting.
create table if not exists public.roster_attendance (
  participant_id      uuid not null,
  meeting_id          uuid not null,
  business_id         uuid not null default public.roster_current_business() references public.roster_businesses(id) on delete cascade,
  pay_requested_at    timestamptz,
  status_key          text,                 -- the key of a roster_statuses row (the tag)
  created_at          timestamptz not null default now(),
  attended            boolean not null default false,
  attended_at         timestamptz,
  paid_amount         numeric,
  promoter_id         uuid,
  commission          numeric,
  paid_at             timestamptz,
  details_sent_at     timestamptz,
  no_pay              boolean not null default false,   -- "not for payment"
  pay_later_at        timestamptz,
  pay_due_amount      numeric,                          -- what is left to pay after a partial payment
  pay_closed_at       timestamptz,
  source_promoter_id  uuid,                             -- how this participant came to THIS meeting
  pay_method          text,
  pay_method_note     text,
  primary key (participant_id, meeting_id),
  constraint roster_attendance_participant_fk foreign key (business_id, participant_id)
    references public.roster_participants (business_id, id) on delete cascade,
  -- a meeting with participants cannot be deleted (deferred: see roster_meetings_type_fk)
  constraint roster_attendance_meeting_fk foreign key (business_id, meeting_id)
    references public.roster_meetings (business_id, id) deferrable initially deferred,
  constraint roster_attendance_promoter_fk foreign key (business_id, promoter_id)
    references public.roster_promoters (business_id, id) on delete set null (promoter_id),
  constraint roster_attendance_source_fk foreign key (business_id, source_promoter_id)
    references public.roster_promoters (business_id, id) on delete set null (source_promoter_id)
);

-- Notes on a participant: a person's note (text or a screenshot), or a system note
-- written by the triggers below (system = true).
create table if not exists public.roster_notes (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null default public.roster_current_business() references public.roster_businesses(id) on delete cascade,
  participant_id  uuid not null,
  body            text not null default '',
  image           text,                                   -- a compressed screenshot, as a data URL
  has_image       boolean generated always as (image is not null) stored,
  author_email    text default nullif(public.roster_email(), ''),
  author_name     text,
  system          boolean not null default false,
  event_type      text,
  meeting_id      uuid,
  meeting_short   text,                                   -- '9.11', frozen when the note is written
  new_status      text,
  status_label    text,                                   -- the tag's name and colour as they were then
  status_color    text,
  amount          numeric,
  created_at      timestamptz not null default now(),
  constraint roster_notes_content check (coalesce(btrim(body), '') <> '' or image is not null),
  constraint roster_notes_participant_fk foreign key (business_id, participant_id)
    references public.roster_participants (business_id, id) on delete cascade,
  constraint roster_notes_meeting_fk foreign key (business_id, meeting_id)
    references public.roster_meetings (business_id, id) on delete set null (meeting_id)
);

-- The payments ledger: money in, allocations to a meeting, credit, refunds.
create table if not exists public.roster_payments (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null default public.roster_current_business() references public.roster_businesses(id) on delete cascade,
  participant_id  uuid not null,
  meeting_id      uuid,
  kind            text not null check (kind in ('payment', 'refund', 'credit', 'deposit')),
  amount          numeric not null default 0,             -- always positive
  from_credit     boolean not null default false,
  method          text,
  method_note     text,
  reason          text,                                   -- e.g. 'partial_due:<amount>', 'alloc_removed...'
  pkg_n           int,
  pkg             boolean not null default false,
  promoter_id     uuid,
  commission      numeric,
  author_name     text,
  author_email    text default nullif(public.roster_email(), ''),   -- from the JWT, the page does not send it
  created_at      timestamptz not null default now(),
  constraint roster_payments_participant_fk foreign key (business_id, participant_id)
    references public.roster_participants (business_id, id) on delete cascade,
  constraint roster_payments_meeting_fk foreign key (business_id, meeting_id)
    references public.roster_meetings (business_id, id) on delete set null (meeting_id),
  constraint roster_payments_promoter_fk foreign key (business_id, promoter_id)
    references public.roster_promoters (business_id, id) on delete set null (promoter_id)
);

create table if not exists public.roster_promoter_payments (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null default public.roster_current_business() references public.roster_businesses(id) on delete cascade,
  promoter_id  uuid not null,
  amount       numeric not null check (amount > 0),
  paid_at      date not null default current_date,
  note         text,
  by_email     text,
  method       text,
  created_at   timestamptz not null default now(),
  constraint roster_promoter_payments_promoter_fk foreign key (business_id, promoter_id)
    references public.roster_promoters (business_id, id) on delete cascade
);

-- Tags a participant can carry on a meeting. Belong to a meeting type.
create table if not exists public.roster_statuses (
  business_id  uuid not null default public.roster_current_business() references public.roster_businesses(id) on delete cascade,
  key          text not null,
  label        text not null,
  color        text not null default 'neutral',
  sort         int not null default 0,
  scope        text not null default 'meeting' check (scope in ('participant', 'meeting')),
  type_id      uuid,
  primary key (business_id, key),
  constraint roster_statuses_type_fk foreign key (business_id, type_id)
    references public.roster_meeting_types (business_id, id) on delete cascade
);

create table if not exists public.roster_pay_methods (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null default public.roster_current_business() references public.roster_businesses(id) on delete cascade,
  key          text not null,
  name         text not null,
  sort         int not null default 1,
  owner_email  text,                      -- whose till: drives the settlement between managers
  unique (business_id, key)
);

-- Money that is not a participant's payment, once or recurring, and settlements between managers.
create table if not exists public.roster_finance (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null default public.roster_current_business() references public.roster_businesses(id) on delete cascade,
  kind         text not null check (kind in ('expense', 'income')),
  amount       numeric(10, 2) not null check (amount > 0),
  entry_date   date not null default current_date,
  title        text not null,
  meeting_id   uuid,
  by_email     text,
  created_at   timestamptz not null default now(),
  constraint roster_finance_meeting_fk foreign key (business_id, meeting_id)
    references public.roster_meetings (business_id, id) on delete set null (meeting_id)
);

create table if not exists public.roster_finance_recurring (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null default public.roster_current_business() references public.roster_businesses(id) on delete cascade,
  kind         text not null check (kind in ('expense', 'income')),
  amount       numeric(10, 2) not null check (amount > 0),
  title        text not null,
  period       text not null check (period in ('weekly', 'monthly', 'yearly')),
  start_date   date not null default current_date,
  end_date     date,
  active       boolean not null default true,
  by_email     text,
  created_at   timestamptz not null default now()
);

create table if not exists public.roster_finance_transfers (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null default public.roster_current_business() references public.roster_businesses(id) on delete cascade,
  from_email     text not null,
  to_email       text not null,
  amount         numeric(10, 2) not null check (amount > 0),
  transfer_date  date not null default current_date,
  created_at     timestamptz not null default now()
);

-- Who changed what in the finances. Written only by the triggers below.
create table if not exists public.roster_finance_log (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null default public.roster_current_business() references public.roster_businesses(id) on delete cascade,
  at           timestamptz not null default now(),
  actor        text,
  action       text not null,
  entity       text not null,
  entity_id    uuid,
  summary      text not null
);

-- Per manager: display name and view preferences. One row per account and business.
-- The primary key is an opaque uuid on purpose: Realtime sends the primary key of a deleted
-- row to every subscriber without applying RLS, and an email must not travel in that.
-- The page upserts with ON CONFLICT (business_id, email), which the unique constraint serves.
create table if not exists public.roster_admin_prefs (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null default public.roster_current_business() references public.roster_businesses(id) on delete cascade,
  email        text not null check (email = lower(btrim(email))),
  sender_name  text,
  view_scopes  jsonb,
  event_open   text,                      -- legacy, read only when the business has no meeting types
  event_msg    text,
  constraint roster_admin_prefs_business_email_key unique (business_id, email)
);
-- A table made by an earlier version of this file had (business_id, email) as its primary key.
-- Move it to the uuid key, keeping every row.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'roster_admin_prefs' and column_name = 'id') then
    alter table public.roster_admin_prefs drop constraint roster_admin_prefs_pkey;
    alter table public.roster_admin_prefs add column id uuid not null default gen_random_uuid();
    alter table public.roster_admin_prefs add primary key (id);
    alter table public.roster_admin_prefs add constraint roster_admin_prefs_business_email_key unique (business_id, email);
  end if;
end $$;

-- WhatsApp message templates: of a meeting type (all its meetings) or of one meeting.
create table if not exists public.roster_msg_templates (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null default public.roster_current_business() references public.roster_businesses(id) on delete cascade,
  type_id      uuid,
  meeting_id   uuid,
  name         text not null default '' check (char_length(name) <= 60),
  body         text not null default '' check (char_length(body) <= 2000),
  sort         int not null default 0,
  created_at   timestamptz not null default now(),
  check ((type_id is null) <> (meeting_id is null)),
  constraint roster_msg_templates_type_fk foreign key (business_id, type_id)
    references public.roster_meeting_types (business_id, id) on delete cascade,
  constraint roster_msg_templates_meeting_fk foreign key (business_id, meeting_id)
    references public.roster_meetings (business_id, id) on delete cascade
);

-- Who received which template. tpl_key is the template's id as text.
-- The unique constraint is exactly (participant_id, meeting_id, tpl_key): that is
-- the ON CONFLICT target the page names, so business_id must not be in it.
create table if not exists public.roster_msg_sent (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null default public.roster_current_business() references public.roster_businesses(id) on delete cascade,
  participant_id  uuid not null,
  meeting_id      uuid not null,
  tpl_key         text not null,
  sent_at         timestamptz not null default now(),
  sent_by         text,
  unique (participant_id, meeting_id, tpl_key),
  constraint roster_msg_sent_participant_fk foreign key (business_id, participant_id)
    references public.roster_participants (business_id, id) on delete cascade,
  constraint roster_msg_sent_meeting_fk foreign key (business_id, meeting_id)
    references public.roster_meetings (business_id, id) on delete cascade
);

-- Indexes: the business column (selects, realtime filter, deleting a business) and
-- the columns the references and the page's lookups go through.
create unique index if not exists roster_participants_phone_uq on public.roster_participants (business_id, phone_norm) where phone_norm is not null;
create index if not exists roster_meetings_type_idx            on public.roster_meetings (type_id);
create index if not exists roster_attendance_business_idx      on public.roster_attendance (business_id);
create index if not exists roster_attendance_meeting_idx       on public.roster_attendance (meeting_id);
create index if not exists roster_notes_participant_idx        on public.roster_notes (participant_id, created_at desc);
create index if not exists roster_notes_business_idx           on public.roster_notes (business_id);
create index if not exists roster_payments_participant_idx     on public.roster_payments (participant_id, created_at desc);
create index if not exists roster_payments_promoter_idx        on public.roster_payments (promoter_id);
create index if not exists roster_payments_business_idx        on public.roster_payments (business_id);
create index if not exists roster_promoter_payments_idx        on public.roster_promoter_payments (promoter_id, paid_at desc);
create index if not exists roster_promoter_payments_biz_idx    on public.roster_promoter_payments (business_id);
create index if not exists roster_statuses_type_idx            on public.roster_statuses (type_id);
create index if not exists roster_finance_business_idx         on public.roster_finance (business_id);
create index if not exists roster_finance_recurring_biz_idx    on public.roster_finance_recurring (business_id);
create index if not exists roster_finance_transfers_biz_idx    on public.roster_finance_transfers (business_id);
create index if not exists roster_finance_log_idx              on public.roster_finance_log (business_id, at desc);
create index if not exists roster_msg_templates_business_idx   on public.roster_msg_templates (business_id);
create index if not exists roster_msg_templates_type_idx       on public.roster_msg_templates (type_id);
create index if not exists roster_msg_templates_meeting_idx    on public.roster_msg_templates (meeting_id);
create index if not exists roster_msg_sent_business_idx        on public.roster_msg_sent (business_id);
create index if not exists roster_msg_sent_meeting_idx         on public.roster_msg_sent (meeting_id);

-- ==========================================================================
-- 4. Who may touch the rows. One rule for all of them, per business:
--    read, change and delete only rows of a business the caller belongs to
--    (and, when the request names a business, only that one); add only to the
--    business the request names, if the caller belongs to it. A change cannot
--    move a row to another business. The header alone never grants anything.
-- ==========================================================================
do $$
declare
  t text;
  cur  text := '(select public.roster_current_business())';
  seen text := 'public.roster_can(business_id) and (' || cur || ' is null or business_id = ' || cur || ')';
  made text := 'public.roster_can(business_id) and business_id = ' || cur;
begin
  foreach t in array array[
    'roster_participants', 'roster_meeting_types', 'roster_meetings', 'roster_attendance', 'roster_notes',
    'roster_payments', 'roster_promoters', 'roster_promoter_payments', 'roster_statuses', 'roster_pay_methods',
    'roster_finance', 'roster_finance_recurring', 'roster_finance_transfers', 'roster_finance_log',
    'roster_admin_prefs', 'roster_msg_templates', 'roster_msg_sent'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t);

    execute format('drop policy if exists "members read their business" on public.%I', t);
    execute format('create policy "members read their business" on public.%I for select to authenticated using (%s)', t, seen);

    if t = 'roster_finance_log' then
      -- the log is written by triggers only: nobody forges or erases an entry
      execute format('revoke insert, update, delete on public.%I from authenticated', t);
      execute format('grant select on public.%I to authenticated', t);
    else
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);

      execute format('drop policy if exists "members add to their business" on public.%I', t);
      execute format('create policy "members add to their business" on public.%I for insert to authenticated with check (%s)', t, made);

      execute format('drop policy if exists "members change their business" on public.%I', t);
      execute format('create policy "members change their business" on public.%I for update to authenticated using (%s) with check (%s)', t, seen, made);

      execute format('drop policy if exists "members remove from their business" on public.%I', t);
      execute format('create policy "members remove from their business" on public.%I for delete to authenticated using (%s)', t, seen);
    end if;
  end loop;
end $$;

-- ==========================================================================
-- 5. Phone: normalised by the database, one participant per phone per business.
--    Same logic as normPhone in the admin page.
-- ==========================================================================
create or replace function public.roster_normalize_phone(p text)
returns text language plpgsql immutable as $$
declare
  raw  text := trim(coalesce(p, ''));
  plus boolean;
  d    text;
begin
  if raw = '' then return ''; end if;
  plus := left(raw, 1) = '+';
  d := regexp_replace(raw, '\D', '', 'g');
  if d = '' then return ''; end if;
  if left(d, 2) = '00' then plus := true; d := substr(d, 3); end if;
  if plus then
    if left(d, 4) = '9720' then d := '972' || substr(d, 5); end if;
    if length(d) < 8 or length(d) > 15 or left(d, 1) = '0' then return ''; end if;
    if left(d, 3) = '972' and substr(d, 4) !~ '^(5\d{8}|7\d{8}|[23489]\d{7})$' then return ''; end if;
    return '+' || d;
  end if;
  if left(d, 1) = '0' then
    if d ~ '^0(5\d{8}|7\d{8}|[23489]\d{7})$' then return '+972' || substr(d, 2); end if;
    return '';
  end if;
  return '';
end $$;

create or replace function public.roster_participants_phone_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.phone_norm := nullif(public.roster_normalize_phone(new.phone), '');
  return new;
end $$;

drop trigger if exists roster_participants_phone on public.roster_participants;
create trigger roster_participants_phone
  before insert or update of phone, phone_norm on public.roster_participants
  for each row execute function public.roster_participants_phone_trg();

-- ==========================================================================
-- 6. A meeting takes the fields it did not fill from its type (the page stores
--    the names of those fields in meeting.inherit and the type's values in the
--    meeting's own columns), and a change to a type reaches its future meetings.
-- ==========================================================================
create or replace function public.roster_meeting_inherit() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare t public.roster_meeting_types%rowtype;
begin
  if new.type_id is null or coalesce(cardinality(new.inherit), 0) = 0 then return new; end if;
  select * into t from public.roster_meeting_types where id = new.type_id and business_id = new.business_id;
  if t.id is null then return new; end if;
  if 'name' = any(new.inherit) then new.name := nullif(btrim(coalesce(t.name, '')), ''); end if;
  if 'meeting_time' = any(new.inherit) then new.meeting_time := coalesce(t.meeting_time, new.meeting_time, '20:00'); end if;
  if 'place' = any(new.inherit) then new.place := t.place; end if;
  if 'city' = any(new.inherit) then new.city := t.city; end if;
  if 'max_participants' = any(new.inherit) then new.max_participants := t.max_participants; end if;
  if 'directions' = any(new.inherit) then new.directions := coalesce(t.directions, ''); end if;
  if 'price_tiers' = any(new.inherit) then new.price_tiers := t.price_tiers; end if;
  return new;
end $fn$;
drop trigger if exists roster_meeting_inherit on public.roster_meetings;
create trigger roster_meeting_inherit before insert or update on public.roster_meetings
  for each row execute function public.roster_meeting_inherit();

create or replace function public.roster_type_propagate() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if (new.name, new.meeting_time, new.place, new.city, new.max_participants, new.directions, new.price_tiers::text)
     is not distinct from (old.name, old.meeting_time, old.place, old.city, old.max_participants, old.directions, old.price_tiers::text) then
    return new;
  end if;
  -- touching inherit runs the trigger above on each future meeting that inherits
  update public.roster_meetings set inherit = inherit
   where type_id = new.id and business_id = new.business_id and cardinality(inherit) > 0
     and meeting_date >= (now() at time zone 'Asia/Jerusalem')::date;
  return new;
end $fn$;
drop trigger if exists roster_type_propagate on public.roster_meeting_types;
create trigger roster_type_propagate after update on public.roster_meeting_types
  for each row execute function public.roster_type_propagate();

-- ==========================================================================
-- 7. How a participant came to each meeting. The first meeting of a participant
--    takes the participant's own source; a later change of the participant's
--    source moves only that first meeting.
-- ==========================================================================
create or replace function public.roster_att_source() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.source_promoter_id is not null then return new; end if;
  if not exists (select 1 from public.roster_attendance a where a.participant_id = new.participant_id) then
    select p.promoter_id into new.source_promoter_id
      from public.roster_participants p where p.id = new.participant_id and p.business_id = new.business_id;
  end if;
  return new;
end $$;
drop trigger if exists roster_att_source on public.roster_attendance;
create trigger roster_att_source before insert on public.roster_attendance
  for each row execute function public.roster_att_source();

create or replace function public.roster_participant_source_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.roster_attendance a set source_promoter_id = new.promoter_id
   where a.business_id = new.business_id and a.participant_id = new.id
     and a.meeting_id = (select a2.meeting_id from public.roster_attendance a2
                          where a2.participant_id = new.id order by a2.created_at, a2.meeting_id limit 1);
  return new;
end $$;
drop trigger if exists roster_participant_source_sync on public.roster_participants;
create trigger roster_participant_source_sync after update of promoter_id on public.roster_participants
  for each row when (old.promoter_id is distinct from new.promoter_id)
  execute function public.roster_participant_source_sync();

-- ==========================================================================
-- 8. System notes: every link, tag, arrival and payment event becomes a note on
--    the participant. The page reads event_type, meeting_short, status_label and
--    status_color, and parses the body of some of them (see the page, sysChips).
--    Every function takes the business from the row that fired it, never from
--    the request header, and every lookup is scoped to that business.
-- ==========================================================================

-- '9.11' (no leading zeros)
create or replace function public.roster_meeting_short(p_business uuid, p_meeting uuid)
returns text language sql stable security definer set search_path = public as $$
  select ltrim(to_char(m.meeting_date, 'DD'), '0') || '.' || ltrim(to_char(m.meeting_date, 'MM'), '0')
    from public.roster_meetings m where m.id = p_meeting and m.business_id = p_business;
$$;

-- 'יום שבת 9.11 · 20:00'
create or replace function public.roster_meeting_label(p_business uuid, p_meeting uuid)
returns text language sql stable security definer set search_path = public as $$
  select 'יום ' || (array['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'])[extract(dow from m.meeting_date)::int + 1] || ' '
    || ltrim(to_char(m.meeting_date, 'DD'), '0') || '.' || ltrim(to_char(m.meeting_date, 'MM'), '0') || ' · ' || to_char(m.meeting_time, 'HH24:MI')
    from public.roster_meetings m where m.id = p_meeting and m.business_id = p_business;
$$;

-- the name of a payment method: the business's own list first, then the four the page falls back to.
-- NULL for no method, so ' ב' || label disappears instead of dangling.
create or replace function public.roster_method_label(p_business uuid, p_method text, p_note text)
returns text language sql stable security definer set search_path = public as $$
  select case when p_method is null or p_method = '' then null
    when p_method = 'other' then 'אחר' || coalesce(': ' || nullif(btrim(p_note), ''), '')
    else coalesce((select m.name from public.roster_pay_methods m where m.business_id = p_business and m.key = p_method),
                  case p_method when 'paybox' then 'פייבוקס' when 'bit' then 'ביט' when 'cash' then 'מזומן' when 'bank' then 'בנק' else p_method end)
  end;
$$;

-- the name of a tag by key (the key itself when the tag no longer exists)
create or replace function public.roster_status_label(p_business uuid, k text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select s.label from public.roster_statuses s where s.business_id = p_business and s.key = k), k);
$$;

-- an amount as the notes print it: 100, 100.5
create or replace function public.roster_money(n numeric)
returns text language sql immutable as $$
  select trim_scale(round(n, 2))::text;
$$;

-- Writes one system note. The author is whoever made the change (the JWT); no JWT: "מערכת".
-- A failure never stops the change that caused the note.
create or replace function public.roster_sys_note(
  p_business uuid, p_pid uuid, p_body text, p_event text default null, p_meeting uuid default null,
  p_new text default null, p_amount numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  mail  text := nullif(public.roster_email(), '');
  actor text := coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''), mail);
begin
  -- the business is being deleted: its rows are on their way out, nothing to note
  if not exists (select 1 from public.roster_businesses b where b.id = p_business) then return; end if;
  insert into public.roster_notes (business_id, participant_id, body, author_email, author_name, system, event_type, meeting_id, new_status, amount)
  values (p_business, p_pid, p_body, mail, coalesce(actor, 'מערכת'), true, p_event, p_meeting, p_new, p_amount);
exception when others then
  null;
end $$;

-- Before a note is saved: freeze what the page should keep showing even after a tag is
-- renamed or a meeting is changed (the date, the tag's name and colour), and settle the
-- author's name (the manager's own display name when there is one).
create or replace function public.roster_note_freeze() returns trigger
language plpgsql security definer set search_path = public as $f$
declare lb text; cl text;
begin
  new.author_name := coalesce(
    (select nullif(btrim(a.sender_name), '') from public.roster_admin_prefs a
      where a.business_id = new.business_id and a.email = lower(coalesce(new.author_email, ''))),
    nullif(btrim(new.author_name), ''),
    'מערכת');
  if new.system then
    new.meeting_short := coalesce(new.meeting_short,
      substring(new.body from 'מפגש\s+(?:יום\s+\S+\s+)?(\d{1,2}\.\d{1,2})'),
      case when new.meeting_id is not null then public.roster_meeting_short(new.business_id, new.meeting_id) end);
    if new.new_status is not null then
      select t.label, t.color into lb, cl from public.roster_statuses t
       where t.business_id = new.business_id and t.key = new.new_status limit 1;
      new.status_label := coalesce(new.status_label, lb, public.roster_status_label(new.business_id, new.new_status));
      new.status_color := coalesce(new.status_color, cl);
    end if;
  end if;
  return new;
exception when others then
  return new;   -- a failure here never stops the note
end $f$;
drop trigger if exists roster_note_freeze on public.roster_notes;
create trigger roster_note_freeze before insert on public.roster_notes
  for each row execute function public.roster_note_freeze();

-- Participant x meeting: linked, removed, tag changed, arrived, not for payment, pay later, details sent.
create or replace function public.roster_att_notes() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.attended, false) then
      perform public.roster_sys_note(new.business_id, new.participant_id,
        'הגיע/ה למפגש ' || public.roster_meeting_label(new.business_id, new.meeting_id) || ' (ללא הרשמה מראש)', 'walk_in', new.meeting_id);
    else
      perform public.roster_sys_note(new.business_id, new.participant_id,
        'שויך/ה למפגש ' || public.roster_meeting_label(new.business_id, new.meeting_id), 'meeting_linked', new.meeting_id, new.status_key);
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status_key is distinct from old.status_key then
      perform public.roster_sys_note(new.business_id, new.participant_id,
        'תגית למפגש ' || public.roster_meeting_short(new.business_id, new.meeting_id) || ': '
          || coalesce(public.roster_status_label(new.business_id, new.status_key), 'בלי תגית')
          || ' (היה: ' || coalesce(public.roster_status_label(new.business_id, old.status_key), 'בלי תגית') || ')',
        'status_changed', new.meeting_id, new.status_key);
    end if;
    if coalesce(old.attended, false) <> coalesce(new.attended, false) then
      perform public.roster_sys_note(new.business_id, new.participant_id,
        case when new.attended then 'הגיע/ה למפגש ' else 'סימון ההגעה בוטל למפגש ' end || public.roster_meeting_short(new.business_id, new.meeting_id),
        case when new.attended then 'attended' else 'attendance_cancelled' end, new.meeting_id);
    end if;
    if coalesce(old.no_pay, false) <> coalesce(new.no_pay, false) and new.pay_closed_at is null and old.pay_closed_at is null then
      perform public.roster_sys_note(new.business_id, new.participant_id,
        case when coalesce(new.no_pay, false) then 'המפגש ' || public.roster_meeting_short(new.business_id, new.meeting_id) || ' סומן לא לתשלום'
             else 'חזרה לתשלום למפגש ' || public.roster_meeting_short(new.business_id, new.meeting_id) end,
        case when coalesce(new.no_pay, false) then 'free_on' else 'free_off' end, new.meeting_id);
    end if;
    -- going to "not for payment" is already noted above, so clearing pay-later with it is not noted twice
    if (old.pay_later_at is null) <> (new.pay_later_at is null) and not (new.pay_later_at is null and coalesce(new.no_pay, false)) then
      perform public.roster_sys_note(new.business_id, new.participant_id,
        case when new.pay_later_at is not null then 'המפגש ' || public.roster_meeting_short(new.business_id, new.meeting_id) || ' סומן תשלום בהמשך'
             else 'בוטל תשלום בהמשך למפגש ' || public.roster_meeting_short(new.business_id, new.meeting_id) end,
        case when new.pay_later_at is not null then 'pay_later_on' else 'pay_later_off' end, new.meeting_id);
    end if;
    if (old.details_sent_at is null) <> (new.details_sent_at is null) then
      perform public.roster_sys_note(new.business_id, new.participant_id,
        case when new.details_sent_at is not null then 'נשלחו פרטי המפגש (וואטסאפ) למפגש ' else 'סימון שליחת פרטי המפגש בוטל למפגש ' end
          || public.roster_meeting_short(new.business_id, new.meeting_id),
        case when new.details_sent_at is not null then 'details_sent' else 'details_unsent' end, new.meeting_id);
    end if;
  elsif tg_op = 'DELETE' then
    perform public.roster_sys_note(old.business_id, old.participant_id,
      'הוסר/ה מהמפגש ' || public.roster_meeting_short(old.business_id, old.meeting_id), 'meeting_removed', old.meeting_id);
  end if;
  return null;
exception when others then
  return null;
end $fn$;
drop trigger if exists roster_att_notes on public.roster_attendance;
create trigger roster_att_notes after insert or delete or update of status_key, attended, details_sent_at, no_pay, pay_later_at on public.roster_attendance
  for each row execute function public.roster_att_notes();

-- A participant removed or brought back.
create or replace function public.roster_part_notes() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.active is distinct from old.active then
    perform public.roster_sys_note(new.business_id, new.id,
      case when new.active then 'חזר/ה להיות פעיל/ה' else 'הוסר/ה (לא פעיל/ה)' end,
      case when new.active then 'reactivated' else 'deactivated' end);
  end if;
  return null;
exception when others then
  return null;
end $fn$;
drop trigger if exists roster_part_notes on public.roster_participants;
create trigger roster_part_notes after update of active on public.roster_participants
  for each row execute function public.roster_part_notes();

-- Payments: money received, refunds, and what is allocated to a meeting (added, changed, removed).
-- A deposit made by removing an allocation (reason alloc_removed...) gets no "received" note.
create or replace function public.roster_pay_notes() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare r public.roster_payments; lbl text;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  if r.kind = 'deposit' then
    if tg_op = 'INSERT' and coalesce(r.reason, '') not like 'alloc_removed%' then
      perform public.roster_sys_note(r.business_id, r.participant_id,
        'התקבל תשלום ₪' || public.roster_money(r.amount) || coalesce(' ב' || public.roster_method_label(r.business_id, r.method, r.method_note), ''),
        'payment_received', null, null, r.amount);
    end if;
    return null;
  end if;
  if r.kind = 'refund' then
    if tg_op = 'INSERT' then
      perform public.roster_sys_note(r.business_id, r.participant_id,
        'הוחזרו ₪' || public.roster_money(r.amount) || ' למשתתף'
          || case when r.meeting_id is not null then ' (למפגש ' || public.roster_meeting_short(r.business_id, r.meeting_id) || ')' else '' end
          || coalesce(' ב' || public.roster_method_label(r.business_id, r.method, r.method_note), ''),
        'refund', r.meeting_id, null, r.amount);
    end if;
    return null;
  end if;
  if r.kind <> 'payment' or r.meeting_id is null then return null; end if;
  lbl := public.roster_meeting_short(r.business_id, r.meeting_id);
  if tg_op = 'INSERT' then
    if not coalesce(r.from_credit, false) then
      perform public.roster_sys_note(r.business_id, r.participant_id,
        'התקבל תשלום ₪' || public.roster_money(r.amount) || coalesce(' ב' || public.roster_method_label(r.business_id, r.method, r.method_note), ''),
        'payment_received', null, null, r.amount);
    end if;
    perform public.roster_sys_note(r.business_id, r.participant_id,
      'הוקצו ₪' || public.roster_money(r.amount) || ' למפגש ' || lbl, 'alloc_added', r.meeting_id, null, r.amount);
  elsif tg_op = 'UPDATE' then
    if new.amount is distinct from old.amount then
      perform public.roster_sys_note(r.business_id, r.participant_id,
        'הקצאה למפגש ' || lbl || ' שונתה מ-₪' || public.roster_money(old.amount) || ' ל-₪' || public.roster_money(new.amount),
        'alloc_changed', r.meeting_id, null, new.amount);
    end if;
  elsif tg_op = 'DELETE' then
    perform public.roster_sys_note(r.business_id, r.participant_id,
      'הוסרה הקצאה של ₪' || public.roster_money(r.amount) || ' למפגש ' || lbl, 'alloc_removed', r.meeting_id, null, r.amount);
  end if;
  return null;
exception when others then
  return null;
end $fn$;
drop trigger if exists roster_pay_notes on public.roster_payments;
create trigger roster_pay_notes after insert or update or delete on public.roster_payments
  for each row execute function public.roster_pay_notes();

-- A partial payment ("what is left to pay"): the allocation is written with
-- reason = 'partial_due:<amount>', and the amount is kept on the attendance row. A normal
-- payment written later clears it. The page reads pay_due_amount, it never writes it for this.
create or replace function public.roster_pay_due() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare rem numeric;
begin
  if new.meeting_id is not null and new.kind = 'payment' then
    rem := nullif(substring(coalesce(new.reason, '') from '^partial_due:([0-9]+(?:\.[0-9]+)?)$'), '')::numeric;
    update public.roster_attendance set pay_due_amount = rem
     where business_id = new.business_id and participant_id = new.participant_id and meeting_id = new.meeting_id
       and (rem is not null or pay_due_amount is not null);
    if rem is not null then
      perform public.roster_sys_note(new.business_id, new.participant_id,
        'נשאר לשלם ₪' || public.roster_money(rem) || ' למפגש ' || public.roster_meeting_short(new.business_id, new.meeting_id),
        'payment_due', new.meeting_id);
    end if;
  end if;
  return null;
end $fn$;
drop trigger if exists roster_pay_due on public.roster_payments;
create trigger roster_pay_due after insert on public.roster_payments
  for each row execute function public.roster_pay_due();

-- ==========================================================================
-- 9. The finance log: every add, change and delete of an expense, an income, a
--    recurring rule or a transfer between managers. The page prints summary
--    and parses the "עודכנה ... "<title>": <label> <old> ← <new>" form.
-- ==========================================================================
create or replace function public.roster_finance_log_fn() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tr  boolean := (tg_table_name = 'roster_finance_transfers');
  rec boolean := (tg_table_name = 'roster_finance_recurring');
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  b uuid := (r->>'business_id')::uuid;
  word text := case when tr then 'העברה בין מנהלים' else (case when r->>'kind' = 'income' then 'הכנסה' else 'הוצאה' end) || (case when rec then ' מחזורית' else '' end) end;
  per text := case r->>'period' when 'weekly' then 'כל שבוע' when 'monthly' then 'כל חודש' when 'yearly' then 'כל שנה' else '' end;
  who text := coalesce(auth.jwt()->>'email', 'מערכת');
  base text;
  diff text := '';
  k text;
  lab jsonb := '{"amount":"סכום","title":"תיאור","entry_date":"תאריך","start_date":"תאריך התחלה","end_date":"תאריך סיום","period":"חזרתיות","active":"פעיל","kind":"סוג","meeting_id":"שיוך למפגש","by_email":"דרך","from_email":"מאת","to_email":"אל","transfer_date":"תאריך"}';
  txt text;
begin
  -- the business is being deleted: its rows (and its log) are on their way out
  if not exists (select 1 from public.roster_businesses x where x.id = b) then return null; end if;
  if tr then
    base := '₪' || public.roster_money((r->>'amount')::numeric) || ' · מ-' || split_part(r->>'from_email', '@', 1) || ' אל ' || split_part(r->>'to_email', '@', 1);
  else
    base := '₪' || public.roster_money((r->>'amount')::numeric) || ' · ' || (r->>'title') || (case when rec then ' · ' || per else '' end)
            || (case when r->>'by_email' is not null then ' · דרך ' || split_part(r->>'by_email', '@', 1) else '' end);
  end if;
  if tg_op = 'INSERT' then
    txt := 'נוספה ' || word || ': ' || base;
  elsif tg_op = 'DELETE' then
    txt := 'נמחקה ' || word || ': ' || base;
  else
    for k in select jsonb_object_keys(lab) loop
      if (o->k) is distinct from (n->k) then
        diff := diff || (case when diff = '' then '' else ', ' end) || (lab->>k) || ' ' || coalesce(o->>k, '-') || ' ← ' || coalesce(n->>k, '-');
      end if;
    end loop;
    if diff = '' then return null; end if;
    txt := 'עודכנה ' || word || (case when tr then '' else ' "' || (n->>'title') || '"' end) || ': ' || diff;
  end if;
  insert into public.roster_finance_log (business_id, actor, action, entity, entity_id, summary)
  values (b, who, lower(tg_op), case when tr then 'transfer' when rec then 'recurring' else 'entry' end, (r->>'id')::uuid, txt);
  return null;
end $$;

drop trigger if exists roster_finance_log_t on public.roster_finance;
create trigger roster_finance_log_t after insert or update or delete on public.roster_finance
  for each row execute function public.roster_finance_log_fn();
drop trigger if exists roster_finance_log_t on public.roster_finance_recurring;
create trigger roster_finance_log_t after insert or update or delete on public.roster_finance_recurring
  for each row execute function public.roster_finance_log_fn();
drop trigger if exists roster_finance_log_t on public.roster_finance_transfers;
create trigger roster_finance_log_t after insert or update or delete on public.roster_finance_transfers
  for each row execute function public.roster_finance_log_fn();

-- ==========================================================================
-- 10. Deleting a promoter ("source"), optionally moving everything linked to it onto another.
--     'ok' | 'not_found' | 'has_links' | 'same' | 'no_target'. Runs as the caller, so the
--     policies above apply, and it never touches a business other than the one of p_from.
-- ==========================================================================
create or replace function public.roster_promoter_replace(p_from uuid, p_to uuid default null)
returns text language plpgsql set search_path = public as $$
declare f public.roster_promoters; t public.roster_promoters;
begin
  select * into f from public.roster_promoters where id = p_from;
  if not found then return 'not_found'; end if;
  if p_to is null then
    if exists (select 1 from public.roster_participants where business_id = f.business_id and promoter_id = p_from)
      or exists (select 1 from public.roster_attendance where business_id = f.business_id and (promoter_id = p_from or source_promoter_id = p_from))
      or exists (select 1 from public.roster_payments where business_id = f.business_id and promoter_id = p_from)
      or exists (select 1 from public.roster_promoter_payments where business_id = f.business_id and promoter_id = p_from) then
      return 'has_links';
    end if;
  else
    if p_to = p_from then return 'same'; end if;
    select * into t from public.roster_promoters where id = p_to and business_id = f.business_id;
    if not found then return 'no_target'; end if;
    update public.roster_participants set promoter_id = p_to where business_id = f.business_id and promoter_id = p_from;
    update public.roster_attendance set promoter_id = p_to where business_id = f.business_id and promoter_id = p_from;
    update public.roster_attendance set source_promoter_id = p_to where business_id = f.business_id and source_promoter_id = p_from;
    update public.roster_payments set promoter_id = p_to where business_id = f.business_id and promoter_id = p_from;
    update public.roster_promoter_payments set promoter_id = p_to where business_id = f.business_id and promoter_id = p_from;
  end if;
  delete from public.roster_promoters where id = p_from;
  return 'ok';
end $$;
revoke all on function public.roster_promoter_replace(uuid, uuid) from public, anon;
grant execute on function public.roster_promoter_replace(uuid, uuid) to authenticated;

-- The helpers and trigger functions above are for the database itself: nobody calls them.
revoke all on function public.roster_normalize_phone(text)                  from public, anon, authenticated;
revoke all on function public.roster_participants_phone_trg()               from public, anon, authenticated;
revoke all on function public.roster_meeting_inherit()                      from public, anon, authenticated;
revoke all on function public.roster_type_propagate()                       from public, anon, authenticated;
revoke all on function public.roster_att_source()                           from public, anon, authenticated;
revoke all on function public.roster_participant_source_sync()              from public, anon, authenticated;
revoke all on function public.roster_meeting_short(uuid, uuid)              from public, anon, authenticated;
revoke all on function public.roster_meeting_label(uuid, uuid)              from public, anon, authenticated;
revoke all on function public.roster_method_label(uuid, text, text)         from public, anon, authenticated;
revoke all on function public.roster_status_label(uuid, text)               from public, anon, authenticated;
revoke all on function public.roster_money(numeric)                         from public, anon, authenticated;
revoke all on function public.roster_sys_note(uuid, uuid, text, text, uuid, text, numeric) from public, anon, authenticated;
revoke all on function public.roster_note_freeze()                          from public, anon, authenticated;
revoke all on function public.roster_att_notes()                            from public, anon, authenticated;
revoke all on function public.roster_part_notes()                           from public, anon, authenticated;
revoke all on function public.roster_pay_notes()                            from public, anon, authenticated;
revoke all on function public.roster_pay_due()                              from public, anon, authenticated;
revoke all on function public.roster_finance_log_fn()                       from public, anon, authenticated;

-- ==========================================================================
-- 11. Realtime: the admin page re-reads when any of these changes. Realtime applies the
--     policies above to INSERT and UPDATE events (membership; it sends no header), so a
--     person only hears about the businesses they belong to. DELETE events carry just the
--     primary key and Realtime does not filter them (any signed-in floa account that
--     subscribed receives them, a whole business's worth when a business is deleted). So no
--     primary key here holds anything personal: every one is a uuid (attendance: two uuids),
--     except roster_statuses, whose (business_id, key) key is a random token the page
--     generates ('m_' plus random characters), never text a person typed. The page ignores
--     the content of these events and just re-reads.
-- ==========================================================================
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables) then
    foreach t in array array[
      'roster_participants', 'roster_meetings', 'roster_attendance', 'roster_notes', 'roster_promoters',
      'roster_promoter_payments', 'roster_payments', 'roster_statuses', 'roster_admin_prefs', 'roster_pay_methods',
      'roster_finance', 'roster_finance_recurring', 'roster_finance_transfers', 'roster_finance_log',
      'roster_meeting_types', 'roster_msg_templates', 'roster_msg_sent'
    ] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

notify pgrst, 'reload schema';
