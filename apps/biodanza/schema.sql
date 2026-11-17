-- All of Biodanza lives in the schema `biodanza` (named for biodanza.floa.co.il). The REST API reaches it through the
-- Accept-Profile / Content-Profile headers (added by /supabase.js in the browser, by hand in the Worker and the build).
create schema if not exists biodanza;
grant usage on schema biodanza to anon, authenticated, service_role;
set search_path = biodanza, public;

-- ==========================================================================
-- Biodanza: a facilitator builds a vivencia (a session), plans it along the
-- curve, and plays it during the meeting.
--
-- ACCESS. Nothing here is public, the catalog included (it is material for
-- facilitators only). Signing in with Google is not enough: the signed-in
-- email must be on `allowed`, and only an admin edits that list. The rule is
-- enforced here by row level security, not by the page: the anon key can
-- read nothing, and a signed-in stranger reads nothing.
--
-- CATALOG vs OWN. `exercises` and `music` hold the shared catalog (owner_id
-- null, written by an import script and by an admin) and each facilitator's
-- own copies and additions (owner_id = their user id). Editing a catalog
-- exercise means making a copy (base_id points back at the original), so the
-- original is never lost.
--
-- A VIVENCIA is an ordered list of items. Each item is one exercise and the ONE
-- music chosen for it. The ORDER of the list is the curve of the session: an
-- item keeps no phase of its own, its place in the sequence says where on the
-- curve it sits. A vivencia has any number of owners, all equal. Sharing for
-- view and copy comes later.
--
-- Run: node scripts/sql.mjs < apps/biodanza/schema.sql   (safe to run again)
-- ==========================================================================

-- ---------- who may enter ----------
create table if not exists biodanza.allowed (
  email     text primary key check (email = lower(email)),
  is_admin  boolean not null default false,
  note      text not null default '',
  added_at  timestamptz not null default now()
);

create or replace function biodanza.jwt_email() returns text
  language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function biodanza.is_allowed() returns boolean
  language sql stable security definer set search_path = biodanza, public as
  $$ select exists (select 1 from biodanza.allowed where email = biodanza.jwt_email()) $$;

create or replace function biodanza.is_admin() returns boolean
  language sql stable security definer set search_path = biodanza, public as
  $$ select exists (select 1 from biodanza.allowed where email = biodanza.jwt_email() and is_admin) $$;

-- The page asks this first, so a stranger gets "no access" instead of empty lists.
create or replace function biodanza.me() returns jsonb
  language sql stable security definer set search_path = biodanza, public as
  $$ select jsonb_build_object('email', biodanza.jwt_email(), 'allowed', biodanza.is_allowed(), 'admin', biodanza.is_admin()) $$;

-- ---------- fixed vocabularies ----------
-- The five lines of vivencia (potentials).
create table if not exists biodanza.lines (
  key      text primary key,
  name_he  text not null,
  sort     int  not null
);
insert into biodanza.lines (key, name_he, sort) values
  ('vitality',      'חיוניות',  1),
  ('sexuality',     'מיניות',   2),
  ('creativity',    'יצירתיות', 3),
  ('affectivity',   'חיבתיות',  4),
  ('transcendence', 'התעלות',   5)
on conflict (key) do update set name_he = excluded.name_he, sort = excluded.sort;

-- The curve of a session. `catalog_phase` is the name in the CIMEB 2018 text.
create table if not exists biodanza.phases (
  key            text primary key,
  name_he        text not null,
  catalog_phase  text not null,
  sort           int  not null
);
insert into biodanza.phases (key, name_he, catalog_phase, sort) values
  ('opening',    'מעגל פתיחה',          'I, התחלה',     1),
  ('activation', 'אקטיבציה',            'II, אדרנרגי',  2),
  ('bridge',     'גשר',                 'III, מעבר',    3),
  ('regression', 'ריגרסיה',             'IV, כולינרגי', 4),
  ('closing',    'אקטיבציה ומעגל סיום', 'V, סיום',      5)
on conflict (key) do update set name_he = excluded.name_he, catalog_phase = excluded.catalog_phase, sort = excluded.sort;

