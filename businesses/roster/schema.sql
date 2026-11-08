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
  constraint roster_msg_templates_type_fk foreign key (business_id, type_id)
    references public.roster_meeting_types (business_id, id) on delete cascade,
  constraint roster_msg_templates_meeting_fk foreign key (business_id, meeting_id)
    references public.roster_meetings (business_id, id) on delete cascade
);

-- A SYSTEM template: one per business (system_key 'confirm', "אישור מקום"), made by the database, belonging to no type and
-- no meeting. default_body is the text it came with, so the page can offer "back to the default"; body is what the business
-- edited it to. A table made by the earlier version of this file had the rule "exactly one of type or meeting" as an
-- unnamed check: it is replaced by the named rule below, which only adds the system row (so every old row still satisfies it).
alter table public.roster_msg_templates add column if not exists system_key   text;
alter table public.roster_msg_templates add column if not exists default_body text;
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.roster_msg_templates'::regclass and contype = 'c' and conname <> 'roster_msg_templates_kind'
              and pg_get_constraintdef(oid) like '%type_id IS NULL%' loop
    execute format('alter table public.roster_msg_templates drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'roster_msg_templates_kind' and conrelid = 'public.roster_msg_templates'::regclass) then
    alter table public.roster_msg_templates add constraint roster_msg_templates_kind check (
      (system_key is not null and type_id is null and meeting_id is null)
      or (system_key is null and (type_id is null) <> (meeting_id is null)));
  end if;
end $$;
create unique index if not exists roster_msg_templates_system_uq on public.roster_msg_templates (business_id, system_key) where system_key is not null;

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
  -- digits are the ASCII 0 to 9 and nothing else (\d and \D would follow the database's locale: this number is a unique key)
  d := regexp_replace(raw, '[^0-9]', '', 'g');
  if d = '' then return ''; end if;
  if left(d, 2) = '00' then plus := true; d := substr(d, 3); end if;
  if plus then
    if left(d, 4) = '9720' then d := '972' || substr(d, 5); end if;
    if length(d) < 8 or length(d) > 15 or left(d, 1) = '0' then return ''; end if;
    if left(d, 3) = '972' and substr(d, 4) !~ '^(5[0-9]{8}|7[0-9]{8}|[23489][0-9]{7})$' then return ''; end if;
    return '+' || d;
  end if;
  if left(d, 1) = '0' then
    if d ~ '^0(5[0-9]{8}|7[0-9]{8}|[23489][0-9]{7})$' then return '+972' || substr(d, 2); end if;
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

-- ==========================================================================
-- 12. THE ROSTER API: keys, participant tokens, settings, the events outbox, mail,
--     the personal area. Everything below is added to the tables above; nothing above
--     is changed except where a section says so (new columns, one trigger widened).
--
--     Who may call what:
--       * roster_api_*, roster_events_claim, roster_events_done: service_role only. The
--         Worker (the only door) holds the service key. Every one of them is SECURITY
--         DEFINER, takes the key as a SHA-256 hex hash (the database never sees a plain
--         key, except inside roster_key_create, which makes it), and answers with a jsonb:
--         expected failures are {"error": "<code>"} (plus "field" for validation), never
--         an exception.
--       * roster_key_*, roster_webhook_*, roster_mail_template_reset: signed-in accounts
--         of a business (roster_can + the x-business header, like the tables).
--       * roster_me_*: ANY signed-in Google account, scoped by the business SLUG.
-- ==========================================================================

-- ---- 12.1 small helpers (internal: nobody calls them) --------------------

create or replace function public.roster_today()
returns date language sql stable as $fn$
  select (now() at time zone 'Asia/Jerusalem')::date;
$fn$;

-- A random string of n characters from [A-Za-z0-9], from pgcrypto's gen_random_bytes
-- (the extensions schema on Supabase), without modulo bias. Where pgcrypto is missing
-- (a bare Postgres) it falls back to gen_random_uuid(), skipping the uuid's fixed bits.
create or replace function public.roster_random_text(n int)
returns text language plpgsql volatile security definer set search_path = public as $fn$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  out text := '';
  b bytea;
  i int;
  v int;
begin
  while char_length(out) < n loop
    if to_regprocedure('extensions.gen_random_bytes(integer)') is not null then
      execute 'select extensions.gen_random_bytes(64)' into b;
    else
      b := decode(replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex');
    end if;
    for i in 0 .. length(b) - 1 loop
      continue when i % 16 in (6, 8) and to_regprocedure('extensions.gen_random_bytes(integer)') is null;
      v := get_byte(b, i);
      if v < 248 then   -- 248 = 4 * 62: the bytes above it would favour the first letters
        out := out || substr(alphabet, (v % 62) + 1, 1);
        exit when char_length(out) >= n;
      end if;
    end loop;
  end loop;
  return out;
end $fn$;

create or replace function public.roster_sha256(t text)
returns text language sql immutable as $fn$
  select encode(sha256(convert_to(coalesce(t, ''), 'UTF8')), 'hex');
$fn$;

-- A NOTE ON CHARACTER CLASSES. The classes [[:space:]], [[:cntrl:]], \s and \d answer by the database's locale, and the
-- locale of the machine that runs this file is not the locale of the machine that tested it. Every validator of text a
-- person types therefore spells its classes out by code point, never by name. The set that is refused wherever a space
-- or an invisible character has no place (an e-mail, a payment link, a webhook URL) is, in one line:
--   [\u0001-\u001f\u007f \u0085   -‏ -  ⁦-⁩　﻿]
-- = ASCII controls, DEL, the space, U+0085, U+00A0, U+1680, U+2000..U+200A (spaces), U+200B..U+200D (zero width), U+200E and
-- U+200F (direction marks), U+2028 and U+2029, U+202A..U+202E (bidi), U+202F, U+205F, U+2066..U+2069 (bidi isolates), U+3000, U+FEFF.

-- The local part is limited to letters, digits and . _ % + - (so nothing that looks like markup gets in); the domain
-- may not hold quotes, angle brackets, commas, semicolons or brackets, and no address holds a character of the set above.
create or replace function public.roster_valid_email(e text)
returns boolean language sql immutable as $fn$
  select e is not null and char_length(e) <= 254
     and e ~ '^[A-Za-z0-9._%+-]{1,64}@[^@<>"'',;()]+\.[^@<>"'',;()]+$'
     and e !~ '[\u0001-\u001f\u007f \u0085   -‏ -  ⁦-⁩　﻿]';
$fn$;

-- A person's name: no control characters (ASCII, DEL, the C1 block, and the line and paragraph separators), no bidi controls
-- (U+202A to U+202E, U+2066 to U+2069: they flip how a name is drawn), no zero-width characters (U+200B to U+200D, U+FEFF:
-- they make two names look alike). Spaces of every kind are allowed here: the functions that take a name from a stranger
-- turn every run of them into one plain space first.
create or replace function public.roster_valid_name(t text)
returns boolean language sql immutable as $fn$
  select t is not null
     and t !~ ('[' || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || chr(8203) || '-' || chr(8205) || chr(65279) || ']')
     and t !~ '[\u0001-\u001f\u007f-\u009f  ]';
$fn$;

create or replace function public.roster_valid_emails(a text[])
returns boolean language sql immutable as $fn$
  select a is not null and coalesce(cardinality(a), 0) <= 20
     and not exists (select 1 from unnest(a) x where not public.roster_valid_email(x));
$fn$;

-- https only, a real host name (a dot and a letters-only ending, so no IP literal and no "localhost"), no credentials,
-- port 443 only (an absent port is 443), not workers.dev, not .local/.localhost/.internal/.invalid, and not one of the
-- wildcard-DNS services that turn any name into a private address (127.0.0.1.nip.io), at most 500 characters.
create or replace function public.roster_valid_webhook_url(u text)
returns boolean language sql immutable as $fn$
  select u is not null and char_length(u) <= 500
     and u ~* '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(:443)?([/?#].*)?$'
     -- No character that is invisible, a space of any kind, or turns the text around, anywhere in the URL. The set is spelled
     -- out by code point (never [[:space:]], whose answer depends on the database's locale): ASCII control characters, DEL,
     -- the space, U+0085, U+00A0, U+1680, U+2000..U+200A (spaces), U+200B..U+200D (zero width), U+200E and U+200F (the
     -- left-to-right and right-to-left marks), U+2028 and U+2029, U+202A..U+202E (bidi), U+202F, U+205F, U+2066..U+2069
     -- (bidi isolates), U+3000 and U+FEFF.
     and u !~ '[\u0001-\u001f\u007f \u0085   -‏ -  ⁦-⁩　﻿]'
     and u !~* '^https://([^/?#]*\.)?(workers\.dev|local|localhost|internal|invalid)(:[0-9]+)?([/?#]|$)'
     and u !~* '^https://([^/?#]*\.)?(nip\.io|sslip\.io|xip\.io|localtest\.me|lvh\.me|traefik\.me|local\.gd|vcap\.me|lacolhost\.com|1u\.ms)(:[0-9]+)?([/?#]|$)';
$fn$;

-- The current age as the page shows it: the age typed plus the whole years since it was typed.
create or replace function public.roster_current_age(a int, set_at date)
returns int language sql stable as $fn$
  select case when a is null then null else a + greatest(extract(year from age(public.roster_today(), coalesce(set_at, public.roster_today())))::int, 0) end;
$fn$;

-- harpatka_meeting_price: price_tiers = {base, steps:[{days, price}]}. With lft days left, the step
-- with the smallest days such that lft <= days, else base. No tiers means 0.
create or replace function public.roster_meeting_price(pt jsonb, lft int)
returns numeric language plpgsql immutable as $fn$
declare p numeric; b text;
begin
  if pt is null or jsonb_typeof(pt) <> 'object' then return 0; end if;
  select case when (e->>'price') ~ '^[0-9]+(\.[0-9]+)?$' then (e->>'price')::numeric end into p
    from jsonb_array_elements(case when jsonb_typeof(pt->'steps') = 'array' then pt->'steps' else '[]'::jsonb end) e
   where case when (e->>'days') ~ '^[0-9]{1,6}$' then lft <= (e->>'days')::int else false end
   order by case when (e->>'days') ~ '^[0-9]{1,6}$' then (e->>'days')::int end asc
   limit 1;
  if p is not null then return p; end if;
  b := pt->>'base';
  if b ~ '^[0-9]+(\.[0-9]+)?$' then return b::numeric; end if;
  return 0;
exception when others then
  return 0;
end $fn$;

-- ---- 12.2 new columns on tables above ------------------------------------

-- the participant's e-mail: for the confirmation mails. Not unique. Stored lower case and trimmed.
alter table public.roster_participants add column if not exists email text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'roster_participants_email_shape' and conrelid = 'public.roster_participants'::regclass) then
    alter table public.roster_participants add constraint roster_participants_email_shape
      check (email is null or (email = lower(btrim(email)) and public.roster_valid_email(email)));
  end if;
end $$;

create or replace function public.roster_participants_email_trg()
returns trigger language plpgsql as $fn$
begin
  new.email := nullif(lower(btrim(new.email)), '');
  return new;
end $fn$;
drop trigger if exists roster_participants_email on public.roster_participants;
create trigger roster_participants_email before insert or update of email on public.roster_participants
  for each row execute function public.roster_participants_email_trg();

-- Constraints of the security round. Every one is added NOT VALID: a database made by the earlier version of this file
-- may hold rows that break them, and those rows must survive the upgrade untouched. A NOT VALID check is enforced on
-- every new and every changed row from now on (so an old row that breaks one is refused only when somebody changes
-- it); `alter table ... validate constraint <name>` checks the old rows once the owner has looked at them.
-- What they stop: text that the admin page draws into an HTML attribute (status keys and colours), ledger rows with
-- a negative, zero, NaN or absurd amount, names that fake how they look, and rows with megabytes of free text.
do $$
declare c record;
begin
  for c in select * from (values
    ('roster_participants',      'roster_participants_name_ok',     'char_length(first_name) <= 40 and char_length(last_name) <= 40 and public.roster_valid_name(first_name) and public.roster_valid_name(last_name)'),
    ('roster_participants',      'roster_participants_phone_len',   'char_length(phone) <= 40'),
    ('roster_statuses',          'roster_statuses_key_shape',       'key ~ ''^[A-Za-z0-9_-]{1,40}$'''),
    ('roster_statuses',          'roster_statuses_color_shape',     'color ~ ''^[a-z]{2,12}$'''),
    ('roster_statuses',          'roster_statuses_label_len',       'char_length(label) <= 60'),
    ('roster_pay_methods',       'roster_pay_methods_key_shape',    'key ~ ''^[A-Za-z0-9_-]{1,40}$'''),
    ('roster_pay_methods',       'roster_pay_methods_name_len',     'char_length(name) <= 80'),
    ('roster_attendance',        'roster_attendance_status_key_shape', 'status_key is null or status_key ~ ''^[A-Za-z0-9_-]{1,40}$'''),
    ('roster_promoters',         'roster_promoters_color_shape',    'color ~ ''^[a-z]{2,12}$'''),
    ('roster_promoters',         'roster_promoters_name_len',       'char_length(name) <= 80'),
    ('roster_payments',          'roster_payments_amount_range',    'amount > 0 and amount <= 1000000'),
    ('roster_promoter_payments', 'roster_promoter_payments_amount_cap', 'amount <= 1000000'),
    ('roster_finance',           'roster_finance_amount_cap',       'amount <= 1000000'),
    ('roster_finance_recurring', 'roster_finance_recurring_amount_cap', 'amount <= 1000000'),
    ('roster_finance_transfers', 'roster_finance_transfers_amount_cap', 'amount <= 1000000'),
    ('roster_notes',             'roster_notes_image_len',          'image is null or char_length(image) <= 500000'),
    ('roster_notes',             'roster_notes_body_len',           'char_length(body) <= 4000')
  ) as v(tbl, cname, expr) loop
    if not exists (select 1 from pg_constraint where conname = c.cname and conrelid = ('public.' || c.tbl)::regclass) then
      execute format('alter table public.%I add constraint %I check (%s) not valid', c.tbl, c.cname, c.expr);
    end if;
  end loop;
end $$;

-- a participant who clicked "I paid" (the click is a report, an admin confirms by recording the money)
alter table public.roster_attendance add column if not exists pay_reported_at     timestamptz;
alter table public.roster_attendance add column if not exists pay_reported_amount numeric;
alter table public.roster_attendance add column if not exists pay_rejected_at     timestamptz;

-- the idempotency key of a payment made through the API
alter table public.roster_payments add column if not exists external_ref text;
create unique index if not exists roster_payments_external_ref_uq on public.roster_payments (business_id, external_ref) where external_ref is not null;
create unique index if not exists roster_payments_business_id_uq on public.roster_payments (business_id, id);

-- ---- 12.3 tables ---------------------------------------------------------

-- One row per business: what the connections page edits. webhook_secret is never readable
-- by a signed-in account (column privileges below); roster_webhook_secret_rotate shows it once.
create table if not exists public.roster_business_settings (
  business_id            uuid primary key references public.roster_businesses(id) on delete cascade,
  registration_open      boolean not null default true,
  signup_required        text[] not null default '{first_name,phone}',
  personal_area_enabled  boolean not null default true,
  participant_mail_enabled boolean not null default true,
  notify_emails          text[] not null default '{}',
  contact_email          text,
  sender_name            text check (sender_name is null or char_length(sender_name) <= 60),
  contact_whatsapp       text check (contact_whatsapp is null or char_length(contact_whatsapp) <= 40),
  payment_url            text,
  webhook_url            text,
  webhook_secret         text,
  webhook_events         text[],                  -- NULL = every event, an empty list = none
  updated_at             timestamptz not null default now(),
  constraint roster_settings_required_known check (signup_required <@ array['first_name','last_name','phone','email','age','gender']::text[]),
  constraint roster_settings_events_known   check (webhook_events is null or webhook_events <@ array['participant.created','registration.created','registration.cancelled','payment.reported','payment.recorded','ping']::text[]),
  constraint roster_settings_notify_valid   check (public.roster_valid_emails(notify_emails)),
  constraint roster_settings_contact_email  check (contact_email is null or public.roster_valid_email(contact_email)),
  -- (roster_settings_payment_url is added below, with the other rules that came later)
  constraint roster_settings_webhook_url    check (webhook_url is null or public.roster_valid_webhook_url(webhook_url))
);

-- True when a secret exists. The page cannot read the secret itself, so it reads this.
alter table public.roster_business_settings add column if not exists webhook_secret_set boolean generated always as (webhook_secret is not null) stored;

-- contact_whatsapp is kept as international digits (the personal area builds wa.me/<digits> from it): a number typed the
-- Israeli way or with a plus or 00 becomes digits with the country code; anything else keeps only its digits; text with
-- no digits at all is left alone, so the check below refuses it instead of the trigger quietly dropping it.
-- signup_required always holds first_name and phone: a signup without them is not a signup.
create or replace function public.roster_settings_trg()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare w text; d text;
begin
  new.contact_email    := nullif(lower(btrim(new.contact_email)), '');
  new.sender_name      := nullif(btrim(new.sender_name), '');
  w := btrim(coalesce(new.contact_whatsapp, ''));
  if w <> '' then
    d := regexp_replace(coalesce(nullif(public.roster_normalize_phone(w), ''), w), '[^0-9]', '', 'g');
    w := case when d = '' then w else d end;
  end if;
  new.contact_whatsapp := nullif(w, '');
  new.signup_required  := array(select distinct x from unnest(coalesce(new.signup_required, '{}'::text[]) || array['first_name', 'phone']) x order by 1);
  new.payment_url      := nullif(btrim(new.payment_url), '');
  new.webhook_url      := nullif(btrim(new.webhook_url), '');
  new.notify_emails    := coalesce(array(select distinct lower(btrim(x)) from unnest(new.notify_emails) x where btrim(x) <> '' order by 1), '{}');
  -- Mail identity belongs to the owner. The three columns decide who the platform mails and under what name and
  -- reply address, so a business member must not be able to turn them into a spam or phishing relay. A change by a
  -- signed-in account that is not the owner is refused (42501); writing the value it already has is fine, and the
  -- owner, the service role and the database itself (no signed-in account) are never refused.
  if tg_op = 'UPDATE'
     and (new.sender_name is distinct from old.sender_name or new.contact_email is distinct from old.contact_email
          or new.notify_emails is distinct from old.notify_emails)
     and public.roster_email() <> '' and not public.roster_is_super() then
    raise exception 'sender_name, contact_email and notify_emails can be changed only by the owner' using errcode = '42501';
  end if;
  new.updated_at       := now();
  return new;
end $fn$;
drop trigger if exists roster_settings_t on public.roster_business_settings;
create trigger roster_settings_t before insert or update on public.roster_business_settings
  for each row execute function public.roster_settings_trg();
-- added after the table existed: only new and changed rows are held to it (NOT VALID), so an older row cannot block a re-run
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.roster_business_settings'::regclass and conname = 'roster_settings_whatsapp_digits') then
    alter table public.roster_business_settings add constraint roster_settings_whatsapp_digits
      check (contact_whatsapp is null or contact_whatsapp ~ '^[0-9]{8,15}$') not valid;
  end if;
end $$;

-- The payment link: https, up to 500 characters, and not one character of the refused set (see the note on character
-- classes above roster_valid_email). The earlier version of this check used [[:space:]] and is replaced here; the new
-- one is NOT VALID (an old link that holds a zero-width character stays, and has to be fixed when somebody changes the row).
do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.roster_business_settings'::regclass and conname = 'roster_settings_payment_url'
               and pg_get_constraintdef(oid) like '%[:space:]%') then
    alter table public.roster_business_settings drop constraint roster_settings_payment_url;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.roster_business_settings'::regclass and conname = 'roster_settings_payment_url') then
    alter table public.roster_business_settings add constraint roster_settings_payment_url check (
      payment_url is null or (char_length(payment_url) <= 500 and payment_url ~* '^https://.+$'
        and payment_url !~ '[\u0001-\u001f\u007f \u0085   -‏ -  ⁦-⁩　﻿]')) not valid;
  end if;
end $$;

-- Keys of the outside world. Only the hash is stored; the plain key is shown once at creation.
create table if not exists public.roster_api_keys (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.roster_businesses(id) on delete cascade,
  kind             text not null check (kind in ('public', 'secret')),
  prefix           text not null,                     -- first 12 characters, for display
  key_hash         text not null unique,
  label            text not null default '' check (char_length(label) <= 60),
  allowed_origins  text[] not null default '{}',      -- exact origins; empty = any origin (public keys only)
  created_by       text,
  created_at       timestamptz not null default now(),
  last_used_at     timestamptz,
  revoked_at       timestamptz,
  unique (business_id, id)
);

-- A participant token (from signup): one participant of one business, 30 days, hashed.
create table if not exists public.roster_participant_tokens (
  token_hash      text primary key,
  business_id     uuid not null references public.roster_businesses(id) on delete cascade,
  participant_id  uuid not null,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  constraint roster_participant_tokens_participant_fk foreign key (business_id, participant_id)
    references public.roster_participants (business_id, id) on delete cascade
);
-- The meeting the person was attached to when the token was made (null: none). The "I paid" click counts only for
-- that meeting, so a token cannot be used to report a payment for some other meeting.
alter table public.roster_participant_tokens add column if not exists meeting_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'roster_participant_tokens_meeting_fk' and conrelid = 'public.roster_participant_tokens'::regclass) then
    alter table public.roster_participant_tokens add constraint roster_participant_tokens_meeting_fk foreign key (business_id, meeting_id)
      references public.roster_meetings (business_id, id) on delete set null (meeting_id);
  end if;
end $$;

-- Idempotency of POST /payments: one row per (business, external_ref). The payment may be
-- deleted later by an admin; the key stays used.
create table if not exists public.roster_idempotency (
  business_id   uuid not null references public.roster_businesses(id) on delete cascade,
  external_ref  text not null,
  payment_id    uuid,
  created_at    timestamptz not null default now(),
  primary key (business_id, external_ref),
  constraint roster_idempotency_payment_fk foreign key (business_id, payment_id)
    references public.roster_payments (business_id, id) on delete set null (payment_id)
);

-- Rate counters, minute buckets. No business column: the bucket name carries what is counted.
create table if not exists public.roster_rate (
  bucket        text not null,
  window_start  timestamptz not null,
  hits          int not null default 0,
  primary key (bucket, window_start)
);

-- The outbox. A trigger writes one row per event that a webhook or a mail rule can use.
create table if not exists public.roster_events (
  id              bigint generated always as identity primary key,
  business_id     uuid not null references public.roster_businesses(id) on delete cascade,
  type            text not null,
  payload         jsonb not null default '{}'::jsonb,   -- the "data" of the webhook body
  source          text not null default 'system',       -- api | admin | me | system: who made the change
  created_at      timestamptz not null default now(),
  status          text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until    timestamptz,
  last_error      text,
  unique (business_id, id)
);

create table if not exists public.roster_webhook_deliveries (
  id           bigint generated always as identity primary key,
  event_id     bigint not null,
  business_id  uuid not null references public.roster_businesses(id) on delete cascade,
  attempt      int not null,
  status       text not null check (status in ('ok', 'failed')),   -- a pending retry is the EVENT's status (pending, next_attempt_at)
  http_status  int,
  error        text,
  at           timestamptz not null default now(),
  constraint roster_webhook_deliveries_event_fk foreign key (business_id, event_id)
    references public.roster_events (business_id, id) on delete cascade
);
-- an earlier version of this table said 'delivered' where it now says 'ok'
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.roster_webhook_deliveries'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%delivered%' loop
    execute format('alter table public.roster_webhook_deliveries drop constraint %I', c);
    update public.roster_webhook_deliveries set status = 'ok' where status = 'delivered';
    alter table public.roster_webhook_deliveries add constraint roster_webhook_deliveries_status_check check (status in ('ok', 'failed'));
  end loop;
end $$;

create table if not exists public.roster_mail_templates (
  business_id  uuid not null default public.roster_current_business() references public.roster_businesses(id) on delete cascade,
  key          text not null,
  subject      text not null check (char_length(subject) between 1 and 300),
  html         text not null,
  updated_at   timestamptz not null default now(),
  primary key (business_id, key)
);
-- The key and size rules are named constraints, so a database made by the earlier version of this file (which had them
-- inline: six keys, html up to 100000 characters) can be upgraded in place: its two inline checks are dropped and the
-- new ones added. The key list grew by two (admin_account_linked, admin_phone_conflict), so every old row still
-- satisfies it. The size rule is the one that can break old rows (html over 20000 characters, a poison template with
-- hundreds of data-if), so it is NOT VALID: old rows stay, a changed row must obey. A template of more than 50
-- data-if, or more than 20000 characters, is what froze the Worker's renderer.
do $$
declare c record;
begin
  for c in select conname, pg_get_constraintdef(oid) as d from pg_constraint where conrelid = 'public.roster_mail_templates'::regclass and contype = 'c' loop
    if (c.d like '%admin_signup%' and c.conname <> 'roster_mail_templates_key_known')
       or (c.d like '%char_length(html)%' and c.conname <> 'roster_mail_templates_html_size') then
      execute format('alter table public.roster_mail_templates drop constraint %I', c.conname);
    end if;
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'roster_mail_templates_key_known' and conrelid = 'public.roster_mail_templates'::regclass) then
    alter table public.roster_mail_templates add constraint roster_mail_templates_key_known check (key in (
      'admin_signup', 'admin_payment_reported', 'admin_account_linked', 'admin_phone_conflict',
      'registered', 'payment_confirmed', 'refund', 'registration_cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'roster_mail_templates_html_size' and conrelid = 'public.roster_mail_templates'::regclass) then
    alter table public.roster_mail_templates add constraint roster_mail_templates_html_size check (
      char_length(html) between 1 and 20000 and (char_length(html) - char_length(replace(html, 'data-if', ''))) <= 50 * 7) not valid;
  end if;
end $$;
create or replace function public.roster_touch_updated_at()
returns trigger language plpgsql as $fn$
begin new.updated_at := now(); return new; end $fn$;
drop trigger if exists roster_mail_templates_t on public.roster_mail_templates;
create trigger roster_mail_templates_t before insert or update on public.roster_mail_templates
  for each row execute function public.roster_touch_updated_at();

create table if not exists public.roster_mail_log (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.roster_businesses(id) on delete cascade,
  participant_id  uuid,
  event_id        bigint,
  meeting_id      uuid,                              -- for "once per meeting" rules
  template        text not null,
  to_addr         text not null default '',
  subject         text,
  html            text,
  status          text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error           text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  unique (business_id, id),
  constraint roster_mail_log_participant_fk foreign key (business_id, participant_id)
    references public.roster_participants (business_id, id) on delete set null (participant_id),
  constraint roster_mail_log_event_fk foreign key (business_id, event_id)
    references public.roster_events (business_id, id) on delete set null (event_id)
);

-- a note can point at the mail it records (the admin opens the exact HTML that was sent)
alter table public.roster_notes add column if not exists mail_id      uuid;
alter table public.roster_notes add column if not exists mail_failed  boolean not null default false;
alter table public.roster_notes add column if not exists mail_noaddr  boolean not null default false;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'roster_notes_mail_fk' and conrelid = 'public.roster_notes'::regclass) then
    alter table public.roster_notes add constraint roster_notes_mail_fk foreign key (business_id, mail_id)
      references public.roster_mail_log (business_id, id) on delete set null (mail_id);
  end if;
end $$;

-- Google accounts of the personal area, linked to a participant (harpatka_members, per business).
create table if not exists public.roster_members (
  business_id     uuid not null references public.roster_businesses(id) on delete cascade,
  user_id         uuid not null,
  email           text not null default '',
  google_name     text not null default '',
  participant_id  uuid,
  status          text not null default 'approved' check (status in ('approved', 'blocked', 'removed')),
  created_at      timestamptz not null default now(),
  primary key (business_id, user_id),
  constraint roster_members_participant_fk foreign key (business_id, participant_id)
    references public.roster_participants (business_id, id) on delete set null (participant_id)
);
create unique index if not exists roster_members_approved_uq on public.roster_members (business_id, participant_id) where status = 'approved';

-- An unlink (participant_id set to null) always means "removed", whatever status came with it.
create or replace function public.roster_members_trg()
returns trigger language plpgsql as $fn$
begin
  if new.participant_id is null and new.status = 'approved' then new.status := 'removed'; end if;
  return new;
end $fn$;
drop trigger if exists roster_members_t on public.roster_members;
create trigger roster_members_t before update on public.roster_members
  for each row execute function public.roster_members_trg();

create index if not exists roster_api_keys_business_idx   on public.roster_api_keys (business_id);
create index if not exists roster_participant_tokens_idx  on public.roster_participant_tokens (business_id, participant_id);
create index if not exists roster_participant_tokens_exp  on public.roster_participant_tokens (expires_at);
create index if not exists roster_rate_window_idx         on public.roster_rate (window_start);
create index if not exists roster_events_claim_idx        on public.roster_events (status, next_attempt_at) where status in ('pending', 'processing');
create index if not exists roster_events_business_idx     on public.roster_events (business_id, id desc);
create index if not exists roster_events_pending_idx      on public.roster_events (business_id) where status in ('pending', 'processing');   -- the per-business cap
create index if not exists roster_events_finished_idx     on public.roster_events (created_at) where status in ('done', 'failed');           -- retention
create index if not exists roster_events_participant_idx  on public.roster_events (business_id, (payload #>> '{participant,id}'));           -- deleting a participant
create index if not exists roster_mail_log_created_idx    on public.roster_mail_log (created_at);                                              -- retention
create index if not exists roster_webhook_deliveries_idx  on public.roster_webhook_deliveries (business_id, event_id, attempt);
create index if not exists roster_mail_log_business_idx   on public.roster_mail_log (business_id, created_at desc);
create index if not exists roster_mail_log_recipient_idx  on public.roster_mail_log (business_id, to_addr, created_at);
create index if not exists roster_mail_log_event_idx      on public.roster_mail_log (event_id);
create index if not exists roster_mail_log_participant_idx on public.roster_mail_log (participant_id, template);
create index if not exists roster_members_participant_idx on public.roster_members (business_id, participant_id);
create index if not exists roster_idempotency_payment_idx on public.roster_idempotency (payment_id);

-- ---- 12.4 who may touch the new tables -----------------------------------
-- Same rule as the data tables (membership, plus the header when there is one), but each table
-- gets only the verbs it needs. Service-only tables get RLS and no policy at all.
do $$
declare
  t text;
  cur  text := '(select public.roster_current_business())';
  seen text := 'public.roster_can(business_id) and (' || cur || ' is null or business_id = ' || cur || ')';
  made text := 'public.roster_can(business_id) and business_id = ' || cur;
begin
  foreach t in array array['roster_business_settings', 'roster_api_keys', 'roster_participant_tokens', 'roster_idempotency', 'roster_rate',
                           'roster_events', 'roster_webhook_deliveries', 'roster_mail_templates', 'roster_mail_log', 'roster_members'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;

  -- service only: nothing for a signed-in account
  foreach t in array array['roster_participant_tokens', 'roster_idempotency', 'roster_rate'] loop
    execute format('revoke all on public.%I from authenticated', t);
  end loop;

  -- read only for the business's accounts
  foreach t in array array['roster_events', 'roster_webhook_deliveries', 'roster_mail_log'] loop
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "members read their business" on public.%I', t);
    execute format('create policy "members read their business" on public.%I for select to authenticated using (%s)', t, seen);
  end loop;

  -- keys: every column except key_hash; no write at all (roster_key_create / roster_key_revoke do it)
  revoke all on public.roster_api_keys from authenticated;
  grant select (id, business_id, kind, prefix, label, allowed_origins, created_by, created_at, last_used_at, revoked_at) on public.roster_api_keys to authenticated;
  drop policy if exists "members read their business" on public.roster_api_keys;
  execute format('create policy "members read their business" on public.roster_api_keys for select to authenticated using (%s)', seen);

  -- settings: every column except webhook_secret to read (webhook_secret_set says whether one exists); to write every
  -- column except webhook_secret and the generated webhook_secret_set (updated_at is overwritten by the trigger and
  -- business_id cannot move to another business: the WITH CHECK below); no insert or delete
  revoke all on public.roster_business_settings from authenticated;
  grant select (business_id, registration_open, signup_required, personal_area_enabled, participant_mail_enabled, notify_emails, contact_email,
                sender_name, contact_whatsapp, payment_url, webhook_url, webhook_events, webhook_secret_set, updated_at) on public.roster_business_settings to authenticated;
  grant update (business_id, registration_open, signup_required, personal_area_enabled, participant_mail_enabled, notify_emails, contact_email,
                sender_name, contact_whatsapp, payment_url, webhook_url, webhook_events, updated_at) on public.roster_business_settings to authenticated;
  drop policy if exists "members read their business" on public.roster_business_settings;
  execute format('create policy "members read their business" on public.roster_business_settings for select to authenticated using (%s)', seen);
  drop policy if exists "members change their business" on public.roster_business_settings;
  execute format('create policy "members change their business" on public.roster_business_settings for update to authenticated using (%s) with check (%s)', seen, made);

  -- templates: full control of the business's own overrides
  revoke all on public.roster_mail_templates from authenticated;
  grant select, insert, update, delete on public.roster_mail_templates to authenticated;
  drop policy if exists "members read their business" on public.roster_mail_templates;
  execute format('create policy "members read their business" on public.roster_mail_templates for select to authenticated using (%s)', seen);
  drop policy if exists "members add to their business" on public.roster_mail_templates;
  execute format('create policy "members add to their business" on public.roster_mail_templates for insert to authenticated with check (%s)', made);
  drop policy if exists "members change their business" on public.roster_mail_templates;
  execute format('create policy "members change their business" on public.roster_mail_templates for update to authenticated using (%s) with check (%s)', seen, made);
  drop policy if exists "members remove from their business" on public.roster_mail_templates;
  execute format('create policy "members remove from their business" on public.roster_mail_templates for delete to authenticated using (%s)', seen);

  -- members of the personal area: the business's accounts read them, and unlink or block (status, participant_id)
  revoke all on public.roster_members from authenticated;
  grant select on public.roster_members to authenticated;
  grant update (status, participant_id) on public.roster_members to authenticated;
  drop policy if exists "members read their business" on public.roster_members;
  execute format('create policy "members read their business" on public.roster_members for select to authenticated using (%s)', seen);
  drop policy if exists "members change their business" on public.roster_members;
  execute format('create policy "members change their business" on public.roster_members for update to authenticated using (%s) with check (%s)', seen, made);
end $$;

-- The system message template of a business ("אישור מקום", system_key 'confirm'): made once, with the text it ships with.
-- Run again it only refreshes default_body and leaves an edited body alone.
create or replace function public.roster_msg_template_seed(b uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare txt constant text := E'שלום {שם} 🙂\n{תשלום}\n\n{פרטי המפגש}\n\n{איך מגיעים}\n\nנתראה,';
begin
  insert into public.roster_msg_templates (business_id, system_key, name, body, default_body)
    values (b, 'confirm', 'אישור מקום', txt, txt)
    on conflict (business_id, system_key) where system_key is not null do update set default_body = excluded.default_body;
end $fn$;

-- What a signed-in account may do to a system template: change its text (and its name or order), nothing else. It cannot
-- delete it, cannot change system_key or default_body, and cannot make a system template of its own. The seed above and
-- the cascade of a deleted business run as the table owner, not as the signed-in role, so they are not in the way.
create or replace function public.roster_msg_template_guard() returns trigger
language plpgsql as $fn$
begin
  if current_user = 'authenticated' then
    if tg_op = 'DELETE' then
      if old.system_key is not null then raise exception 'a system template cannot be deleted' using errcode = '42501'; end if;
    elsif tg_op = 'INSERT' then
      if new.system_key is not null or new.default_body is not null then raise exception 'a system template is made by the database' using errcode = '42501'; end if;
    elsif new.system_key is distinct from old.system_key or new.default_body is distinct from old.default_body then
      raise exception 'system_key and default_body of a template cannot be changed' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $fn$;
drop trigger if exists roster_msg_template_guard on public.roster_msg_templates;
create trigger roster_msg_template_guard before insert or update or delete on public.roster_msg_templates
  for each row execute function public.roster_msg_template_guard();

-- every business has a settings row (a secret ready for the webhook) and its system message template, now and from here on
create or replace function public.roster_business_settings_new()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  begin
    insert into public.roster_business_settings (business_id, webhook_secret) values (new.id, 'whsec_' || public.roster_random_text(40)) on conflict do nothing;
  exception when others then
    null;
  end;
  begin
    perform public.roster_msg_template_seed(new.id);
  exception when others then
    null;
  end;
  return null;
exception when others then
  return null;
end $fn$;
drop trigger if exists roster_business_settings_new_t on public.roster_businesses;
create trigger roster_business_settings_new_t after insert on public.roster_businesses
  for each row execute function public.roster_business_settings_new();

insert into public.roster_business_settings (business_id, webhook_secret)
  select b.id, 'whsec_' || public.roster_random_text(40) from public.roster_businesses b
   where not exists (select 1 from public.roster_business_settings s where s.business_id = b.id);
-- every business that exists already gets its system message template
select public.roster_msg_template_seed(b.id) from public.roster_businesses b;
-- A settings row made before the secret existed gets one, and a row saved before first_name and phone were always required
-- has them added (the trigger does it). One row at a time, and a row that an older, looser rule let in and a newer rule
-- refuses (a payment link with a zero-width character, a webhook on another port) is skipped: loading this file never fails
-- because of what an earlier version accepted.
do $$
declare r record;
begin
  for r in select business_id from public.roster_business_settings where webhook_secret is null loop
    begin
      update public.roster_business_settings set webhook_secret = 'whsec_' || public.roster_random_text(40) where business_id = r.business_id;
    exception when others then null;
    end;
  end loop;
  for r in select business_id from public.roster_business_settings
            where not (signup_required @> array['first_name', 'phone']::text[]) and (contact_whatsapp is null or contact_whatsapp ~ '^[0-9]{8,15}$') loop
    begin
      update public.roster_business_settings set signup_required = signup_required where business_id = r.business_id;
    exception when others then null;
    end;
  end loop;
end $$;

-- ---- 12.5 rate limits, keys -----------------------------------------------

-- The one way a counter is taken. 0 when the call is counted (there was room), else the seconds until room frees
-- up, and the refused call is NOT counted (so hammering a full bucket does not keep it full).
--   * the minute bucket is bumped by ONE statement (insert .. on conflict do update), atomic by itself;
--   * an advisory lock per bucket makes the sliding-window sum that follows atomic too: two parallel calls cannot
--     both take the last place (they queue on the lock for the length of this one transaction).
create or replace function public.roster_rate_take(p_bucket text, p_window_minutes int, p_limit int)
returns int language plpgsql security definer set search_path = public as $fn$
declare total bigint; oldest timestamptz; slot timestamptz := date_trunc('minute', now());
begin
  perform pg_advisory_xact_lock(hashtextextended('roster_rate:' || p_bucket, 0));
  insert into public.roster_rate (bucket, window_start, hits) values (p_bucket, slot, 1)
    on conflict (bucket, window_start) do update set hits = public.roster_rate.hits + 1;
  select coalesce(sum(hits), 0), min(window_start) filter (where hits > 0) into total, oldest
    from public.roster_rate where bucket = p_bucket and window_start > now() - make_interval(mins => p_window_minutes);
  if total > p_limit then
    update public.roster_rate set hits = greatest(hits - 1, 0) where bucket = p_bucket and window_start = slot;
    return greatest(1, ceil(extract(epoch from (coalesce(oldest, slot) + make_interval(mins => p_window_minutes) - now())))::int);
  end if;
  return 0;
end $fn$;

-- Undo one counted call of a bucket (a call that took a place in one bucket and was refused by a second one).
create or replace function public.roster_rate_give_back(p_bucket text)
returns void language sql security definer set search_path = public as $fn$
  update public.roster_rate set hits = greatest(hits - 1, 0) where bucket = p_bucket and window_start = date_trunc('minute', now());
$fn$;

create or replace function public.roster_rate_cleanup()
returns int language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  delete from public.roster_rate where window_start < now() - interval '2 hours';
  get diagnostics n = row_count;
  delete from public.roster_participant_tokens where expires_at < now() - interval '1 day';
  return n;
end $fn$;

-- Retention. Run from roster_events_claim, at most once per ten minutes (the marker is a roster_rate row; p_force skips
-- the marker): finished events (done or failed) after 30 days, with their deliveries; the HTML of a mail after 30 days
-- (the recipient, subject and status stay); the mail log row itself after 90 days; keys revoked 90 days ago; then the old rate windows and tokens.
-- At most 5000 rows of each kind per run, so one run is short.
create or replace function public.roster_retention(p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare slot timestamptz := date_trunc('hour', now()) + floor(extract(minute from now()) / 10) * interval '10 minutes'; n int; e int; h int; m int;
begin
  insert into public.roster_rate (bucket, window_start, hits) values ('retention:run', slot, 1) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 and not coalesce(p_force, false) then return null; end if;
  delete from public.roster_events where id in (select x.id from public.roster_events x where x.status in ('done', 'failed') and x.created_at < now() - interval '30 days' limit 5000);
  get diagnostics e = row_count;
  update public.roster_mail_log set html = '' where id in (select x.id from public.roster_mail_log x where x.created_at < now() - interval '30 days' and coalesce(x.html, '') <> '' limit 5000);
  get diagnostics h = row_count;
  delete from public.roster_mail_log where id in (select x.id from public.roster_mail_log x where x.created_at < now() - interval '90 days' limit 5000);
  get diagnostics m = row_count;
  delete from public.roster_api_keys where revoked_at is not null and revoked_at < now() - interval '90 days';
  perform public.roster_rate_cleanup();
  return jsonb_build_object('events', e, 'html_blanked', h, 'mail_log', m);
end $fn$;

-- The key behind a hash, or an all-null record when there is none or it was revoked.
create or replace function public.roster_api_key_of(p_hash text)
returns public.roster_api_keys language plpgsql stable security definer set search_path = public as $fn$
declare k public.roster_api_keys;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return k; end if;
  select * into k from public.roster_api_keys where key_hash = p_hash and revoked_at is null;
  return k;
end $fn$;

-- The gate every API call goes through first: which key, whether its kind is allowed here (p_required_kind:
-- 'public', 'secret' or 'any'), whether the caller's Origin is allowed, and the rate limits. All counters go through
-- roster_rate_take (atomic, and a call refused by a second bucket gives back its place in the first).
--   p_bucket 'signup': 6 per ip per 10 min, 120 per key per hour.
--   p_bucket 'click':  30 per ip per 10 min.
--   anything else is a read: 120 per minute per (key, ip) and 300 per key per minute.
--   a secret key: 600 per key per minute whatever the bucket.
--   a key that does not exist: 60 per ip per 10 min, then rate_limited (strangers guessing keys).
create or replace function public.roster_api_auth(p_key_hash text, p_required_kind text, p_origin text, p_ip_hash text, p_bucket text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  k public.roster_api_keys;
  need text := coalesce(nullif(p_required_kind, ''), 'any');
  origin text := lower(nullif(btrim(coalesce(p_origin, '')), ''));
  iph text := nullif(p_ip_hash, '');
  r1 int := 0; r2 int := 0;
begin
  k := public.roster_api_key_of(p_key_hash);
  if k.id is null then
    if iph is not null then
      r1 := public.roster_rate_take('badkey:' || iph, 10, 60);
      if r1 > 0 then return jsonb_build_object('error', 'rate_limited', 'retry_after', r1); end if;
    end if;
    return jsonb_build_object('error', 'invalid_key');
  end if;
  if need in ('public', 'secret') and k.kind <> need then return jsonb_build_object('error', 'wrong_key_kind'); end if;
  if k.kind = 'secret' and origin is not null then return jsonb_build_object('error', 'secret_key_in_browser'); end if;
  if k.kind = 'public' and coalesce(cardinality(k.allowed_origins), 0) > 0 and (origin is null or not origin = any (k.allowed_origins)) then
    return jsonb_build_object('error', 'origin_not_allowed');
  end if;

  if k.kind = 'secret' then
    r1 := public.roster_rate_take('secret:' || k.id, 1, 600);
    if r1 > 0 then return jsonb_build_object('error', 'rate_limited', 'retry_after', r1); end if;
  elsif p_bucket = 'signup' then
    if iph is not null then
      r1 := public.roster_rate_take('signup:ip:' || iph, 10, 6);
      if r1 > 0 then return jsonb_build_object('error', 'rate_limited', 'retry_after', r1); end if;
    end if;
    r2 := public.roster_rate_take('signup:key:' || k.id, 60, 120);
    if r2 > 0 then
      if iph is not null then perform public.roster_rate_give_back('signup:ip:' || iph); end if;
      return jsonb_build_object('error', 'rate_limited', 'retry_after', r2);
    end if;
  elsif p_bucket = 'click' then
    if iph is not null then
      r1 := public.roster_rate_take('click:ip:' || iph, 10, 30);
      if r1 > 0 then return jsonb_build_object('error', 'rate_limited', 'retry_after', r1); end if;
    end if;
  else
    if iph is not null then
      r1 := public.roster_rate_take('read:ip:' || k.id || ':' || iph, 1, 120);
      if r1 > 0 then return jsonb_build_object('error', 'rate_limited', 'retry_after', r1); end if;
    end if;
    r2 := public.roster_rate_take('read:key:' || k.id, 1, 300);
    if r2 > 0 then
      if iph is not null then perform public.roster_rate_give_back('read:ip:' || k.id || ':' || iph); end if;
      return jsonb_build_object('error', 'rate_limited', 'retry_after', r2);
    end if;
  end if;

  if random() < 0.02 then perform public.roster_rate_cleanup(); end if;
  update public.roster_api_keys set last_used_at = now() where id = k.id and (last_used_at is null or last_used_at < now() - interval '1 minute');
  return jsonb_build_object('ok', true, 'kind', k.kind);
end $fn$;

-- ---- 12.6 settings and json builders ---------------------------------------

create or replace function public.roster_settings_of(b uuid)
returns public.roster_business_settings language plpgsql security definer set search_path = public as $fn$
declare s public.roster_business_settings;
begin
  select * into s from public.roster_business_settings where business_id = b;
  if not found then
    insert into public.roster_business_settings (business_id, webhook_secret) values (b, 'whsec_' || public.roster_random_text(40)) on conflict do nothing;
    select * into s from public.roster_business_settings where business_id = b;
  end if;
  return s;
exception when others then
  return null;
end $fn$;



create or replace function public.roster_participant_json(p public.roster_participants)
returns jsonb language sql stable as $fn$
  select jsonb_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'phone', p.phone, 'email', p.email,
    'age', public.roster_current_age(p.age, p.age_set_at), 'gender', p.gender);
$fn$;

-- how many active participants hold a place in a meeting
create or replace function public.roster_registered_count(b uuid, mid uuid)
returns int language sql stable security definer set search_path = public as $fn$
  select count(*)::int from public.roster_attendance a
    join public.roster_participants p on p.id = a.participant_id and p.business_id = a.business_id
   where a.business_id = b and a.meeting_id = mid and p.active;
$fn$;

-- The meeting as the API shows it. secret = adds directions, registered and type.
create or replace function public.roster_meeting_json(m public.roster_meetings, secret boolean, today date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare tname text; reg int; cap int := m.max_participants; o jsonb;
begin
  select name into tname from public.roster_meeting_types where id = m.type_id and business_id = m.business_id;
  reg := public.roster_registered_count(m.business_id, m.id);
  o := jsonb_build_object('id', m.id, 'date', to_char(m.meeting_date, 'YYYY-MM-DD'), 'time', to_char(m.meeting_time, 'HH24:MI'),
    'name', coalesce(nullif(btrim(m.name), ''), nullif(btrim(tname), '')), 'city', m.city, 'place', m.place,
    'capacity', cap, 'spots_left', case when cap is null then null else greatest(cap - reg, 0) end,
    'full', coalesce(cap is not null and reg >= cap, false),
    'price', public.roster_meeting_price(m.price_tiers, greatest(m.meeting_date - today, 0)), 'price_tiers', m.price_tiers);
  if secret then
    o := o || jsonb_build_object('directions', m.directions, 'registered', reg,
      'type', tname);   -- the meeting type's NAME, or null
  end if;
  return o;
end $fn$;

-- credit = deposits and credits, minus refunds and payments paid from credit
create or replace function public.roster_balance(b uuid, pid uuid)
returns numeric language sql stable security definer set search_path = public as $fn$
  select coalesce(sum(case when kind in ('credit', 'deposit') then amount
                           when kind in ('payment', 'refund') and coalesce(from_credit, false) then -amount else 0 end), 0)
    from public.roster_payments where business_id = b and participant_id = pid;
$fn$;

create or replace function public.roster_paid_for(b uuid, pid uuid, mid uuid)
returns numeric language sql stable security definer set search_path = public as $fn$
  select coalesce(sum(case when p.kind = 'payment' then p.amount when p.kind = 'credit' or (p.kind = 'refund' and not coalesce(p.from_credit, false)) then -p.amount else 0 end), 0)
    from public.roster_payments p where p.business_id = b and p.participant_id = pid and p.meeting_id = mid;
$fn$;

-- All future meetings (registered or not) and the past ones the person was registered to.
-- for_me adds what the personal area shows (max, rejected, full, spots_left).
create or replace function public.roster_person_meetings(b uuid, pid uuid, for_me boolean)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare today date := public.roster_today(); out jsonb;
begin
  select coalesce(jsonb_agg(x order by (x->>'date'), (x->>'time')), '[]'::jsonb) into out from (
    select jsonb_build_object(
      'id', mt.id, 'date', to_char(mt.meeting_date, 'YYYY-MM-DD'), 'time', to_char(mt.meeting_time, 'HH24:MI'),
      'name', coalesce(nullif(btrim(mt.name), ''), nullif(btrim(ty.name), '')), 'city', mt.city, 'place', mt.place,
      -- The address is given after payment. The secret API summary (for_me false) always carries it; the personal area
      -- (for_me) only for a meeting this participant is registered to AND has paid in full, is not charged for, or that
      -- costs nothing. Anybody can link an account to any phone, so a link alone must not open the address.
      'directions', case when not for_me then mt.directions
                         when a.participant_id is not null
                              and (coalesce(a.no_pay, false)
                                   or public.roster_meeting_price(mt.price_tiers, greatest(mt.meeting_date - today, 0)) <= 0
                                   or (public.roster_paid_for(b, pid, mt.id) > 0 and coalesce(a.pay_due_amount, 0) = 0)) then mt.directions
                         else null end,
      'registered', a.participant_id is not null, 'attended', coalesce(a.attended, false),
      'paid', public.roster_paid_for(b, pid, mt.id),
      'price', public.roster_meeting_price(mt.price_tiers, greatest(mt.meeting_date - today, 0)),
      'due', a.pay_due_amount, 'reported', a.pay_reported_at is not null,
      'reported_amount', case when a.pay_reported_at is not null then a.pay_reported_amount end,
      'free', coalesce(a.no_pay, false), 'future', mt.meeting_date >= today)
      || case when for_me then jsonb_build_object('max', mt.max_participants,
           'rejected', a.pay_rejected_at is not null and a.pay_reported_at is null,
           'full', coalesce(mt.max_participants is not null and public.roster_registered_count(b, mt.id) >= mt.max_participants, false),
           'spots_left', case when mt.max_participants is null then null else greatest(mt.max_participants - public.roster_registered_count(b, mt.id), 0) end)
         else '{}'::jsonb end as x
    from public.roster_meetings mt
    left join public.roster_meeting_types ty on ty.id = mt.type_id and ty.business_id = mt.business_id
    left join public.roster_attendance a on a.business_id = mt.business_id and a.meeting_id = mt.id and a.participant_id = pid
   where mt.business_id = b and (mt.meeting_date >= today or a.participant_id is not null)
  ) s;
  return out;
end $fn$;

create or replace function public.roster_person_json(b uuid, pid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare p public.roster_participants;
begin
  select * into p from public.roster_participants where id = pid and business_id = b;
  if not found then return null; end if;
  return public.roster_participant_json(p) || jsonb_build_object('active', p.active, 'balance', public.roster_balance(b, pid),
    'meetings', public.roster_person_meetings(b, pid, false));
end $fn$;

-- ---- 12.7 effects shared by the API and the personal area -----------------

-- Register a participant to a meeting. 'registered' | 'exists' | 'past' | 'full' | 'not_found'.
-- A removed participant who registers is active again.
create or replace function public.roster_attach(b uuid, pid uuid, mid uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare mt public.roster_meetings;
begin
  select * into mt from public.roster_meetings where id = mid and business_id = b;
  if not found then return 'not_found'; end if;
  if mt.meeting_date < public.roster_today() then return 'past'; end if;
  if exists (select 1 from public.roster_attendance where business_id = b and participant_id = pid and meeting_id = mid) then return 'exists'; end if;
  perform pg_advisory_xact_lock(hashtext(mid::text));
  if mt.max_participants is not null and public.roster_registered_count(b, mid) >= mt.max_participants then return 'full'; end if;
  update public.roster_participants set active = true where id = pid and business_id = b and not active;
  insert into public.roster_attendance (business_id, participant_id, meeting_id) values (b, pid, mid) on conflict do nothing;
  return 'registered';
end $fn$;

-- harpatka_report_payment_core: the participant clicked "I paid".
-- 'reported' | 'already_reported' | 'already_paid' | 'free' | 'not_registered' | 'past' (the meeting does not exist)
create or replace function public.roster_report_core(b uuid, pid uuid, mid uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare mt public.roster_meetings; a public.roster_attendance; paid numeric; due numeric; amt numeric;
begin
  perform pg_advisory_xact_lock(hashtext(pid::text));   -- one report or spend of this participant at a time
  select * into mt from public.roster_meetings where id = mid and business_id = b;
  if not found then return 'past'; end if;
  select * into a from public.roster_attendance where business_id = b and participant_id = pid and meeting_id = mid;
  if not found then return 'not_registered'; end if;
  paid := public.roster_paid_for(b, pid, mid);
  due := nullif(a.pay_due_amount, 0);
  if coalesce(a.no_pay, false) then return 'free'; end if;
  if paid > 0 and due is null then return 'already_paid'; end if;
  if a.pay_reported_at is not null then return 'already_reported'; end if;
  amt := coalesce(due, public.roster_meeting_price(mt.price_tiers, greatest(mt.meeting_date - public.roster_today(), 0)));
  update public.roster_attendance set pay_reported_at = now(), pay_reported_amount = amt, pay_rejected_at = null
   where business_id = b and participant_id = pid and meeting_id = mid;
  perform public.roster_sys_note(b, pid, 'דווח על תשלום' || coalesce(' ₪' || public.roster_money(amt), '') || ' למפגש ' || public.roster_meeting_short(b, mid) || ' (ממתין לאימות)',
    'payment_reported', mid, null, amt);
  return 'reported';
end $fn$;

-- harpatka_me_pay_credit: pay a meeting from the participant's credit.
create or replace function public.roster_pay_credit_core(b uuid, pid uuid, mid uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare mt public.roster_meetings; a public.roster_attendance; pa public.roster_participants;
        price numeric; due numeric; bal numeric; amt numeric; rem numeric; st text;
begin
  -- The balance is read, then spent. Without this lock two parallel calls both read the same credit and both spend
  -- it. The lock is per participant and held to the end of the transaction, so the second call reads the first's result.
  perform pg_advisory_xact_lock(hashtext(pid::text));
  bal := public.roster_balance(b, pid);
  select * into mt from public.roster_meetings where id = mid and business_id = b;
  if not found then st := 'missing';
  else
    select * into a from public.roster_attendance where business_id = b and participant_id = pid and meeting_id = mid;
    if not found then st := 'not_registered';
    elsif coalesce(a.no_pay, false) then st := 'free';
    elsif public.roster_paid_for(b, pid, mid) > 0 then st := 'already';
    else
      price := public.roster_meeting_price(mt.price_tiers, greatest(mt.meeting_date - public.roster_today(), 0));
      due := greatest(coalesce(price, 0), 0);
      if due <= 0 then st := 'already';
      elsif bal <= 0 then st := 'no_credit';
      end if;
    end if;
  end if;
  if st is not null then
    return jsonb_build_object('status', st, 'allocated', 0, 'remaining', 0, 'credit_left', bal);
  end if;
  amt := least(bal, due);
  select * into pa from public.roster_participants where id = pid and business_id = b;
  insert into public.roster_payments (business_id, participant_id, meeting_id, kind, amount, from_credit, author_name)
    values (b, pid, mid, 'payment', amt, true, coalesce(nullif(pa.name, ''), 'משתתף'));
  rem := due - amt;
  if rem > 0 then
    update public.roster_attendance set pay_due_amount = rem where business_id = b and participant_id = pid and meeting_id = mid;
  end if;
  return jsonb_build_object('status', 'ok', 'allocated', amt, 'remaining', greatest(rem, 0), 'credit_left', bal - amt);
end $fn$;

-- A payment recorded: a payment that is a partial one (reason partial_due:<n>) leaves n to pay; any payment
-- clears the "I paid" report and the rejection of that meeting. (Widens section 8's trigger function.)
create or replace function public.roster_pay_due() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare rem numeric;
begin
  if new.meeting_id is not null and new.kind = 'payment' then
    rem := nullif(substring(coalesce(new.reason, '') from '^partial_due:([0-9]+(?:\.[0-9]+)?)$'), '')::numeric;
    update public.roster_attendance set pay_due_amount = rem, pay_reported_at = null, pay_reported_amount = null, pay_rejected_at = null
     where business_id = new.business_id and participant_id = new.participant_id and meeting_id = new.meeting_id
       and (rem is not null or pay_due_amount is not null or pay_reported_at is not null or pay_rejected_at is not null);
    if rem is not null then
      perform public.roster_sys_note(new.business_id, new.participant_id,
        'נשאר לשלם ₪' || public.roster_money(rem) || ' למפגש ' || public.roster_meeting_short(new.business_id, new.meeting_id),
        'payment_due', new.meeting_id);
    end if;
  end if;
  return null;
end $fn$;

-- ---- 12.8 events: the triggers that fill the outbox ------------------------

-- who made the change: api / me (set by those functions), admin (a signed-in account writing directly), or system
create or replace function public.roster_event_source()
returns text language plpgsql stable as $fn$
declare s text := nullif(current_setting('roster.source', true), '');
begin
  if s is not null then return s; end if;
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated' then return 'admin'; end if;
  return 'system';
end $fn$;

-- Enqueue an event, but only when something can use it: the business has a webhook that wants this type, or a mail
-- rule can apply (cheap test; the exact decision is made when the event is claimed). A mail rule counts as applicable
-- whether or not the participant has an address, so the "no address" warning is written the same way every time.
-- Two events are internal (participant.linked: an account got linked to an existing participant; participant.phone_conflict:
-- an account tried a phone another account holds): they only ever reach the business's own admins by mail, never a
-- customer webhook, whatever webhook_events says. A business may hold at most 500 unfinished events; one more is not
-- queued but counted (roster_rate bucket events_dropped:<business>), so one business cannot grow the outbox without
-- bound. Never raises.
create or replace function public.roster_emit(p_business uuid, p_type text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $fn$
declare s public.roster_business_settings; wh boolean; ml boolean; notify boolean; src text := public.roster_event_source();
begin
  if p_business is null or not exists (select 1 from public.roster_businesses where id = p_business) then return; end if;
  s := public.roster_settings_of(p_business);
  if s.business_id is null then return; end if;
  wh := s.webhook_url is not null and p_type not in ('participant.linked', 'participant.phone_conflict')
        and (s.webhook_events is null or p_type = any (s.webhook_events));
  notify := coalesce(cardinality(s.notify_emails), 0) > 0 or exists (select 1 from public.roster_business_users where business_id = p_business);
  ml := case p_type
    when 'participant.created' then notify and src <> 'admin'
    when 'payment.reported' then notify
    when 'participant.linked' then notify
    when 'participant.phone_conflict' then notify
    when 'registration.created' then s.participant_mail_enabled
    when 'registration.cancelled' then s.participant_mail_enabled
    when 'payment.recorded' then s.participant_mail_enabled and (p_payload #>> '{payment,kind}') in ('payment', 'refund')
    else false end;
  if p_type = 'ping' or wh or coalesce(ml, false) then
    if (select count(*) from public.roster_events where business_id = p_business and status in ('pending', 'processing')) >= 500 then
      insert into public.roster_rate (bucket, window_start, hits) values ('events_dropped:' || p_business, date_trunc('minute', now()), 1)
        on conflict (bucket, window_start) do update set hits = public.roster_rate.hits + 1;
      return;
    end if;
    insert into public.roster_events (business_id, type, payload, source) values (p_business, p_type, coalesce(p_payload, '{}'::jsonb), src);
  end if;
exception when others then
  null;
end $fn$;

-- participant.created is for a participant that has a name. A participant made by the personal area with just a phone
-- has none yet: roster_me_complete emits the event when the names are first filled in.
create or replace function public.roster_ev_participant() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if btrim(coalesce(new.first_name, '') || coalesce(new.last_name, '')) <> '' then
    perform public.roster_emit(new.business_id, 'participant.created', jsonb_build_object('participant', public.roster_participant_json(new)));
  end if;
  return null;
exception when others then
  return null;
end $fn$;
drop trigger if exists roster_ev_participant on public.roster_participants;
create trigger roster_ev_participant after insert on public.roster_participants
  for each row execute function public.roster_ev_participant();

create or replace function public.roster_ev_attendance() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare p public.roster_participants; mt public.roster_meetings; b uuid; pid uuid; mid uuid;
begin
  b := case when tg_op = 'DELETE' then old.business_id else new.business_id end;
  pid := case when tg_op = 'DELETE' then old.participant_id else new.participant_id end;
  mid := case when tg_op = 'DELETE' then old.meeting_id else new.meeting_id end;
  select * into p from public.roster_participants where id = pid and business_id = b;
  select * into mt from public.roster_meetings where id = mid and business_id = b;
  if p.id is null or mt.id is null then return null; end if;
  perform public.roster_emit(b, case when tg_op = 'DELETE' then 'registration.cancelled' else 'registration.created' end,
    jsonb_build_object('participant', public.roster_participant_json(p), 'meeting', public.roster_meeting_brief(mt)));
  return null;
exception when others then
  return null;
end $fn$;

-- {id, date, time, name, city, place} of a meeting, for payloads
create or replace function public.roster_meeting_brief(m public.roster_meetings)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object('id', m.id, 'date', to_char(m.meeting_date, 'YYYY-MM-DD'), 'time', to_char(m.meeting_time, 'HH24:MI'),
    'name', coalesce(nullif(btrim(m.name), ''), (select nullif(btrim(t.name), '') from public.roster_meeting_types t where t.id = m.type_id and t.business_id = m.business_id)),
    'city', m.city, 'place', m.place);
$fn$;

drop trigger if exists roster_ev_attendance_ins on public.roster_attendance;
create trigger roster_ev_attendance_ins after insert on public.roster_attendance
  for each row execute function public.roster_ev_attendance();
drop trigger if exists roster_ev_attendance_del on public.roster_attendance;
create trigger roster_ev_attendance_del after delete on public.roster_attendance
  for each row execute function public.roster_ev_attendance();

create or replace function public.roster_ev_pay_reported() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare p public.roster_participants; mt public.roster_meetings;
begin
  select * into p from public.roster_participants where id = new.participant_id and business_id = new.business_id;
  select * into mt from public.roster_meetings where id = new.meeting_id and business_id = new.business_id;
  if p.id is null or mt.id is null then return null; end if;
  perform public.roster_emit(new.business_id, 'payment.reported', jsonb_build_object(
    'participant', public.roster_participant_json(p), 'meeting', public.roster_meeting_brief(mt),
    'payment', jsonb_build_object('id', null, 'kind', 'payment', 'amount', new.pay_reported_amount, 'method', null, 'meeting_id', new.meeting_id)));
  return null;
exception when others then
  return null;
end $fn$;
drop trigger if exists roster_ev_pay_reported on public.roster_attendance;
create trigger roster_ev_pay_reported after update of pay_reported_at on public.roster_attendance
  for each row when (old.pay_reported_at is null and new.pay_reported_at is not null)
  execute function public.roster_ev_pay_reported();

create or replace function public.roster_ev_payment() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare p public.roster_participants; mt public.roster_meetings; pl jsonb;
begin
  if new.kind not in ('payment', 'deposit', 'refund') then return null; end if;
  select * into p from public.roster_participants where id = new.participant_id and business_id = new.business_id;
  if p.id is null then return null; end if;
  pl := jsonb_build_object('participant', public.roster_participant_json(p));
  if new.meeting_id is not null then
    select * into mt from public.roster_meetings where id = new.meeting_id and business_id = new.business_id;
    if mt.id is not null then pl := pl || jsonb_build_object('meeting', public.roster_meeting_brief(mt)); end if;
  end if;
  pl := pl || jsonb_build_object('payment', jsonb_build_object('id', new.id, 'kind', new.kind, 'amount', new.amount, 'method', new.method, 'meeting_id', new.meeting_id));
  perform public.roster_emit(new.business_id, 'payment.recorded', pl);
  return null;
exception when others then
  return null;
end $fn$;
drop trigger if exists roster_ev_payment on public.roster_payments;
create trigger roster_ev_payment after insert on public.roster_payments
  for each row execute function public.roster_ev_payment();

-- ---- 12.8b around the data itself: erasing a participant, and who wrote a row ----------

-- Deleting a participant removes what names them outside their own row: the events of the outbox (the payload carries
-- the name, phone and e-mail; the deliveries go with the event), the mail log (the whole HTML of every mail sent to
-- them) and the accounts linked to them in the personal area (e-mail and Google name). BEFORE the delete, because the
-- foreign keys null participant_id as part of the delete and the rows could no longer be found. ("Deleting" a
-- participant in the admin page is only active = false and keeps the history; this is for a real delete, the way to
-- erase a person.)
create or replace function public.roster_participant_cleanup() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  delete from public.roster_events where business_id = old.business_id and (payload #>> '{participant,id}') = old.id::text;
  delete from public.roster_mail_log where business_id = old.business_id and participant_id = old.id;
  delete from public.roster_members where business_id = old.business_id and participant_id = old.id;
  return old;
end $fn$;
drop trigger if exists roster_participant_cleanup on public.roster_participants;
create trigger roster_participant_cleanup before delete on public.roster_participants
  for each row execute function public.roster_participant_cleanup();

-- author_email of a note or a payment is who the JWT says, never what the client sent: a member cannot write a note or
-- a payment in the owner's or a colleague's name, neither when the row is made nor by changing it afterwards. Writes with
-- no signed-in account (the database itself, the service role) keep what they carry.
create or replace function public.roster_author_trg() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare e text := public.roster_email();
begin
  if e <> '' then
    new.author_email := case when tg_op = 'INSERT' then e else old.author_email end;
  end if;
  return new;
end $fn$;
-- (named so that it fires BEFORE roster_note_freeze, which derives author_name from author_email)
drop trigger if exists roster_notes_author on public.roster_notes;
drop trigger if exists roster_note_author on public.roster_notes;
create trigger roster_note_author before insert or update of author_email on public.roster_notes
  for each row execute function public.roster_author_trg();
drop trigger if exists roster_payments_author on public.roster_payments;
create trigger roster_payments_author before insert or update of author_email on public.roster_payments
  for each row execute function public.roster_author_trg();

-- ---- 12.9 the API functions (service_role only) ----------------------------
-- All of them: first argument the key hash, jsonb in and out, {"error": "<code>"} for expected failures.
-- roster_api_auth (above) is the gate the Worker calls first (key, kind, origin, rate limits); these only
-- resolve the key again (invalid_key, wrong_key_kind) and do the work.

create or replace function public.roster_api_meetings(p_key_hash text, p_limit int default 20)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare k public.roster_api_keys; bz public.roster_businesses; today date := public.roster_today(); lim int := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  k := public.roster_api_key_of(p_key_hash);
  if k.id is null then return jsonb_build_object('error', 'invalid_key'); end if;
  select * into bz from public.roster_businesses where id = k.business_id;
  return jsonb_build_object('business', jsonb_build_object('name', bz.name), 'meetings', coalesce((
    select jsonb_agg(public.roster_meeting_json(m, k.kind = 'secret', today) order by m.meeting_date, m.meeting_time)
      from public.roster_meetings m
     where m.id in (select x.id from public.roster_meetings x where x.business_id = k.business_id and x.meeting_date >= today
                     order by x.meeting_date, x.meeting_time limit lim)), '[]'::jsonb));
end $fn$;

create or replace function public.roster_api_signup(p_key_hash text, p_payload jsonb, p_ip_hash text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  k public.roster_api_keys; s public.roster_business_settings; pl jsonb;
  req text[]; f text; fn text; ln text; ph text; norm text; em text; agt text; ag int; gd text; midt text; mid uuid;
  pa public.roster_participants; pid uuid; created boolean := false; reg boolean := false; st text; tok text; mt public.roster_meetings; r int;
begin
  k := public.roster_api_key_of(p_key_hash);
  if k.id is null then return jsonb_build_object('error', 'invalid_key'); end if;
  s := public.roster_settings_of(k.business_id);
  if not coalesce(s.registration_open, true) then return jsonb_build_object('error', 'closed'); end if;
  perform set_config('roster.source', 'api', true);

  pl := case when jsonb_typeof(p_payload) = 'object' then p_payload else '{}'::jsonb end;
  fn := btrim(regexp_replace(coalesce(pl->>'first_name', ''), '[\u0009-\u000d \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+', ' ', 'g'));
  ln := btrim(regexp_replace(coalesce(pl->>'last_name', ''), '[\u0009-\u000d \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+', ' ', 'g'));
  ph := btrim(coalesce(pl->>'phone', ''));
  em := lower(btrim(coalesce(pl->>'email', '')));
  agt := btrim(coalesce(pl->>'age', ''));
  gd := lower(btrim(coalesce(pl->>'gender', '')));
  midt := btrim(coalesce(pl->>'meeting_id', ''));

  req := array(select distinct x from unnest(coalesce(s.signup_required, '{}'::text[]) || array['first_name', 'phone']) x);
  foreach f in array array['first_name', 'last_name', 'phone', 'email', 'age', 'gender'] loop
    if f = any (req) and (case f when 'first_name' then fn when 'last_name' then ln when 'phone' then ph when 'email' then em when 'age' then agt else gd end) = '' then
      return jsonb_build_object('error', 'validation', 'field', f);
    end if;
  end loop;
  if fn <> '' and (char_length(fn) < 2 or char_length(fn) > 40 or not public.roster_valid_name(fn)) then return jsonb_build_object('error', 'validation', 'field', 'first_name'); end if;
  if ln <> '' and (char_length(ln) < 2 or char_length(ln) > 40 or not public.roster_valid_name(ln)) then return jsonb_build_object('error', 'validation', 'field', 'last_name'); end if;
  if char_length(btrim(fn || ' ' || ln)) > 60 then return jsonb_build_object('error', 'validation', 'field', 'last_name'); end if;
  norm := public.roster_normalize_phone(ph);
  if norm = '' then return jsonb_build_object('error', 'validation', 'field', 'phone'); end if;
  if agt <> '' then
    if agt !~ '^[0-9]{1,3}$' or agt::int < 18 or agt::int > 99 then return jsonb_build_object('error', 'validation', 'field', 'age'); end if;
    ag := agt::int;
  end if;
  if gd <> '' and gd not in ('male', 'female') then return jsonb_build_object('error', 'validation', 'field', 'gender'); end if;
  if em <> '' and not public.roster_valid_email(em) then return jsonb_build_object('error', 'validation', 'field', 'email'); end if;
  if midt <> '' then
    if midt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('error', 'validation', 'field', 'meeting_id'); end if;
    mid := midt::uuid;
    select * into mt from public.roster_meetings where id = mid and business_id = k.business_id;
    if not found then return jsonb_build_object('error', 'not_found'); end if;   -- nothing is created for a meeting that is not there
  end if;

  -- the participant: the phone is the identity inside the business
  select * into pa from public.roster_participants where business_id = k.business_id and phone_norm = norm;
  if not found then
    -- a business takes at most 120 NEW participants an hour through its public key (on top of the per-key and per-address
    -- limits): nobody can fill a business's list, or its admins' inbox, faster than that
    r := public.roster_rate_take('newpub:' || k.business_id, 60, 120);
    if r > 0 then return jsonb_build_object('error', 'rate_limited', 'retry_after', r); end if;
    begin
      insert into public.roster_participants (business_id, first_name, last_name, phone, age, age_set_at, gender, email)
        values (k.business_id, fn, ln, norm, ag, public.roster_today(), nullif(gd, ''), nullif(em, ''))
        returning id into pid;
      created := true;
      perform public.roster_sys_note(k.business_id, pid, 'נרשם/ה דרך האתר', 'registered');
    exception when unique_violation then
      select * into pa from public.roster_participants where business_id = k.business_id and phone_norm = norm;
      pid := pa.id;
    end;
  else
    pid := pa.id;
  end if;
  -- A public signup NEVER changes an existing participant: it brings back a removed one and attaches the meeting, nothing
  -- else. (Anyone can type any phone into a public form: if the name, e-mail or anything else of a participant that is
  -- already there could be written this way, a stranger could point that participant's mails at his own address.)
  if not created and not pa.active then
    update public.roster_participants set active = true where id = pid;   -- the trigger notes it
  end if;

  -- the meeting. A full one is answered with "full" the same way for everybody (also for someone who already
  -- holds a place), so the answer never says whether a phone is registered; the participant exists either way.
  if mid is not null then
    if mt.meeting_date >= public.roster_today() then
      if mt.max_participants is not null and public.roster_registered_count(k.business_id, mid) >= mt.max_participants then
        return jsonb_build_object('error', 'full');
      end if;
      st := public.roster_attach(k.business_id, pid, mid);
      if st = 'full' then return jsonb_build_object('error', 'full'); end if;
      reg := st in ('registered', 'exists');
    end if;
  end if;

  tok := 'pt_' || public.roster_random_text(32);
  insert into public.roster_participant_tokens (token_hash, business_id, participant_id, expires_at, meeting_id)
    values (public.roster_sha256(tok), k.business_id, pid, now() + interval '30 days', case when reg then mid end);   -- bound to the meeting the person was attached to
  if random() < 0.02 then perform public.roster_rate_cleanup(); end if;

  return jsonb_build_object('status', 'ok', 'registered', reg, 'participant_token', tok)
    || case when k.kind = 'secret' then jsonb_build_object('participant_id', pid, 'created', created) else '{}'::jsonb end;
end $fn$;

-- POST /payments/click (public key only): the participant clicked "I paid".
-- The answer is {"status":"ok"} for EVERY valid token, whatever came of the click, so the reply says nothing about the
-- phone, the registration or the payment (a token comes from a signup with any phone, so a distinguishing answer would
-- let anyone probe any phone). An unknown, expired or other business's token is {"error":"invalid_token"}. The report is
-- recorded only when ALL of this holds: the meeting is the one the token was issued for, the participant is active and
-- registered to it, the meeting is not past, the participant is not free and has not paid or already reported.
create or replace function public.roster_api_payment_click(p_key_hash text, p_token_hash text, p_meeting uuid, p_ip_hash text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare k public.roster_api_keys; t public.roster_participant_tokens; pa public.roster_participants; mt public.roster_meetings;
begin
  k := public.roster_api_key_of(p_key_hash);
  if k.id is null then return jsonb_build_object('error', 'invalid_key'); end if;
  if k.kind <> 'public' then return jsonb_build_object('error', 'wrong_key_kind'); end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error', 'invalid_token'); end if;
  select * into t from public.roster_participant_tokens where token_hash = p_token_hash and business_id = k.business_id and expires_at > now();
  if not found then return jsonb_build_object('error', 'invalid_token'); end if;
  if t.meeting_id is not null and p_meeting is not null and p_meeting = t.meeting_id then
    select * into pa from public.roster_participants where id = t.participant_id and business_id = k.business_id;
    select * into mt from public.roster_meetings where id = p_meeting and business_id = k.business_id;
    if pa.id is not null and pa.active and mt.id is not null and mt.meeting_date >= public.roster_today() then
      perform set_config('roster.source', 'api', true);
      perform public.roster_report_core(k.business_id, pa.id, p_meeting);   -- registered, unpaid, not free, not reported yet: else nothing happens
    end if;
  end if;
  return jsonb_build_object('status', 'ok');
end $fn$;

-- GET /participants?phone= or /participants/{id} (secret key)
create or replace function public.roster_api_participant(p_key_hash text, p_id uuid, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare k public.roster_api_keys; pid uuid; norm text; j jsonb;
begin
  k := public.roster_api_key_of(p_key_hash);
  if k.id is null then return jsonb_build_object('error', 'invalid_key'); end if;
  if k.kind <> 'secret' then return jsonb_build_object('error', 'wrong_key_kind'); end if;
  if p_id is not null then
    pid := p_id;
  elsif nullif(btrim(coalesce(p_phone, '')), '') is not null then
    norm := public.roster_normalize_phone(p_phone);
    if norm = '' then return jsonb_build_object('error', 'validation', 'field', 'phone'); end if;
    select id into pid from public.roster_participants where business_id = k.business_id and phone_norm = norm;
  else
    return jsonb_build_object('error', 'validation', 'field', 'phone');
  end if;
  j := case when pid is null then null else public.roster_person_json(k.business_id, pid) end;
  if j is null then return jsonb_build_object('error', 'not_found'); end if;
  return jsonb_build_object('participant', j);
end $fn$;

create or replace function public.roster_api_register(p_key_hash text, p_participant uuid, p_meeting uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare k public.roster_api_keys; st text;
begin
  k := public.roster_api_key_of(p_key_hash);
  if k.id is null then return jsonb_build_object('error', 'invalid_key'); end if;
  if k.kind <> 'secret' then return jsonb_build_object('error', 'wrong_key_kind'); end if;
  if not exists (select 1 from public.roster_participants where id = p_participant and business_id = k.business_id) then return jsonb_build_object('error', 'not_found'); end if;
  perform set_config('roster.source', 'api', true);
  st := public.roster_attach(k.business_id, p_participant, p_meeting);
  if st = 'not_found' then return jsonb_build_object('error', 'not_found'); end if;
  return jsonb_build_object('status', st);
end $fn$;

create or replace function public.roster_api_unregister(p_key_hash text, p_participant uuid, p_meeting uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare k public.roster_api_keys; mt public.roster_meetings; a public.roster_attendance;
begin
  k := public.roster_api_key_of(p_key_hash);
  if k.id is null then return jsonb_build_object('error', 'invalid_key'); end if;
  if k.kind <> 'secret' then return jsonb_build_object('error', 'wrong_key_kind'); end if;
  if not exists (select 1 from public.roster_participants where id = p_participant and business_id = k.business_id) then return jsonb_build_object('error', 'not_found'); end if;
  select * into mt from public.roster_meetings where id = p_meeting and business_id = k.business_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if mt.meeting_date < public.roster_today() then return jsonb_build_object('status', 'past'); end if;
  select * into a from public.roster_attendance where business_id = k.business_id and participant_id = p_participant and meeting_id = p_meeting;
  if not found then return jsonb_build_object('status', 'not_registered'); end if;
  if coalesce(a.attended, false) then return jsonb_build_object('status', 'attended'); end if;
  perform set_config('roster.source', 'api', true);
  delete from public.roster_attendance where business_id = k.business_id and participant_id = p_participant and meeting_id = p_meeting;
  return jsonb_build_object('status', 'cancelled');   -- payments are not touched
end $fn$;

-- POST /payments (secret key). external_ref is the idempotency key, unique per business.
-- Optional "remaining": what is still to pay after this payment (kind payment), kept like the admin's partial payment.
create or replace function public.roster_api_record_payment(p_key_hash text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  k public.roster_api_keys; pl jsonb; pidt text; pid uuid; midt text; mid uuid; kind text; amt text; amount numeric; meth text; note text;
  ref text; remt text; reason text; got public.roster_idempotency; pay uuid; gp uuid; gk text; ga numeric; gm uuid;
begin
  k := public.roster_api_key_of(p_key_hash);
  if k.id is null then return jsonb_build_object('error', 'invalid_key'); end if;
  if k.kind <> 'secret' then return jsonb_build_object('error', 'wrong_key_kind'); end if;
  pl := case when jsonb_typeof(p_payload) = 'object' then p_payload else '{}'::jsonb end;
  pidt := btrim(coalesce(pl->>'participant_id', ''));
  midt := btrim(coalesce(pl->>'meeting_id', ''));
  kind := lower(btrim(coalesce(nullif(pl->>'kind', ''), 'payment')));
  amt := btrim(coalesce(pl->>'amount', ''));
  meth := btrim(coalesce(nullif(pl->>'method', ''), 'other'));
  note := nullif(btrim(coalesce(pl->>'note', '')), '');
  ref := btrim(coalesce(pl->>'external_ref', ''));
  remt := btrim(coalesce(pl->>'remaining', ''));

  if pidt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('error', 'validation', 'field', 'participant_id'); end if;
  pid := pidt::uuid;
  if kind not in ('payment', 'deposit', 'refund') then return jsonb_build_object('error', 'validation', 'field', 'kind'); end if;
  if amt !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$' or amt::numeric <= 0 then return jsonb_build_object('error', 'validation', 'field', 'amount'); end if;
  amount := amt::numeric;
  if char_length(meth) > 40 then return jsonb_build_object('error', 'validation', 'field', 'method'); end if;
  if note is not null and char_length(note) > 500 then return jsonb_build_object('error', 'validation', 'field', 'note'); end if;
  if ref = '' or char_length(ref) > 200 then return jsonb_build_object('error', 'validation', 'field', 'external_ref'); end if;
  if midt <> '' then
    if midt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('error', 'validation', 'field', 'meeting_id'); end if;
    mid := midt::uuid;
  elsif kind = 'payment' then
    return jsonb_build_object('error', 'validation', 'field', 'meeting_id');
  end if;
  if remt <> '' and (remt !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$') then return jsonb_build_object('error', 'validation', 'field', 'remaining'); end if;
  if not exists (select 1 from public.roster_participants where id = pid and business_id = k.business_id) then return jsonb_build_object('error', 'not_found'); end if;
  if mid is not null and not exists (select 1 from public.roster_meetings where id = mid and business_id = k.business_id) then return jsonb_build_object('error', 'not_found'); end if;

  -- idempotency: the first call takes the key, any other returns what the first made
  insert into public.roster_idempotency (business_id, external_ref) values (k.business_id, ref) on conflict do nothing;
  if not found then
    select * into got from public.roster_idempotency where business_id = k.business_id and external_ref = ref;
    if got.payment_id is not null then
      select x.participant_id, x.kind, x.amount, x.meeting_id into gp, gk, ga, gm from public.roster_payments x where x.id = got.payment_id and x.business_id = k.business_id;
      if found and (gp <> pid or gk <> kind or ga <> amount or gm is distinct from mid) then
        return jsonb_build_object('error', 'conflict');   -- the key was used for a different payment
      end if;
    end if;
    return jsonb_build_object('status', 'ok', 'payment_id', got.payment_id, 'duplicate', true);
  end if;

  perform set_config('roster.source', 'api', true);
  reason := case when kind = 'payment' and remt <> '' and remt::numeric > 0 then 'partial_due:' || trim_scale(remt::numeric)::text end;
  insert into public.roster_payments (business_id, participant_id, meeting_id, kind, amount, from_credit, method, method_note, reason, author_name, author_email, external_ref)
    values (k.business_id, pid, mid, kind, amount, false, meth, note, reason, 'API', null, ref)
    returning id into pay;
  update public.roster_idempotency set payment_id = pay where business_id = k.business_id and external_ref = ref;
  return jsonb_build_object('status', 'ok', 'payment_id', pay, 'duplicate', false);
end $fn$;

create or replace function public.roster_api_pay_from_credit(p_key_hash text, p_participant uuid, p_meeting uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare k public.roster_api_keys;
begin
  k := public.roster_api_key_of(p_key_hash);
  if k.id is null then return jsonb_build_object('error', 'invalid_key'); end if;
  if k.kind <> 'secret' then return jsonb_build_object('error', 'wrong_key_kind'); end if;
  if not exists (select 1 from public.roster_participants where id = p_participant and business_id = k.business_id) then return jsonb_build_object('error', 'not_found'); end if;
  perform set_config('roster.source', 'api', true);
  return public.roster_pay_credit_core(k.business_id, p_participant, p_meeting);
end $fn$;

-- ---- 12.10 the outbox: claim and done (service_role only) -------------------
--
-- ITEM SHAPE of roster_events_claim(p_limit): a jsonb array, one work item per claimed event, oldest first.
-- It is the shape the Worker documents in worker/src/roster/db.js. The database computes the facts the mail
-- rules need; the Worker applies the rules, renders and sends.
--
--   {
--     "event": { "id": 17, "type": "registration.created", "payload": {...the webhook "data"...},
--                "attempts": 0,                 -- webhook attempts already recorded (a lock that ran out counts as one)
--                "created_at": "2026-11-04T10:00:00+00:00",
--                "source": "api" | "admin" | "me" | "system" },   -- extra: who made the change (skip admin_signup for "admin")
--     "business": { "id": "uuid", "slug": "studio", "name": "Studio",
--                   "settings": { webhook_url, webhook_secret, webhook_events, participant_mail_enabled, personal_area_enabled,
--                                 contact_email, sender_name, contact_whatsapp, payment_url },
--                   "notify_emails": ["a@x.com"] },   -- the RESOLVED list: the setting, else the accounts of the business
--     "participant": { id, first_name, last_name, email, phone, age, gender } | null,   -- the CURRENT row, else payload.participant
--     "facts": { "meeting": { date, time, name, city, place, directions, future, price, free, reported_amount } | null,
--                "has_payment": bool,           -- any payment exists for this participant and meeting
--                "fully_paid": bool,            -- something paid and nothing left to pay (a partial payment keeps a remainder)
--                "confirmation_sent": bool },   -- payment_confirmed was already mailed for this participant and meeting
--     "templates": { "<key>": { "subject": "...", "html": "..." } },     -- the business's own overrides only
--     "mail_counters": { "recipients": { "<lower case address>": n }, "business_day": n }   -- last 24 h, sent or pending,
--                                                                                          -- participant mails only
--   }
--
-- The claim marks each event 'processing' for 2 minutes (for update skip locked). An event whose lock ran out was
-- never reported: it counts as one attempt (a delivery row 'lock_expired' when a webhook was due), and after 6
-- attempts it is 'failed' (max_attempts), so a crash loop ends.
--
-- roster_events_done(p_id, p_result): p_result = {
--     "webhook": null | { "status": "ok" | "failed", "http_status": 200, "error": null | "timeout" | ..., "attempt": 1,
--                         "retry_in_seconds": 60 | 300 | 1800 | 7200 | 43200 | null, "duration_ms": 12 },
--     "mails": [ { "template", "audience": "admin" | "participant", "to": "addr" | "", "subject", "html",
--                  "status": "sent" | "failed", "error": null | "no_address" | "limit_recipient" | ... } ],
--     "skipped": [ ... ] (ignored), "error": "internal" (only when processing threw) }
-- It writes the delivery (roster_webhook_deliveries), every mail (roster_mail_log) and, for participant mails, a note
-- on the participant (event_type mail_sent, mail_id, mail_failed, mail_noaddr). The event is done (webhook ok or
-- none), pending again at now() + retry_in_seconds, or failed (webhook failed with retry_in_seconds null, or the
-- 6th attempt). With no retry_in_seconds key at all the schedule is +1 min, +5 min, +30 min, +2 h, +12 h.

create or replace function public.roster_webhook_wanted(s public.roster_business_settings, p_type text)
returns boolean language sql stable as $fn$
  select s.webhook_url is not null and public.roster_valid_webhook_url(s.webhook_url)
     and p_type in ('participant.created', 'registration.created', 'registration.cancelled', 'payment.reported', 'payment.recorded', 'ping')
     and (s.webhook_events is null or p_type = any (s.webhook_events) or p_type = 'ping');
$fn$;

create or replace function public.roster_event_item(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  ev public.roster_events; bz public.roster_businesses; s public.roster_business_settings; pa public.roster_participants;
  mt public.roster_meetings; a public.roster_attendance;
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  pidt text; midt text; pid uuid; mid uuid; today date := public.roster_today();
  admins text[]; mfacts jsonb := null; has_pay boolean := false; fully boolean := false; conf boolean := false;
  paid numeric; price numeric; part jsonb := null; templates jsonb; recips jsonb := '{}'::jsonb; addr text; n int; n_biz int;
  arecips jsonb := '{}'::jsonb; a_hour int; n_all int; logged jsonb;
begin
  select * into ev from public.roster_events where id = p_id;
  select * into bz from public.roster_businesses where id = ev.business_id;
  s := public.roster_settings_of(ev.business_id);
  pidt := ev.payload #>> '{participant,id}';
  midt := ev.payload #>> '{meeting,id}';
  if pidt ~* uuid_re then pid := pidt::uuid; end if;
  if midt ~* uuid_re then mid := midt::uuid; end if;
  if pid is not null then select * into pa from public.roster_participants where id = pid and business_id = ev.business_id; end if;
  if mid is not null then select * into mt from public.roster_meetings where id = mid and business_id = ev.business_id; end if;
  if pa.id is not null and mt.id is not null then
    select * into a from public.roster_attendance where business_id = ev.business_id and participant_id = pa.id and meeting_id = mt.id;
  end if;
  admins := case when coalesce(cardinality(s.notify_emails), 0) > 0 then s.notify_emails
                 else array(select u.email from public.roster_business_users u where u.business_id = ev.business_id order by u.email) end;

  if mt.id is not null then
    price := case when mt.price_tiers is null then null else public.roster_meeting_price(mt.price_tiers, greatest(mt.meeting_date - today, 0)) end;
    mfacts := jsonb_build_object('date', to_char(mt.meeting_date, 'YYYY-MM-DD'), 'time', to_char(mt.meeting_time, 'HH24:MI'),
      'name', coalesce(nullif(btrim(mt.name), ''), (select nullif(btrim(t.name), '') from public.roster_meeting_types t where t.id = mt.type_id and t.business_id = mt.business_id)),
      'city', mt.city, 'place', mt.place, 'directions', mt.directions, 'future', mt.meeting_date >= today, 'price', price,
      'free', coalesce(a.no_pay, false), 'reported_amount', case when a.pay_reported_at is not null then a.pay_reported_amount end);
  end if;
  if pa.id is not null and mt.id is not null then
    has_pay := exists (select 1 from public.roster_payments p where p.business_id = ev.business_id and p.participant_id = pa.id and p.meeting_id = mt.id);
    paid := public.roster_paid_for(ev.business_id, pa.id, mt.id);
    fully := paid > 0 and coalesce(a.pay_due_amount, 0) = 0;
    conf := exists (select 1 from public.roster_mail_log l where l.business_id = ev.business_id and l.participant_id = pa.id and l.meeting_id = mt.id
                      and l.template = 'payment_confirmed' and l.status in ('sent', 'pending'));
  end if;
  if pa.id is not null then
    part := jsonb_build_object('id', pa.id, 'first_name', pa.first_name, 'last_name', pa.last_name, 'email', pa.email, 'phone', pa.phone,
      'age', public.roster_current_age(pa.age, pa.age_set_at), 'gender', pa.gender);
  elsif jsonb_typeof(ev.payload -> 'participant') = 'object' then
    part := ev.payload -> 'participant';
  end if;

  select coalesce(jsonb_object_agg(t.key, jsonb_build_object('subject', t.subject, 'html', t.html)), '{}'::jsonb) into templates
    from public.roster_mail_templates t where t.business_id = ev.business_id;
  for addr in select distinct x from unnest(array[lower(btrim(pa.email)), lower(btrim(ev.payload #>> '{participant,email}'))]) x where x is not null and x <> '' loop
    select count(*)::int into n from public.roster_mail_log l
     where l.business_id = ev.business_id and lower(btrim(l.to_addr)) = addr and l.template not like 'admin\_%'
       and l.status in ('sent', 'pending') and l.created_at > now() - interval '24 hours';
    recips := recips || jsonb_build_object(addr, n);
  end loop;
  select count(*)::int into n_biz from public.roster_mail_log l
   where l.business_id = ev.business_id and l.template not like 'admin\_%' and l.status in ('sent', 'pending') and l.created_at > now() - interval '24 hours';

  -- The admin side. A row of the log may hold several recipients ("a@x.com, b@x.com"), so these count recipients, not rows.
  --   admin_recipients: admin mails to each address of the notify list, last 24 h
  --   admin_hour: admin mails of the business, last 60 minutes
  --   business_day_all: ALL mails of the business (participant and admin), last 24 h
  foreach addr in array coalesce(admins, '{}'::text[]) loop
    select count(*)::int into n from public.roster_mail_log l, lateral unnest(string_to_array(lower(replace(l.to_addr, ' ', '')), ',')) as x(ad)
     where l.business_id = ev.business_id and l.template like 'admin\_%' and l.status in ('sent', 'pending')
       and l.created_at > now() - interval '24 hours' and x.ad = lower(btrim(addr));
    arecips := arecips || jsonb_build_object(lower(btrim(addr)), n);
  end loop;
  select count(*)::int into a_hour from public.roster_mail_log l, lateral unnest(string_to_array(lower(replace(l.to_addr, ' ', '')), ',')) as x(ad)
   where l.business_id = ev.business_id and l.template like 'admin\_%' and l.status in ('sent', 'pending')
     and l.created_at > now() - interval '60 minutes' and x.ad <> '';
  select count(*)::int into n_all from public.roster_mail_log l, lateral unnest(string_to_array(lower(replace(l.to_addr, ' ', '')), ',')) as x(ad)
   where l.business_id = ev.business_id and l.status in ('sent', 'pending')
     and l.created_at > now() - interval '24 hours' and x.ad <> '';
  -- the mails already logged for THIS event, so a retry or a re-claim never mails or logs the same thing twice
  select coalesce(jsonb_agg(jsonb_build_object('template', l.template, 'to', l.to_addr, 'status', l.status) order by l.created_at, l.id), '[]'::jsonb) into logged
    from public.roster_mail_log l where l.business_id = ev.business_id and l.event_id = ev.id;

  return jsonb_build_object(
    'event', jsonb_build_object('id', ev.id, 'type', ev.type, 'payload', ev.payload, 'attempts', ev.attempts, 'created_at', ev.created_at, 'source', ev.source),
    'business', jsonb_build_object('id', bz.id, 'slug', bz.slug, 'name', bz.name,
      'settings', jsonb_build_object('webhook_url', s.webhook_url, 'webhook_secret', s.webhook_secret, 'webhook_events', to_jsonb(s.webhook_events),
        'participant_mail_enabled', s.participant_mail_enabled, 'personal_area_enabled', s.personal_area_enabled,
        'contact_email', s.contact_email, 'sender_name', s.sender_name, 'contact_whatsapp', s.contact_whatsapp, 'payment_url', s.payment_url),
      'notify_emails', to_jsonb(admins)),
    'participant', part,
    'facts', jsonb_build_object('meeting', mfacts, 'has_payment', has_pay, 'fully_paid', fully, 'confirmation_sent', conf),
    'templates', templates,
    'mail_counters', jsonb_build_object('recipients', recips, 'business_day', n_biz,
                                        'admin_recipients', arecips, 'admin_hour', a_hour, 'business_day_all', n_all),
    'mails_logged', logged);
end $fn$;

-- Round robin: a business's first due event goes first for every business, then every business's second, and so on
-- (row_number per business, then by it), so one business with a backlog cannot keep the others waiting. Retention (see
-- roster_retention) runs here, at most once per ten minutes, and never stops a claim.
create or replace function public.roster_events_claim(p_limit int default 20)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare r record; out jsonb := '[]'::jsonb; ev public.roster_events; s public.roster_business_settings; att int;
begin
  begin
    perform public.roster_retention();
  exception when others then
    null;
  end;
  for r in
    select e.id as eid, e.status as est
      from public.roster_events e
      join (select q.id, row_number() over (partition by q.business_id order by q.id) as rn
              from public.roster_events q
             where (q.status = 'pending' and q.next_attempt_at <= now()) or (q.status = 'processing' and q.locked_until < now())) due
        on due.id = e.id
     order by due.rn, e.id
     limit least(greatest(coalesce(p_limit, 20), 1), 100)
       for update of e skip locked
  loop
    if r.est = 'processing' then   -- the lock ran out: nobody reported. That is an attempt.
      select * into ev from public.roster_events where id = r.eid;
      att := ev.attempts + 1;
      s := public.roster_settings_of(ev.business_id);
      if public.roster_webhook_wanted(s, ev.type) then
        insert into public.roster_webhook_deliveries (event_id, business_id, attempt, status, error) values (ev.id, ev.business_id, att, 'failed', 'lock_expired');
      end if;
      if att >= 6 then
        update public.roster_events set status = 'failed', attempts = att, locked_until = null, last_error = 'max_attempts' where id = r.eid;
        continue;
      end if;
      update public.roster_events set attempts = att where id = r.eid;
    end if;
    update public.roster_events set status = 'processing', locked_until = now() + interval '2 minutes' where id = r.eid;
    out := out || jsonb_build_array(public.roster_event_item(r.eid));
  end loop;
  return out;
end $fn$;

create or replace function public.roster_events_done(p_id bigint, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  ev public.roster_events; res jsonb; wh jsonb; ok boolean := true; att int; hs int; m jsonb; to_a text; st text; mlid uuid; pid uuid; mid uuid;
  pidt text; midt text; newstatus text := 'done'; nxt timestamptz; err text; subj text; aud text; rin int; pa public.roster_participants;
  delays interval[] := array['1 minute', '5 minutes', '30 minutes', '2 hours', '12 hours']::interval[];
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  select * into ev from public.roster_events where id = p_id for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if ev.status in ('done', 'failed') then return jsonb_build_object('status', ev.status, 'noop', true); end if;
  res := case when jsonb_typeof(p_result) = 'object' then p_result else '{}'::jsonb end;
  pidt := ev.payload #>> '{participant,id}';
  midt := ev.payload #>> '{meeting,id}';
  if pidt ~* uuid_re then pid := pidt::uuid; end if;
  if midt ~* uuid_re then mid := midt::uuid; end if;
  select * into pa from public.roster_participants where id = pid and business_id = ev.business_id;
  if not found then pid := null; end if;

  if jsonb_typeof(res->'mails') = 'array' then
    for m in select x from jsonb_array_elements(res->'mails') x loop
      continue when jsonb_typeof(m) <> 'object' or coalesce(m->>'template', '') = '';
      to_a := case when jsonb_typeof(m->'to') = 'array' then (select string_agg(x, ', ') from jsonb_array_elements_text(m->'to') x) else coalesce(m->>'to', '') end;
      st := case when m->>'status' = 'sent' then 'sent' else 'failed' end;
      err := case when st = 'failed' then left(coalesce(nullif(m->>'error', ''), 'failed'), 500) end;
      subj := left(coalesce(m->>'subject', ''), 300);
      aud := coalesce(nullif(m->>'audience', ''), case when (m->>'template') like 'admin\_%' then 'admin' else 'participant' end);
      insert into public.roster_mail_log (business_id, participant_id, event_id, meeting_id, template, to_addr, subject, html, status, error, sent_at)
        values (ev.business_id, pid, ev.id, mid, left(m->>'template', 60), left(coalesce(to_a, ''), 500), subj, left(m->>'html', 100000), st, err, case when st = 'sent' then now() end)
        returning id into mlid;
      if aud = 'participant' and pid is not null then
        insert into public.roster_notes (business_id, participant_id, body, system, event_type, meeting_id, mail_id, mail_failed, mail_noaddr)
          values (ev.business_id, pid,
                  case when st = 'sent' then 'נשלח מייל: ' when err = 'no_address' then 'המייל לא נשלח, אין כתובת מייל: ' else 'שליחת המייל נכשלה: ' end || coalesce(nullif(subj, ''), m->>'template'),
                  true, 'mail_sent', (select id from public.roster_meetings where id = mid and business_id = ev.business_id), mlid,
                  st = 'failed', (st = 'failed' and (err = 'no_address' or coalesce(btrim(to_a), '') = '')));
      end if;
    end loop;
  end if;

  att := ev.attempts;
  err := null;
  wh := case when jsonb_typeof(res->'webhook') = 'object' then res->'webhook' end;
  if wh is not null then
    att := case when coalesce(wh->>'attempt', '') ~ '^[0-9]{1,3}$' and (wh->>'attempt')::int >= 1 then (wh->>'attempt')::int else ev.attempts + 1 end;
    hs := case when coalesce(wh->>'http_status', '') ~ '^[0-9]{3}$' then (wh->>'http_status')::int end;
    ok := coalesce(wh->>'status', '') in ('ok', 'delivered', 'success', 'sent') or (coalesce(wh->>'status', '') <> 'failed' and hs between 200 and 299);
    err := case when not ok then left(coalesce(nullif(wh->>'error', ''), case when hs is not null then 'HTTP ' || hs else 'failed' end), 500) end;
    insert into public.roster_webhook_deliveries (event_id, business_id, attempt, status, http_status, error)
      values (ev.id, ev.business_id, att, case when ok then 'ok' else 'failed' end, hs, err);
    if not ok then
      if att >= 6 then
        newstatus := 'failed';
      elsif wh ? 'retry_in_seconds' then
        rin := case when coalesce(wh->>'retry_in_seconds', '') ~ '^[0-9]{1,7}$' then least((wh->>'retry_in_seconds')::int, 172800) end;
        if rin is null then newstatus := 'failed'; else newstatus := 'pending'; nxt := now() + make_interval(secs => rin); end if;
      else
        newstatus := 'pending'; nxt := now() + delays[att];
      end if;
    end if;
  elsif res->>'error' = 'internal' then   -- processing threw: the whole event is tried again, a few times
    att := ev.attempts + 1;
    err := 'internal';
    if att >= 6 then newstatus := 'failed'; else newstatus := 'pending'; nxt := now() + delays[att]; end if;
  end if;
  update public.roster_events set status = newstatus, attempts = att, next_attempt_at = coalesce(nxt, next_attempt_at), locked_until = null, last_error = err
   where id = ev.id;
  return jsonb_build_object('status', newstatus, 'attempts', att, 'next_attempt_at', nxt);
end $fn$;

-- ---- 12.11 for the connections page: keys, secret, test event (signed-in accounts) --------

-- The business the caller may act for (the x-business header and membership), else null.
create or replace function public.roster_my_current()
returns uuid language sql stable security definer set search_path = public as $fn$
  select case when public.roster_can(public.roster_current_business()) then public.roster_current_business() end;
$fn$;

create or replace function public.roster_key_create(p_kind text, p_label text default '', p_origins text[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare b uuid := public.roster_my_current(); kind text := lower(btrim(coalesce(p_kind, ''))); label text := btrim(coalesce(p_label, ''));
        origins text[]; o text; plain text; kid uuid;
begin
  if b is null then return jsonb_build_object('error', 'forbidden'); end if;
  if kind not in ('public', 'secret') then return jsonb_build_object('error', 'validation', 'field', 'kind'); end if;
  if char_length(label) > 60 then return jsonb_build_object('error', 'validation', 'field', 'label'); end if;
  origins := array(select distinct lower(btrim(x)) from unnest(coalesce(p_origins, '{}'::text[])) x where btrim(x) <> '' order by 1);
  if kind = 'secret' then origins := '{}'; end if;
  if coalesce(cardinality(origins), 0) > 20 then return jsonb_build_object('error', 'validation', 'field', 'origins'); end if;
  foreach o in array origins loop
    if o !~ '^https?://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?$' or char_length(o) > 200 then return jsonb_build_object('error', 'validation', 'field', 'origins'); end if;
  end loop;
  perform pg_advisory_xact_lock(hashtext('roster_keys:' || b::text));   -- the two caps below are checked and used up in one go
  if (select count(*) from public.roster_api_keys where business_id = b and revoked_at is null) >= 20 then return jsonb_build_object('error', 'limit'); end if;
  -- a row cap too, revoked keys included (create and revoke in a loop would otherwise grow the table without end);
  -- roster_retention removes keys revoked more than 90 days ago, so the cap is never a permanent lock
  if (select count(*) from public.roster_api_keys where business_id = b) >= 100 then return jsonb_build_object('error', 'limit'); end if;
  plain := case kind when 'public' then 'rk_pub_' || public.roster_random_text(32) else 'rk_sec_' || public.roster_random_text(40) end;
  insert into public.roster_api_keys (business_id, kind, prefix, key_hash, label, allowed_origins, created_by)
    values (b, kind, substr(plain, 1, 12), public.roster_sha256(plain), label, origins, nullif(public.roster_email(), ''))
    returning id into kid;
  return jsonb_build_object('id', kid, 'prefix', substr(plain, 1, 12), 'kind', kind, 'key', plain);
end $fn$;

create or replace function public.roster_key_revoke(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare b uuid := public.roster_my_current(); n int;
begin
  if b is null then return jsonb_build_object('error', 'forbidden'); end if;
  update public.roster_api_keys set revoked_at = now() where id = p_id and business_id = b and revoked_at is null;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('error', 'not_found'); end if;
  return jsonb_build_object('revoked', true);
end $fn$;

-- a new webhook secret, returned once (the page can never read it again)
create or replace function public.roster_webhook_secret_rotate()
returns text language plpgsql security definer set search_path = public as $fn$
declare b uuid := public.roster_my_current(); sec text;
begin
  if b is null then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.roster_settings_of(b);
  sec := 'whsec_' || public.roster_random_text(40);
  update public.roster_business_settings set webhook_secret = sec where business_id = b;
  return sec;
end $fn$;

-- a "ping" event, delivered to the webhook like any other
create or replace function public.roster_webhook_test()
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare b uuid := public.roster_my_current(); s public.roster_business_settings; id bigint;
begin
  if b is null then return jsonb_build_object('error', 'forbidden'); end if;
  s := public.roster_settings_of(b);
  if s.webhook_url is null or not public.roster_valid_webhook_url(s.webhook_url) then return jsonb_build_object('error', 'no_webhook'); end if;
  insert into public.roster_events (business_id, type, payload, source) values (b, 'ping', jsonb_build_object('message', 'test'), 'admin') returning roster_events.id into id;
  return jsonb_build_object('queued', true, 'event_id', id);
end $fn$;

create or replace function public.roster_mail_template_reset(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare b uuid := public.roster_my_current(); n int;
begin
  if b is null then return jsonb_build_object('error', 'forbidden'); end if;
  delete from public.roster_mail_templates where business_id = b and key = p_key;
  get diagnostics n = row_count;
  return jsonb_build_object('reset', n > 0);
end $fn$;

-- ---- 12.12 the personal area (any signed-in Google account, by business slug) --------
-- Ports of harpatka's me_* with the same statuses. The trust model is harpatka's: a Google account links itself
-- to a participant by typing the phone; a phone that is already linked to another account answers phone_taken
-- (and tells the admins). Added: a limit on how often one account may try phones in one business (30 per hour).
-- No function raises for an expected failure; a text answer is the status word.

create or replace function public.roster_me_resolve(p_slug text, p_member boolean)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare uid uuid := auth.uid(); bz public.roster_businesses; s public.roster_business_settings; m public.roster_members;
begin
  if uid is null then return jsonb_build_object('status', 'auth'); end if;
  select * into bz from public.roster_businesses where slug = lower(btrim(coalesce(p_slug, '')));
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  s := public.roster_settings_of(bz.id);
  if not coalesce(s.personal_area_enabled, true) then return jsonb_build_object('status', 'disabled', 'business_id', bz.id); end if;
  if not p_member then return jsonb_build_object('status', 'ok', 'business_id', bz.id); end if;
  select * into m from public.roster_members where business_id = bz.id and user_id = uid;
  if m.user_id is null or m.status = 'removed' then return jsonb_build_object('status', 'none', 'business_id', bz.id); end if;
  if m.status = 'blocked' then return jsonb_build_object('status', 'blocked', 'business_id', bz.id); end if;
  if m.participant_id is null then return jsonb_build_object('status', 'none', 'business_id', bz.id); end if;
  return jsonb_build_object('status', 'ok', 'business_id', bz.id, 'participant_id', m.participant_id);
end $fn$;

create or replace function public.roster_me_text(st text)
returns text language sql immutable as $fn$
  select case st when 'not_found' then 'none' when 'none' then 'forbidden' else st end;
$fn$;

-- everything about me: status ok | none | blocked | disabled | not_found | auth
create or replace function public.roster_me(p_slug text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  r jsonb := public.roster_me_resolve(p_slug, true); st text := r->>'status'; b uuid := nullif(r->>'business_id', '')::uuid; pid uuid := nullif(r->>'participant_id', '')::uuid;
  bz public.roster_businesses; s public.roster_business_settings; pa public.roster_participants; binfo jsonb;
begin
  if st = 'auth' then return jsonb_build_object('status', 'auth'); end if;
  if st = 'not_found' then return jsonb_build_object('status', 'unknown_business'); end if;
  select * into bz from public.roster_businesses where id = b;
  s := public.roster_settings_of(b);
  binfo := jsonb_build_object('name', bz.name, 'payment_url', s.payment_url, 'contact_whatsapp', s.contact_whatsapp);
  if st <> 'ok' then return jsonb_build_object('status', st, 'business', binfo); end if;   -- none | blocked | disabled
  select * into pa from public.roster_participants where id = pid and business_id = b;   -- a removed participant still sees the area, and stays removed
  if not found then return jsonb_build_object('status', 'none', 'business', binfo); end if;
  return jsonb_build_object('status', 'ok', 'business', binfo,
    'participant', jsonb_build_object('id', pa.id, 'first_name', pa.first_name, 'last_name', pa.last_name, 'phone', pa.phone, 'email', pa.email,
                                      'age', public.roster_current_age(pa.age, pa.age_set_at), 'gender', pa.gender),
    'balance', public.roster_balance(b, pid), 'meetings', public.roster_person_meetings(b, pid, true));
end $fn$;

-- link this Google account to a participant by phone: created | linked | reactivated | phone_taken | blocked |
-- invalid_phone | rate_limited | try_later.
-- Limits, all counted by roster_rate_take (a refused call is not counted): 30 phone attempts an hour per account and
-- business; and for the WHOLE business 600 attempts an hour and 60 NEW participants an hour (the reply is
-- {"status":"try_later"}). Anyone can open a free account and type any phone, so without the business-wide ceilings
-- a handful of throwaway accounts could fill a business's list, guess its customers' phones and flood its admins.
-- Events: a new participant has no name yet, so it emits nothing (roster_me_complete emits participant.created when the
-- names arrive); linking to an EXISTING participant emits participant.linked, and a phone another account holds emits
-- participant.phone_conflict. Both are internal: they only mail the business's admins.
create or replace function public.roster_me_phone(p_slug text, p_phone text, p_meeting uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  r jsonb := public.roster_me_resolve(p_slug, false); st text := r->>'status'; b uuid := nullif(r->>'business_id', '')::uuid; uid uuid := auth.uid();
  norm text := public.roster_normalize_phone(p_phone);
  em text := lower(coalesce(auth.jwt() ->> 'email', ''));
  gname text := left(coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''), nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''), ''), 120);
  m public.roster_members; pa public.roster_participants; pid uuid; act boolean; created boolean := false; react boolean := false; reg boolean := false; ast text;
  already boolean; acct text; bucket_me text;
begin
  if st <> 'ok' then return jsonb_build_object('status', st); end if;
  select * into m from public.roster_members where business_id = b and user_id = uid;
  if m.user_id is not null and m.status = 'blocked' then return jsonb_build_object('status', 'blocked'); end if;
  if norm = '' then return jsonb_build_object('status', 'invalid_phone'); end if;
  bucket_me := 'me_phone:' || uid || ':' || b;
  if public.roster_rate_take(bucket_me, 60, 30) > 0 then return jsonb_build_object('status', 'rate_limited'); end if;
  if public.roster_rate_take('me_try:' || b, 60, 600) > 0 then
    perform public.roster_rate_give_back(bucket_me);
    return jsonb_build_object('status', 'try_later');
  end if;
  perform set_config('roster.source', 'me', true);
  acct := jsonb_build_object('email', em, 'name', gname)::text;

  select id, active into pid, act from public.roster_participants where business_id = b and phone_norm = norm;
  if pid is not null and exists (select 1 from public.roster_members x where x.business_id = b and x.participant_id = pid and x.user_id <> uid and x.status in ('approved', 'blocked')) then
    select * into pa from public.roster_participants where id = pid;
    perform public.roster_emit(b, 'participant.phone_conflict', jsonb_build_object('participant', public.roster_participant_json(pa),
      'google', acct::jsonb, 'account', acct::jsonb));
    perform public.roster_sys_note(b, pid, 'חשבון גוגל נוסף ניסה להתחבר עם הטלפון הזה (' || em || ') ולא חובר', 'phone_conflict');
    return jsonb_build_object('status', 'phone_taken');
  end if;

  if pid is null then   -- a new participant: the phone only, the details come with roster_me_complete
    if public.roster_rate_take('me_new:' || b, 60, 60) > 0 then
      perform public.roster_rate_give_back(bucket_me);
      perform public.roster_rate_give_back('me_try:' || b);
      return jsonb_build_object('status', 'try_later');
    end if;
    begin
      insert into public.roster_participants (business_id, first_name, last_name, phone, age_set_at) values (b, '', '', norm, public.roster_today()) returning id into pid;
      created := true;
    exception when unique_violation then
      select id, active into pid, act from public.roster_participants where business_id = b and phone_norm = norm;
    end;
  end if;
  already := m.user_id is not null and m.participant_id is not distinct from pid and m.status = 'approved';
  if created then
    perform public.roster_sys_note(b, pid, 'נרשם/ה דרך האזור האישי עם חשבון גוגל · טלפון ' || norm, 'registered');
  elsif not coalesce(act, true) then
    update public.roster_participants set active = true where id = pid and business_id = b;   -- the trigger notes it
    react := true;
  end if;

  if p_meeting is not null then
    ast := public.roster_attach(b, pid, p_meeting);
    reg := ast in ('registered', 'exists');
  end if;

  begin
    insert into public.roster_members (business_id, user_id, email, google_name, participant_id, status) values (b, uid, em, gname, pid, 'approved')
      on conflict (business_id, user_id) do update set participant_id = excluded.participant_id, status = 'approved', email = excluded.email, google_name = excluded.google_name;
  exception when unique_violation then
    return jsonb_build_object('status', 'phone_taken');
  end;
  perform public.roster_sys_note(b, pid, 'חשבון גוגל חובר לאזור האישי: ' || em, 'google_linked');

  select * into pa from public.roster_participants where id = pid;
  if not created and not already then   -- an account got linked to a participant that was already there: tell the admins
    perform public.roster_emit(b, 'participant.linked', jsonb_build_object('participant', public.roster_participant_json(pa), 'account', acct::jsonb));
  end if;
  return jsonb_build_object('status', case when created then 'created' when react then 'reactivated' else 'linked' end,
    'complete', (char_length(btrim(pa.first_name)) >= 2 and char_length(btrim(pa.last_name)) >= 2 and pa.age is not null and pa.gender is not null),
    'registered', reg) - case when p_meeting is null then 'registered' else '' end;   -- exactly {status, complete} unless a meeting was asked for
end $fn$;

-- fill in the details: ok | none | forbidden | invalid_name | invalid_age | invalid_gender | invalid_email (| auth, disabled, blocked)
-- The first time the names are filled in for a participant made by roster_me_phone (no name yet), participant.created is emitted
-- (source me): that is when the business learns about the person.
create or replace function public.roster_me_complete(p_slug text, p_first text, p_last text, p_age int default null, p_gender text default null, p_email text default null)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  r jsonb := public.roster_me_resolve(p_slug, true); st text := r->>'status'; b uuid := nullif(r->>'business_id', '')::uuid; pid uuid := nullif(r->>'participant_id', '')::uuid;
  fn text := btrim(regexp_replace(coalesce(p_first, ''), '[\u0009-\u000d \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+', ' ', 'g')); ln text := btrim(regexp_replace(coalesce(p_last, ''), '[\u0009-\u000d \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+', ' ', 'g'));
  em text := lower(btrim(coalesce(p_email, ''))); gd text := lower(btrim(coalesce(p_gender, '')));
  old public.roster_participants; pa public.roster_participants;
begin
  if st <> 'ok' then return public.roster_me_text(st); end if;
  if char_length(fn) < 2 or char_length(ln) < 2 or char_length(fn) > 40 or char_length(ln) > 40
     or not public.roster_valid_name(fn) or not public.roster_valid_name(ln) then return 'invalid_name'; end if;
  if p_age is not null and (p_age < 18 or p_age > 99) then return 'invalid_age'; end if;
  if gd <> '' and gd not in ('male', 'female') then return 'invalid_gender'; end if;
  if em <> '' and not public.roster_valid_email(em) then return 'invalid_email'; end if;
  perform set_config('roster.source', 'me', true);
  select * into old from public.roster_participants where id = pid and business_id = b;
  -- age, gender and email are optional here: what is left empty leaves what the participant already has
  update public.roster_participants set first_name = fn, last_name = ln,
         age = coalesce(p_age, age), age_set_at = case when p_age is not null then public.roster_today() else age_set_at end,
         gender = coalesce(nullif(gd, ''), gender), email = coalesce(nullif(em, ''), email)
   where id = pid and business_id = b;
  perform public.roster_sys_note(b, pid, 'השלים/ה פרטים: ' || fn || ' ' || ln || coalesce(' · גיל ' || p_age, '')
    || case gd when 'male' then ' · זכר' when 'female' then ' · נקבה' else '' end, 'profile_completed');
  if old.id is not null and btrim(coalesce(old.first_name, '') || coalesce(old.last_name, '')) = '' then
    select * into pa from public.roster_participants where id = pid and business_id = b;
    perform public.roster_emit(b, 'participant.created', jsonb_build_object('participant', public.roster_participant_json(pa)));
  end if;
  return 'ok';
end $fn$;

-- register to a meeting: registered | exists | past | full (| none, forbidden, disabled, blocked, auth)
create or replace function public.roster_me_register(p_slug text, p_meeting uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare r jsonb := public.roster_me_resolve(p_slug, true); st text := r->>'status'; b uuid := nullif(r->>'business_id', '')::uuid; pid uuid := nullif(r->>'participant_id', '')::uuid; a text;
begin
  if st <> 'ok' then return public.roster_me_text(st); end if;
  perform set_config('roster.source', 'me', true);
  a := public.roster_attach(b, pid, p_meeting);
  return case a when 'not_found' then 'past' else a end;
end $fn$;

-- cancel a registration: cancelled | not_registered | attended | past. Payments are not touched.
create or replace function public.roster_me_unregister(p_slug text, p_meeting uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare r jsonb := public.roster_me_resolve(p_slug, true); st text := r->>'status'; b uuid := nullif(r->>'business_id', '')::uuid; pid uuid := nullif(r->>'participant_id', '')::uuid;
        mt public.roster_meetings; a public.roster_attendance;
begin
  if st <> 'ok' then return public.roster_me_text(st); end if;
  select * into mt from public.roster_meetings where id = p_meeting and business_id = b;
  if not found or mt.meeting_date < public.roster_today() then return 'past'; end if;
  select * into a from public.roster_attendance where business_id = b and participant_id = pid and meeting_id = p_meeting;
  if not found then return 'not_registered'; end if;
  if coalesce(a.attended, false) then return 'attended'; end if;
  perform set_config('roster.source', 'me', true);
  delete from public.roster_attendance where business_id = b and participant_id = pid and meeting_id = p_meeting;
  return 'cancelled';
end $fn$;

-- edit my details: ok | invalid_name | invalid_age | invalid_gender | invalid_phone | invalid_email | phone_taken (| forbidden ...)
create or replace function public.roster_me_update(p_slug text, p_first text, p_last text, p_age int default null, p_gender text default null, p_phone text default null, p_email text default null)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  r jsonb := public.roster_me_resolve(p_slug, true); st text := r->>'status'; b uuid := nullif(r->>'business_id', '')::uuid; pid uuid := nullif(r->>'participant_id', '')::uuid;
  norm text := public.roster_normalize_phone(p_phone); em text := lower(btrim(coalesce(p_email, ''))); gd text := lower(btrim(coalesce(p_gender, '')));
  old public.roster_participants; changed text[] := '{}';
  fn text := btrim(regexp_replace(coalesce(p_first, ''), '[\u0009-\u000d \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+', ' ', 'g')); ln text := btrim(regexp_replace(coalesce(p_last, ''), '[\u0009-\u000d \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+', ' ', 'g'));
begin
  if st <> 'ok' then return public.roster_me_text(st); end if;
  if char_length(fn) < 2 or char_length(ln) < 2 or char_length(fn) > 40 or char_length(ln) > 40
     or not public.roster_valid_name(fn) or not public.roster_valid_name(ln) then return 'invalid_name'; end if;
  if p_age is not null and (p_age < 18 or p_age > 99) then return 'invalid_age'; end if;
  if gd <> '' and gd not in ('male', 'female') then return 'invalid_gender'; end if;
  if norm = '' then return 'invalid_phone'; end if;
  if em <> '' and not public.roster_valid_email(em) then return 'invalid_email'; end if;
  if exists (select 1 from public.roster_participants where business_id = b and phone_norm = norm and id <> pid) then return 'phone_taken'; end if;
  select * into old from public.roster_participants where id = pid and business_id = b;
  perform set_config('roster.source', 'me', true);
  begin
    -- the form is filled with what the participant has: an empty age, gender or email means it was cleared
    update public.roster_participants set first_name = fn, last_name = ln, age = p_age,
           age_set_at = case when p_age is not null then public.roster_today() else age_set_at end,
           gender = nullif(gd, ''), phone = norm, email = nullif(em, '')   -- the normalised number, never the text as typed
     where id = pid and business_id = b;
  exception when unique_violation then return 'phone_taken';
  end;
  if old.first_name is distinct from fn or old.last_name is distinct from ln then changed := array_append(changed, 'שם'::text); end if;
  if old.age is distinct from p_age then changed := array_append(changed, 'גיל'::text); end if;
  if old.gender is distinct from nullif(gd, '') then changed := array_append(changed, 'מגדר'::text); end if;
  if old.phone_norm is distinct from norm then changed := array_append(changed, 'טלפון'::text); end if;
  if old.email is distinct from nullif(em, '') then changed := array_append(changed, 'אימייל'::text); end if;
  if cardinality(changed) > 0 then
    perform public.roster_sys_note(b, pid, 'עדכן/ה פרטים באזור האישי: ' || array_to_string(changed, ', '), 'profile_changed');
  end if;
  return 'ok';
end $fn$;

-- pay a meeting from my credit
create or replace function public.roster_me_pay_credit(p_slug text, p_meeting uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare r jsonb := public.roster_me_resolve(p_slug, true); st text := r->>'status'; b uuid := nullif(r->>'business_id', '')::uuid; pid uuid := nullif(r->>'participant_id', '')::uuid;
begin
  if st <> 'ok' then return jsonb_build_object('status', public.roster_me_text(st)); end if;
  perform set_config('roster.source', 'me', true);
  return public.roster_pay_credit_core(b, pid, p_meeting);
end $fn$;

-- "I paid" click from the personal area: ok | reported | already | not_registered | past (harpatka's words)
create or replace function public.roster_me_report_payment(p_slug text, p_meeting uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare r jsonb := public.roster_me_resolve(p_slug, true); st text := r->>'status'; b uuid := nullif(r->>'business_id', '')::uuid; pid uuid := nullif(r->>'participant_id', '')::uuid; c text;
begin
  if st <> 'ok' then return public.roster_me_text(st); end if;
  perform set_config('roster.source', 'me', true);
  c := public.roster_report_core(b, pid, p_meeting);
  return case c when 'reported' then 'ok' when 'already_reported' then 'reported' when 'already_paid' then 'already' when 'free' then 'already' else c end;
end $fn$;

-- The two counters of the earlier version (check, then add, not atomic) are gone: roster_rate_take does both in one step.
drop function if exists public.roster_rate_check(text, integer, integer);
drop function if exists public.roster_rate_add(text);

-- ---- 12.13 who may run what --------------------------------------------------
-- service_role only: the API and the outbox
revoke all on function public.roster_api_auth(text, text, text, text, text)           from public, anon, authenticated;
revoke all on function public.roster_api_meetings(text, int)                          from public, anon, authenticated;
revoke all on function public.roster_api_signup(text, jsonb, text)                    from public, anon, authenticated;
revoke all on function public.roster_api_payment_click(text, text, uuid, text)        from public, anon, authenticated;
revoke all on function public.roster_api_participant(text, uuid, text)                from public, anon, authenticated;
revoke all on function public.roster_api_register(text, uuid, uuid)                   from public, anon, authenticated;
revoke all on function public.roster_api_unregister(text, uuid, uuid)                 from public, anon, authenticated;
revoke all on function public.roster_api_record_payment(text, jsonb)                  from public, anon, authenticated;
revoke all on function public.roster_api_pay_from_credit(text, uuid, uuid)            from public, anon, authenticated;
revoke all on function public.roster_events_claim(int)                                from public, anon, authenticated;
revoke all on function public.roster_events_done(bigint, jsonb)                       from public, anon, authenticated;
revoke all on function public.roster_rate_cleanup()                                   from public, anon, authenticated;
grant execute on function public.roster_api_auth(text, text, text, text, text)        to service_role;
grant execute on function public.roster_api_meetings(text, int)                       to service_role;
grant execute on function public.roster_api_signup(text, jsonb, text)                 to service_role;
grant execute on function public.roster_api_payment_click(text, text, uuid, text)     to service_role;
grant execute on function public.roster_api_participant(text, uuid, text)             to service_role;
grant execute on function public.roster_api_register(text, uuid, uuid)                to service_role;
grant execute on function public.roster_api_unregister(text, uuid, uuid)              to service_role;
grant execute on function public.roster_api_record_payment(text, jsonb)               to service_role;
grant execute on function public.roster_api_pay_from_credit(text, uuid, uuid)         to service_role;
grant execute on function public.roster_events_claim(int)                             to service_role;
grant execute on function public.roster_events_done(bigint, jsonb)                    to service_role;
grant execute on function public.roster_rate_cleanup()                                to service_role;

-- signed-in accounts: the connections page (scoped to the business of the x-business header) and the personal area
revoke all on function public.roster_key_create(text, text, text[])                   from public, anon;
revoke all on function public.roster_key_revoke(uuid)                                 from public, anon;
revoke all on function public.roster_webhook_secret_rotate()                          from public, anon;
revoke all on function public.roster_webhook_test()                                   from public, anon;
revoke all on function public.roster_mail_template_reset(text)                        from public, anon;
revoke all on function public.roster_me(text)                                         from public, anon;
revoke all on function public.roster_me_phone(text, text, uuid)                       from public, anon;
revoke all on function public.roster_me_complete(text, text, text, int, text, text)   from public, anon;
revoke all on function public.roster_me_register(text, uuid)                          from public, anon;
revoke all on function public.roster_me_unregister(text, uuid)                        from public, anon;
revoke all on function public.roster_me_update(text, text, text, int, text, text, text) from public, anon;
revoke all on function public.roster_me_pay_credit(text, uuid)                        from public, anon;
revoke all on function public.roster_me_report_payment(text, uuid)                    from public, anon;
grant execute on function public.roster_key_create(text, text, text[])                to authenticated;
grant execute on function public.roster_key_revoke(uuid)                              to authenticated;
grant execute on function public.roster_webhook_secret_rotate()                       to authenticated;
grant execute on function public.roster_webhook_test()                                to authenticated;
grant execute on function public.roster_mail_template_reset(text)                     to authenticated;
grant execute on function public.roster_me(text)                                      to authenticated;
grant execute on function public.roster_me_phone(text, text, uuid)                    to authenticated;
grant execute on function public.roster_me_complete(text, text, text, int, text, text) to authenticated;
grant execute on function public.roster_me_register(text, uuid)                       to authenticated;
grant execute on function public.roster_me_unregister(text, uuid)                     to authenticated;
grant execute on function public.roster_me_update(text, text, text, int, text, text, text) to authenticated;
grant execute on function public.roster_me_pay_credit(text, uuid)                     to authenticated;
grant execute on function public.roster_me_report_payment(text, uuid)                 to authenticated;

-- the four validators sit in CHECK constraints a signed-in account's writes run through: that needs EXECUTE (they are pure)
revoke all on function public.roster_valid_email(text), public.roster_valid_emails(text[]), public.roster_valid_webhook_url(text), public.roster_valid_name(text) from public, anon;
grant execute on function public.roster_valid_email(text), public.roster_valid_emails(text[]), public.roster_valid_webhook_url(text), public.roster_valid_name(text) to authenticated, service_role;

-- helpers and trigger functions: for the database itself, nobody calls them
do $$
declare f text;
begin
  foreach f in array array[
    'roster_today()', 'roster_random_text(integer)', 'roster_sha256(text)',
    'roster_current_age(integer, date)', 'roster_meeting_price(jsonb, integer)',
    'roster_participants_email_trg()', 'roster_settings_trg()', 'roster_touch_updated_at()', 'roster_members_trg()',
    'roster_business_settings_new()', 'roster_rate_take(text, integer, integer)', 'roster_rate_give_back(text)', 'roster_retention(boolean)',
    'roster_participant_cleanup()', 'roster_author_trg()', 'roster_msg_template_seed(uuid)', 'roster_msg_template_guard()', 'roster_api_key_of(text)',
    'roster_settings_of(uuid)', 'roster_participant_json(roster_participants)', 'roster_registered_count(uuid, uuid)',
    'roster_meeting_json(roster_meetings, boolean, date)', 'roster_balance(uuid, uuid)', 'roster_paid_for(uuid, uuid, uuid)',
    'roster_person_meetings(uuid, uuid, boolean)', 'roster_person_json(uuid, uuid)', 'roster_attach(uuid, uuid, uuid)',
    'roster_report_core(uuid, uuid, uuid)', 'roster_pay_credit_core(uuid, uuid, uuid)', 'roster_event_source()',
    'roster_emit(uuid, text, jsonb)', 'roster_ev_participant()', 'roster_ev_attendance()', 'roster_meeting_brief(roster_meetings)',
    'roster_ev_pay_reported()', 'roster_ev_payment()', 'roster_webhook_wanted(roster_business_settings, text)',
    'roster_event_item(bigint)', 'roster_my_current()', 'roster_me_resolve(text, boolean)', 'roster_me_text(text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', f);
  end loop;
end $$;

-- the identity sequences of the outbox and the delivery log: nobody signed in has any business with them
-- (nextval would be an uncounted way to burn ids, and last_value tells how busy the outbox is)
do $$
begin
  if to_regclass('public.roster_events_id_seq') is not null then
    revoke all on sequence public.roster_events_id_seq from public, anon, authenticated;
  end if;
  if to_regclass('public.roster_webhook_deliveries_id_seq') is not null then
    revoke all on sequence public.roster_webhook_deliveries_id_seq from public, anon, authenticated;
  end if;
end $$;

notify pgrst, 'reload schema';