-- ---------- the catalog and the facilitator's own ----------
create table if not exists biodanza.exercises (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid references auth.users(id) on delete cascade,   -- null = shared catalog
  base_id        uuid references biodanza.exercises(id) on delete set null,   -- the catalog exercise this is a copy of
  source         text not null default '',        -- 'ibf2012', 'cimeb2018', or '' for one a facilitator wrote
  category       text not null default '',        -- circle, walk, game, ...
  title_he       text not null default '',
  title_en       text not null default '',
  summary        text not null default '',
  poetics        text not null default '',        -- why we do it and how it joins real life (the existential projection)
  guidance       text not null default '',        -- how the facilitator guides it
  objective      text not null default '',
  emphasis       text not null default '',        -- extra notes from the catalog
  semantic_field text not null default '',
  level          text not null default '',
  authors        text not null default '',
  phase_hint     text references biodanza.phases(key),   -- where the catalog says it belongs; the vivencia decides
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists exercises_owner_idx on biodanza.exercises (owner_id);
create unique index if not exists exercises_catalog_uq on biodanza.exercises (source, title_en) where owner_id is null and source <> '';

-- Which lines an exercise stresses. `main` marks the leading one.
create table if not exists biodanza.exercise_lines (
  exercise_id uuid not null references biodanza.exercises(id) on delete cascade,
  line_key    text not null references biodanza.lines(key),
  main        boolean not null default false,
  primary key (exercise_id, line_key)
);

-- Music is a NAME for now, not a file. `name` is how the facilitator says it
-- ("Theatrical Touch, La Musgaña"); the rest is what the catalogs add.
create table if not exists biodanza.music (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references auth.users(id) on delete cascade,   -- null = shared catalog
  name         text not null,
  duration_sec int,
  collection   text not null default '',   -- 'BA 08-13', 'IBF 17-12', ...
  created_at   timestamptz not null default now()
);
create unique index if not exists music_catalog_uq on biodanza.music (lower(name), collection) where owner_id is null;
create index if not exists music_owner_idx on biodanza.music (owner_id);

-- The possible music of an exercise: any number.
create table if not exists biodanza.exercise_music (
  exercise_id uuid not null references biodanza.exercises(id) on delete cascade,
  music_id    uuid not null references biodanza.music(id) on delete cascade,
  phase_hint  text references biodanza.phases(key),   -- the phase this music suits, when the catalog says
  note        text not null default '',
  source      text not null default '',
  primary key (exercise_id, music_id)
);

-- ---------- vivencias ----------
create table if not exists biodanza.vivencias (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default '',   -- the theme of the session IS its name
  notes      text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists biodanza.vivencia_owners (
  vivencia_id uuid not null references biodanza.vivencias(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  position    int,     -- THIS owner's own order of their list; null = newest, shown first
  primary key (vivencia_id, user_id)
);

create table if not exists biodanza.vivencia_items (
  id          uuid primary key default gen_random_uuid(),
  vivencia_id uuid not null references biodanza.vivencias(id) on delete cascade,
  position    int  not null,
  exercise_id uuid references biodanza.exercises(id) on delete restrict,
  music_id    uuid references biodanza.music(id) on delete set null,   -- the ONE chosen music
  title       text,    -- null: the catalog's name; a text here renames this item in this vivencia only
  poetics     text,    -- null: the catalog's text; a text here changes this item in this vivencia only
  guidance    text,    -- same
  notes       text not null default ''
);
alter table biodanza.vivencia_items drop column if exists phase_key;
alter table biodanza.vivencias drop column if exists theme;
alter table biodanza.vivencia_items add column if not exists title text;
alter table biodanza.vivencia_owners add column if not exists position int;
alter table biodanza.vivencia_items add column if not exists poetics text, add column if not exists guidance text, drop column if exists minutes;
create index if not exists vivencia_items_viv_idx on biodanza.vivencia_items (vivencia_id, position);

create or replace function biodanza.owns(v uuid) returns boolean
  language sql stable security definer set search_path = biodanza, public as
  $$ select biodanza.is_allowed() and exists (select 1 from biodanza.vivencia_owners where vivencia_id = v and user_id = auth.uid()) $$;

-- Creating a vivencia makes its creator the first owner, in one step.
create or replace function biodanza.vivencia_new() returns trigger
  language plpgsql security definer set search_path = biodanza, public as $$
begin
  insert into biodanza.vivencia_owners (vivencia_id, user_id) values (new.id, auth.uid()) on conflict do nothing;
  return new;
end $$;
drop trigger if exists vivencia_new on biodanza.vivencias;
create trigger vivencia_new after insert on biodanza.vivencias for each row execute function biodanza.vivencia_new();

-- ---------- row level security ----------
alter table biodanza.allowed         enable row level security;
alter table biodanza.lines           enable row level security;
alter table biodanza.phases          enable row level security;
alter table biodanza.exercises       enable row level security;
alter table biodanza.exercise_lines  enable row level security;
alter table biodanza.music           enable row level security;
alter table biodanza.exercise_music  enable row level security;
alter table biodanza.vivencias       enable row level security;
alter table biodanza.vivencia_owners enable row level security;
alter table biodanza.vivencia_items  enable row level security;

-- allowed: only an admin sees and edits the list.
drop policy if exists allowed_admin on biodanza.allowed;
create policy allowed_admin on biodanza.allowed for all to authenticated using (biodanza.is_admin()) with check (biodanza.is_admin());

-- vocabularies: any allowed user reads; nobody edits from the browser.
drop policy if exists lines_read on biodanza.lines;
create policy lines_read on biodanza.lines for select to authenticated using (biodanza.is_allowed());
drop policy if exists phases_read on biodanza.phases;
create policy phases_read on biodanza.phases for select to authenticated using (biodanza.is_allowed());

-- exercises: read the catalog and your own; write your own (an admin also writes the catalog).
drop policy if exists exercises_read on biodanza.exercises;
create policy exercises_read on biodanza.exercises for select to authenticated
  using (biodanza.is_allowed() and (owner_id is null or owner_id = auth.uid()));
drop policy if exists exercises_write on biodanza.exercises;
create policy exercises_write on biodanza.exercises for all to authenticated
  using (biodanza.is_allowed() and (owner_id = auth.uid() or (owner_id is null and biodanza.is_admin())))
  with check (biodanza.is_allowed() and (owner_id = auth.uid() or (owner_id is null and biodanza.is_admin())));

drop policy if exists exercise_lines_read on biodanza.exercise_lines;
create policy exercise_lines_read on biodanza.exercise_lines for select to authenticated
  using (exists (select 1 from biodanza.exercises e where e.id = exercise_id));   -- the exercises policy decides
drop policy if exists exercise_lines_write on biodanza.exercise_lines;
create policy exercise_lines_write on biodanza.exercise_lines for all to authenticated
  using (exists (select 1 from biodanza.exercises e where e.id = exercise_id and biodanza.is_allowed() and (e.owner_id = auth.uid() or (e.owner_id is null and biodanza.is_admin()))))
  with check (exists (select 1 from biodanza.exercises e where e.id = exercise_id and biodanza.is_allowed() and (e.owner_id = auth.uid() or (e.owner_id is null and biodanza.is_admin()))));

-- music: same shape.
drop policy if exists music_read on biodanza.music;
create policy music_read on biodanza.music for select to authenticated
  using (biodanza.is_allowed() and (owner_id is null or owner_id = auth.uid()));
drop policy if exists music_write on biodanza.music;
create policy music_write on biodanza.music for all to authenticated
  using (biodanza.is_allowed() and (owner_id = auth.uid() or (owner_id is null and biodanza.is_admin())))
  with check (biodanza.is_allowed() and (owner_id = auth.uid() or (owner_id is null and biodanza.is_admin())));

drop policy if exists exercise_music_read on biodanza.exercise_music;
create policy exercise_music_read on biodanza.exercise_music for select to authenticated
  using (exists (select 1 from biodanza.exercises e where e.id = exercise_id));
drop policy if exists exercise_music_write on biodanza.exercise_music;
create policy exercise_music_write on biodanza.exercise_music for all to authenticated
  using (exists (select 1 from biodanza.exercises e where e.id = exercise_id and biodanza.is_allowed() and (e.owner_id = auth.uid() or (e.owner_id is null and biodanza.is_admin()))))
  with check (exists (select 1 from biodanza.exercises e where e.id = exercise_id and biodanza.is_allowed() and (e.owner_id = auth.uid() or (e.owner_id is null and biodanza.is_admin()))));

-- vivencias: owners only.
drop policy if exists vivencias_read on biodanza.vivencias;
create policy vivencias_read on biodanza.vivencias for select to authenticated using (biodanza.owns(id));
drop policy if exists vivencias_insert on biodanza.vivencias;
create policy vivencias_insert on biodanza.vivencias for insert to authenticated with check (biodanza.is_allowed());
drop policy if exists vivencias_update on biodanza.vivencias;
create policy vivencias_update on biodanza.vivencias for update to authenticated using (biodanza.owns(id)) with check (biodanza.owns(id));
drop policy if exists vivencias_delete on biodanza.vivencias;
create policy vivencias_delete on biodanza.vivencias for delete to authenticated using (biodanza.owns(id));

drop policy if exists vivencia_owners_read on biodanza.vivencia_owners;
create policy vivencia_owners_read on biodanza.vivencia_owners for select to authenticated using (biodanza.owns(vivencia_id));
drop policy if exists vivencia_owners_write on biodanza.vivencia_owners;
create policy vivencia_owners_write on biodanza.vivencia_owners for all to authenticated using (biodanza.owns(vivencia_id)) with check (biodanza.owns(vivencia_id));

drop policy if exists vivencia_items_all on biodanza.vivencia_items;
create policy vivencia_items_all on biodanza.vivencia_items for all to authenticated using (biodanza.owns(vivencia_id)) with check (biodanza.owns(vivencia_id));

-- ---------- grants: signed-in only; the anon key gets nothing ----------
revoke all on all tables in schema biodanza from anon;
grant select, insert, update, delete on all tables in schema biodanza to authenticated, service_role;
grant execute on all functions in schema biodanza to authenticated, service_role;
revoke execute on all functions in schema biodanza from anon;

-- The first admin. Everyone else is added from the admin screen.
insert into biodanza.allowed (email, is_admin, note) values ('ofir.aviram@gmail.com', true, 'owner')
on conflict (email) do update set is_admin = true;
