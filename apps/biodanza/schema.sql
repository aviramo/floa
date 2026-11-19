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
create index if not exists exercises_category_idx on biodanza.exercises (category);   -- the picker filters by category
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


-- ---------- the texts of an exercise, per language ----------
-- poetics and guidance live here, one row per exercise and language. The original wording of the catalog is never overwritten:
-- `source` says where a text came from ('catalog' = the catalog's own words in that language, 'translation' = a translation made
-- for this app). More languages are more rows. A facilitator's own edit goes on the vivencia's item, not here.
create table if not exists biodanza.exercise_texts (
  exercise_id uuid not null references biodanza.exercises(id) on delete cascade,
  lang        text not null,
  poetics     text not null default '',
  guidance    text not null default '',
  source      text not null default 'catalog',
  updated_at  timestamptz not null default now(),
  primary key (exercise_id, lang)
);
alter table biodanza.exercise_texts enable row level security;
drop policy if exists exercise_texts_read on biodanza.exercise_texts;
create policy exercise_texts_read on biodanza.exercise_texts for select to authenticated
  using (exists (select 1 from biodanza.exercises e where e.id = exercise_id));   -- the exercises policy decides
drop policy if exists exercise_texts_write on biodanza.exercise_texts;
create policy exercise_texts_write on biodanza.exercise_texts for all to authenticated
  using (exists (select 1 from biodanza.exercises e where e.id = exercise_id and biodanza.is_allowed() and (e.owner_id = auth.uid() or (e.owner_id is null and biodanza.is_admin()))))
  with check (exists (select 1 from biodanza.exercises e where e.id = exercise_id and biodanza.is_allowed() and (e.owner_id = auth.uid() or (e.owner_id is null and biodanza.is_admin()))));

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

-- ---------- the categories of the catalogs (circles, walks, games, ...) ----------
-- A category is NOT a line of vivencia: the five lines are `lines`. `exercises.category` holds the key (the catalog's English name) of one of these.
create table if not exists biodanza.categories (
  key      text primary key,
  name_he  text not null,
  sort     int  not null default 0
);
-- the category's name in the catalog's original language (and which language that is); name_he stays the display name
alter table biodanza.categories add column if not exists name_orig text not null default '';
alter table biodanza.categories add column if not exists lang_orig text not null default 'en';
alter table biodanza.categories enable row level security;
drop policy if exists categories_read on biodanza.categories;
create policy categories_read on biodanza.categories for select to authenticated using (biodanza.is_allowed());
-- The old category seed (the 2012/2014/2018 groupings) was removed on 2026-11-19: the catalog was rebuilt from the 2012 catalog and the categories now live in
-- the database (24 rows, with name_orig). Re-running this file must NOT re-create the deleted categories, so there is no seed here.
-- insert into biodanza.categories (key, name_he, sort) values
--   ('Circles', 'מעגלים', 1), ('Walking', 'הליכות', 2), ('Games', 'משחקים', 3), ('Breathing In Biodanza', 'נשימה בביודנסה', 4),
--   ('Fluidity', 'זרימה', 5), ('Eutony', 'יוטוניה', 6), ('Segmentary Movements', 'תנועות סגמנטריות', 7),
--   ('Integration Of The Three Centers', 'אינטגרציה של שלושת המרכזים', 8), ('The Encounter', 'המפגש', 9),
--   ('Contact And Caresses', 'מגע וליטוף', 10), ('Undifferenciated Contact', 'מגע לא מובחן', 11),
--   ('Yin Dance And Yang Dance', 'ריקוד יין וריקוד יאנג', 12), ('Dances Of The Four Animals', 'ריקודי ארבע החיות', 13),
--   ('Dances Of Shiva, Brahma And Vishnu', 'ריקודי שיווה, ברהמה ווישנו', 14), ('Exercices Without Music', 'תרגילים ללא מוזיקה', 15),
--   ('Danses Specifiques', 'ריקודים ייחודיים', 16), ('Generative Postures', 'תנוחות מכוננות', 17), ('Sequential Dances', 'ריקודי רצף', 18),
--   ('Dances Of The Angels', 'ריקודי המלאכים', 19), ('Elements', 'יסודות', 20), ('Procedures Of Facilitation', 'פרוצדורות של אפשור', 21),
--   -- from the 2014 catalog and the Buenos Aires CD table (their own groupings)
--   ('Dance In Pairs', 'ריקוד בזוגות', 22), ('Synchronization', 'סינכרוניזציה', 23), ('Activation', 'אקטיבציה', 24),
--   ('Rhythmic Dances', 'ריקודי קצב', 25), ('Expressive Dances', 'ריקודים אקספרסיביים', 26)
-- on conflict (key) do update set name_he = excluded.name_he, sort = excluded.sort;
grant select on biodanza.categories to authenticated, service_role;

-- ---------- sharing a vivencia: view or edit, with accounts of the allowlist only ----------
-- OWNERS (vivencia_owners) can do everything, share and delete included. A SHARE gives one allowed account (by email, so it works before
-- that person ever signs in) either 'view' (read only) or 'edit' (change the vivencia and its items, not delete or share it).
create table if not exists biodanza.vivencia_shares (
  vivencia_id uuid not null references biodanza.vivencias(id) on delete cascade,
  email       text not null check (email = lower(email)),
  role        text not null check (role in ('view', 'edit')),
  position    int,    -- the order of THIS person's list; changed through set_share_position()
  created_at  timestamptz not null default now(),
  primary key (vivencia_id, email)
);
alter table biodanza.vivencia_shares enable row level security;

create or replace function biodanza.can_view(v uuid) returns boolean
  language sql stable security definer set search_path = biodanza, public as $$
  select biodanza.is_allowed() and (
    exists (select 1 from biodanza.vivencia_owners where vivencia_id = v and user_id = auth.uid())
    or exists (select 1 from biodanza.vivencia_shares where vivencia_id = v and email = biodanza.jwt_email())) $$;
create or replace function biodanza.can_edit(v uuid) returns boolean
  language sql stable security definer set search_path = biodanza, public as $$
  select biodanza.is_allowed() and (
    exists (select 1 from biodanza.vivencia_owners where vivencia_id = v and user_id = auth.uid())
    or exists (select 1 from biodanza.vivencia_shares where vivencia_id = v and email = biodanza.jwt_email() and role = 'edit')) $$;

-- the accounts a vivencia can be shared with: the allowlist, nothing else (every allowed account may see it, to choose from)
create or replace function biodanza.share_candidates() returns table (email text, note text)
  language sql stable security definer set search_path = biodanza, public as $$
  select a.email, a.note from biodanza.allowed a where biodanza.is_allowed() and a.email <> biodanza.jwt_email() order by a.note, a.email $$;

-- a person with a share orders their own list
create or replace function biodanza.set_share_position(v uuid, pos int) returns void
  language sql security definer set search_path = biodanza, public as $$
  update biodanza.vivencia_shares set position = pos where vivencia_id = v and email = biodanza.jwt_email() and biodanza.is_allowed() $$;

-- somebody a vivencia was shared with can take themselves off it (an owner does that for others through the table's own policy)
create or replace function biodanza.leave_vivencia(v uuid) returns void
  language sql security definer set search_path = biodanza, public as $$
  delete from biodanza.vivencia_shares where vivencia_id = v and email = biodanza.jwt_email() and biodanza.is_allowed() $$;
revoke all on function biodanza.leave_vivencia(uuid) from public, anon;
grant execute on function biodanza.leave_vivencia(uuid) to authenticated;

-- a share only goes to an account that is on the allowlist
create or replace function biodanza.share_check() returns trigger
  language plpgsql security definer set search_path = biodanza, public as $$
begin
  if not exists (select 1 from biodanza.allowed where email = new.email) then raise exception 'not_allowed_account'; end if;
  return new;
end $$;
drop trigger if exists share_check on biodanza.vivencia_shares;
create trigger share_check before insert or update on biodanza.vivencia_shares for each row execute function biodanza.share_check();

drop policy if exists vivencias_read on biodanza.vivencias;
create policy vivencias_read on biodanza.vivencias for select to authenticated using (biodanza.can_view(id));
drop policy if exists vivencias_update on biodanza.vivencias;
create policy vivencias_update on biodanza.vivencias for update to authenticated using (biodanza.can_edit(id)) with check (biodanza.can_edit(id));
-- delete stays with the owners (vivencias_delete uses owns())

drop policy if exists vivencia_owners_read on biodanza.vivencia_owners;
create policy vivencia_owners_read on biodanza.vivencia_owners for select to authenticated using (biodanza.owns(vivencia_id) or user_id = auth.uid());

drop policy if exists vivencia_shares_read on biodanza.vivencia_shares;
create policy vivencia_shares_read on biodanza.vivencia_shares for select to authenticated using (biodanza.owns(vivencia_id) or email = biodanza.jwt_email());
drop policy if exists vivencia_shares_write on biodanza.vivencia_shares;
create policy vivencia_shares_write on biodanza.vivencia_shares for all to authenticated using (biodanza.owns(vivencia_id)) with check (biodanza.owns(vivencia_id));

drop policy if exists vivencia_items_all on biodanza.vivencia_items;
drop policy if exists vivencia_items_read on biodanza.vivencia_items;
create policy vivencia_items_read on biodanza.vivencia_items for select to authenticated using (biodanza.can_view(vivencia_id));
drop policy if exists vivencia_items_write on biodanza.vivencia_items;
create policy vivencia_items_write on biodanza.vivencia_items for all to authenticated using (biodanza.can_edit(vivencia_id)) with check (biodanza.can_edit(vivencia_id));

grant select, insert, update, delete on biodanza.vivencia_shares to authenticated, service_role;
grant execute on all functions in schema biodanza to authenticated, service_role;
revoke execute on all functions in schema biodanza from anon;

-- ---------- who guides an exercise (optional, any number of people), when a vivencia has more than two editors ----------
-- The people to choose from are the vivencia's members: its owners and the accounts shared with edit rights.
create or replace function biodanza.vivencia_members(v uuid) returns table (email text, note text, role text)
  language sql stable security definer set search_path = biodanza, public as $$
  select lower(u.email)::text, coalesce(a.note, '')::text, 'owner'::text
    from biodanza.vivencia_owners o join auth.users u on u.id = o.user_id left join biodanza.allowed a on a.email = lower(u.email)
   where o.vivencia_id = v and biodanza.can_view(v)
  union all
  select s.email, coalesce(a.note, '')::text, 'edit'::text
    from biodanza.vivencia_shares s left join biodanza.allowed a on a.email = s.email
   where s.vivencia_id = v and s.role = 'edit' and biodanza.can_view(v) $$;

create table if not exists biodanza.vivencia_item_facilitators (
  item_id uuid not null references biodanza.vivencia_items(id) on delete cascade,
  email   text not null check (email = lower(email)),
  primary key (item_id, email)
);
alter table biodanza.vivencia_item_facilitators enable row level security;
drop policy if exists item_fac_read on biodanza.vivencia_item_facilitators;
create policy item_fac_read on biodanza.vivencia_item_facilitators for select to authenticated
  using (exists (select 1 from biodanza.vivencia_items i where i.id = item_id and biodanza.can_view(i.vivencia_id)));
drop policy if exists item_fac_write on biodanza.vivencia_item_facilitators;
create policy item_fac_write on biodanza.vivencia_item_facilitators for all to authenticated
  using (exists (select 1 from biodanza.vivencia_items i where i.id = item_id and biodanza.can_edit(i.vivencia_id)))
  with check (exists (select 1 from biodanza.vivencia_items i where i.id = item_id and biodanza.can_edit(i.vivencia_id)
                      and exists (select 1 from biodanza.vivencia_members(i.vivencia_id) m where m.email = vivencia_item_facilitators.email)));
grant select, insert, update, delete on biodanza.vivencia_item_facilitators to authenticated, service_role;
grant execute on all functions in schema biodanza to authenticated, service_role;
revoke execute on all functions in schema biodanza from anon;

-- THE MUSIC FILES (2026-11-17). The songs of the catalog now have files, kept in a
-- PRIVATE R2 bucket (biodanza-audio) and served only by the Worker at
-- /biodanza/audio/<object> to a signed-in account on the allowlist.
--
-- `music_files` is the index of what is in the bucket: one row per FILE, so a song
-- that several catalog rows name (the same song in two collections) is stored once.
-- `music.audio_object` points a catalog row at its file; no file means the app shows
-- the YouTube button, as before. `in_catalog` is false for a file the catalogs do not
-- list: the app shows it among "other music", with a tag.
create table if not exists biodanza.music_files (
  object     text primary key,                 -- random name in the bucket, with its extension
  code       text not null default '',         -- the catalog code (BA01-06, IBF17-11, BsAs 36.04), when it has one
  collection text not null default '',
  format     text not null,                    -- flac, mp3, m4a, wav, aiff
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);
alter table biodanza.music add column if not exists audio_object text references biodanza.music_files(object) on delete set null;
alter table biodanza.music add column if not exists in_catalog boolean not null default true;
create index if not exists music_audio_idx on biodanza.music (audio_object) where audio_object is not null;
alter table biodanza.music_files enable row level security;
drop policy if exists music_files_read on biodanza.music_files;
create policy music_files_read on biodanza.music_files for select to authenticated using (biodanza.is_allowed());
drop policy if exists music_files_write on biodanza.music_files;
create policy music_files_write on biodanza.music_files for all to authenticated
  using (biodanza.is_admin()) with check (biodanza.is_admin());
grant select, insert, update, delete on biodanza.music_files to authenticated, service_role;
-- the songs a facilitator loved: each person's own list, nobody else sees it
create table if not exists biodanza.song_likes (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  music_id   uuid not null references biodanza.music(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, music_id)
);
alter table biodanza.song_likes enable row level security;
drop policy if exists song_likes_read on biodanza.song_likes;
create policy song_likes_read on biodanza.song_likes for select to authenticated using (user_id = auth.uid());
drop policy if exists song_likes_write on biodanza.song_likes;
create policy song_likes_write on biodanza.song_likes for all to authenticated
  using (user_id = auth.uid() and biodanza.is_allowed()) with check (user_id = auth.uid() and biodanza.is_allowed());
grant select, insert, update, delete on biodanza.song_likes to authenticated, service_role;

-- the exercises a facilitator loved: each person's own list, nobody else sees it
create table if not exists biodanza.exercise_likes (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exercise_id uuid not null references biodanza.exercises(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
alter table biodanza.exercise_likes enable row level security;
drop policy if exists exercise_likes_read on biodanza.exercise_likes;
create policy exercise_likes_read on biodanza.exercise_likes for select to authenticated using (user_id = auth.uid());
drop policy if exists exercise_likes_write on biodanza.exercise_likes;
create policy exercise_likes_write on biodanza.exercise_likes for all to authenticated
  using (user_id = auth.uid() and biodanza.is_allowed()) with check (user_id = auth.uid() and biodanza.is_allowed());
grant select, insert, update, delete on biodanza.exercise_likes to authenticated, service_role;

-- the vivencias a facilitator loved: each person's own list, nobody else sees it
create table if not exists biodanza.vivencia_likes (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vivencia_id uuid not null references biodanza.vivencias(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, vivencia_id)
);
alter table biodanza.vivencia_likes enable row level security;
drop policy if exists vivencia_likes_read on biodanza.vivencia_likes;
create policy vivencia_likes_read on biodanza.vivencia_likes for select to authenticated using (user_id = auth.uid());
drop policy if exists vivencia_likes_write on biodanza.vivencia_likes;
create policy vivencia_likes_write on biodanza.vivencia_likes for all to authenticated
  using (user_id = auth.uid() and biodanza.is_allowed()) with check (user_id = auth.uid() and biodanza.is_allowed());
grant select, insert, update, delete on biodanza.vivencia_likes to authenticated, service_role;

-- ---------- the raw material of the catalogs, and the texts per language ----------
-- exercises.raw_sources keeps EVERYTHING the catalogs say about an exercise, as it was written, so a new analysis never goes back to the PDFs:
-- a list of { catalog, lang, title, fields: { <the catalog's own label>: <its text> } }, one entry per catalog and language. An exercise that
-- appears in several catalogs carries the entries of all of them.
alter table biodanza.exercises add column if not exists raw_sources jsonb not null default '[]'::jsonb;

-- exercise_texts: one row per exercise and language. lang says which language it is; source says whether it is the catalog's own wording
-- in that language ('catalog' = original) or a translation made for the app ('translation'). Hebrew always exists. level and curve are
-- fields of their own, never part of poetics or guidance: the group level the exercise is for, and its place on the session curve.
alter table biodanza.exercise_texts add column if not exists level text not null default '';
alter table biodanza.exercise_texts add column if not exists curve text not null default '';

-- where a level or a curve position comes from: 'catalog' (the catalog states it for this exercise), 'text' (the exercise's own text states it),
-- 'inferred' (assigned from the exercise's nature and its place in the method; shown as a draft until a person checks it). Empty = no value.
alter table biodanza.exercise_texts add column if not exists level_basis text not null default '';
alter table biodanza.exercise_texts add column if not exists curve_basis text not null default '';

-- what the catalog filters use, derived from the texts above (so a filter never parses free text in the browser):
-- phase_keys: every phase the curve text names ('opening'..'closing'); level_keys: 'all' (every group, beginners), 'exp' (groups with some months of
-- experience, orientation groups), 'deep' (deepening and radicalization groups, schools, advanced). An exercise can have several.
alter table biodanza.exercises add column if not exists phase_keys text[] not null default '{}';
alter table biodanza.exercises add column if not exists level_keys text[] not null default '{}';

-- ---------- the index of group levels ----------
-- An ordered index, from the easiest group to the most experienced. Every catalog exercise is assigned ONE level: the lowest group level it
-- suits. exercise_texts.level keeps the wording shown (the catalog's own detail when it has one); level_key is what filters and sorts use.
create table if not exists biodanza.levels (
  key         text primary key,
  rank        int  not null unique,
  name_he     text not null,
  description text not null default ''
);
insert into biodanza.levels (key, rank, name_he, description) values
  ('all',   1, 'מתחילים (מתאים לכל הקבוצות)',                   'לא דורש ניסיון: פשוט, בטוח, חשיפה רגשית נמוכה. מעגלי פתיחה, הליכות פשוטות, ריקודים קצביים בסיסיים, משחקים קלים.'),
  ('exp3',  2, 'לקבוצות עם ניסיון של כמה חודשים',      'דורש מעט אמון בקבוצה: מגע בזוגות, ליטופים, מבטים, מפגשים, חשיפה רגשית מתונה. קבוצות התמצאות אחרי שלושה חודשים בערך.'),
  ('exp6',  3, 'לקבוצות עם ניסיון של חצי שנה ויותר',   'דורש קבוצה מגובשת: עומק חיבתי או רגרסיבי, קן קבוצתי, עוצמה והבעה חזקות, תנוחות מכוננות מורכבות.'),
  ('deep',  4, 'לקבוצות העמקה ומתקדמות',               'קבוצות העמקה והקצנה של חוויות ובתי ספר, שנה ויותר: חוויות עזות, טקסים, פרויקט המינוטאור, מיניות, חשיפה רגשית גבוהה.')
on conflict (key) do update set rank = excluded.rank, name_he = excluded.name_he, description = excluded.description;
alter table biodanza.levels enable row level security;
drop policy if exists levels_read on biodanza.levels;
create policy levels_read on biodanza.levels for select to authenticated using (biodanza.is_allowed());
grant select on biodanza.levels to authenticated;
alter table biodanza.exercises add column if not exists level_key text references biodanza.levels(key);

-- every way the catalogs write a phase, so any text that names one maps to the same phase and the same Hebrew name (phases.name_he):
-- "Phase II - Adrenergic" (with any kind of dash), "שלב III, גשר ומעבר", "Transition" and so on. The curve text of an exercise uses name_he.
alter table biodanza.phases add column if not exists aliases text[] not null default '{}';
update biodanza.phases set aliases = case key
  when 'opening'    then array['Phase I - Start', 'Phase I', 'Start', 'Opening', 'שלב I', 'I, התחלה', 'שלב I, פתיחה', 'פתיחה']
  when 'activation' then array['Phase II - Adrenergic', 'Phase II', 'Adrenergic', 'Activation', 'שלב II', 'II, אדרנרגי', 'שלב II, אדרנרגי', 'אדרנרגי']
  when 'bridge'     then array['Phase III - Transition', 'Phase III', 'Transition', 'Bridge', 'שלב III', 'III, מעבר', 'שלב III, גשר ומעבר', 'מעבר']
  when 'regression' then array['Phase IV - Cholinergic', 'Phase IV', 'Cholinergic', 'Regression', 'שלב IV', 'IV, כולינרגי', 'שלב IV, כולינרגי', 'כולינרגי']
  when 'closing'    then array['Phase V - Activation and Final', 'Activation and Final', 'Phase V - Closing', 'Phase V', 'Closing', 'Final activation', 'שלב V', 'V, סיום', 'שלב V, אקטיבציה וסיום', 'סיום']
end;

-- ATTACHING A FILE (2026-11-18). An allowed account uploads a file for a catalog song that has none yet (the app showed its YouTube
-- button): the Worker puts the file in the bucket, this function records it. It never replaces a file that is there.
create or replace function biodanza.attach_audio(p_music uuid, p_object text, p_format text, p_size bigint) returns void
language plpgsql security definer set search_path = biodanza, public as $$
declare m biodanza.music%rowtype;
begin
  if not biodanza.is_allowed() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_object !~ '^[a-f0-9]{32}\.(mp3|flac|wav|aiff|aif|m4a)$' then raise exception 'bad object'; end if;
  select * into m from biodanza.music where id = p_music and owner_id is null and in_catalog and audio_object is null for update;
  if not found then raise exception 'song has a file already or is not a catalog song'; end if;
  insert into biodanza.music_files (object, code, collection, format, size_bytes) values (p_object, '', m.collection, p_format, coalesce(p_size, 0)) on conflict (object) do nothing;
  update biodanza.music set audio_object = p_object where id = p_music;
end $$;
revoke all on function biodanza.attach_audio(uuid, text, text, bigint) from public, anon;
grant execute on function biodanza.attach_audio(uuid, text, text, bigint) to authenticated;

-- Curve positions assigned by inference are NOT shown: a blind test against the 90 exercises whose catalog states a phase got only 49% right
-- (56% with the catalog's own examples), so the guess is kept apart. phase_hint / phase_keys hold only what the catalog, the exercise's text or a
-- person (curve_basis catalog, text, manual) states; the inferred phase waits in phase_guess / phase_keys_guess, as a suggestion for whoever sets it.
alter table biodanza.exercises add column if not exists phase_guess text;
alter table biodanza.exercises add column if not exists phase_keys_guess text[] not null default '{}';
update biodanza.exercises e set phase_guess = e.phase_hint, phase_keys_guess = e.phase_keys, phase_hint = null, phase_keys = '{}'
  from biodanza.exercise_texts t where t.exercise_id = e.id and t.lang = 'he' and t.curve_basis = 'inferred' and e.owner_id is null and e.phase_guess is null;

-- a sixth place on the curve, for every exercise nobody has placed yet (no phase from the catalog, its text, or a person): to be set by hand.
insert into biodanza.phases (key, name_he, catalog_phase, sort, aliases) values ('unclassified', 'לא מסווג', '', 6, array['Unclassified', 'לא מסווג'])
on conflict (key) do update set name_he = excluded.name_he, sort = excluded.sort, aliases = excluded.aliases;
update biodanza.exercises set phase_hint = 'unclassified', phase_keys = array['unclassified'] where owner_id is null and phase_hint is null and cardinality(phase_keys) = 0;
update biodanza.exercise_texts t set curve = 'לא מסווג', curve_basis = '' from biodanza.exercises e
  where t.exercise_id = e.id and t.lang = 'he' and e.owner_id is null and e.phase_hint = 'unclassified' and t.curve_basis in ('inferred', '');

-- "unclassified" for the line and the category too: every exercise the catalogs do not place gets it, to be set by hand.
-- Lines: an exercise with no line at all. Categories: the 2014 and 2018 exercises that only sat in the catch-all "Danses Specifiques" (the 2012
-- catalog's own section of that name keeps its exercises).
insert into biodanza.lines (key, name_he, sort) values ('unclassified', 'לא מסווג', 6) on conflict (key) do update set name_he = excluded.name_he, sort = excluded.sort;
insert into biodanza.exercise_lines (exercise_id, line_key, main)
  select e.id, 'unclassified', true from biodanza.exercises e where e.owner_id is null and not exists (select 1 from biodanza.exercise_lines l where l.exercise_id = e.id)
  on conflict do nothing;
-- (neutralized 2026-11-19: the 'unclassified' category was deleted with the old catalog; do not re-create it or re-point old rows at it)
-- insert into biodanza.categories (key, name_he, sort) values ('unclassified', 'לא מסווג', 99) on conflict (key) do update set name_he = excluded.name_he, sort = excluded.sort;
-- update biodanza.exercises set category = 'unclassified' where owner_id is null and category = 'Danses Specifiques' and source in ('catalog2014', 'cimeb2018');

-- ---------- permission levels: member, admin, super admin ----------
-- member: enters and builds vivencias. admin: also manages the allowlist (members only). super admin: also sets who is an admin or a super admin, and
-- is the ONLY one who edits the group level and the place on the curve of a catalog exercise. A request from the server side (no signed-in user,
-- like scripts/sql.mjs) is not restricted.
alter table biodanza.allowed add column if not exists is_super boolean not null default false;
update biodanza.allowed set is_super = true, is_admin = true where email = 'ofir.aviram@gmail.com';
alter table biodanza.allowed drop constraint if exists allowed_super_is_admin;
alter table biodanza.allowed add constraint allowed_super_is_admin check (not is_super or is_admin);

create or replace function biodanza.is_super() returns boolean
  language sql stable security definer set search_path = biodanza, public as
  $$ select exists (select 1 from biodanza.allowed where email = biodanza.jwt_email() and is_super) $$;

create or replace function biodanza.me() returns jsonb
  language sql stable security definer set search_path = biodanza, public as
  $$ select jsonb_build_object('email', biodanza.jwt_email(), 'allowed', biodanza.is_allowed(), 'admin', biodanza.is_admin(), 'super', biodanza.is_super()) $$;

create or replace function biodanza.allowed_guard() returns trigger
  language plpgsql security definer set search_path = biodanza, public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if biodanza.is_super() then
    if (tg_op = 'DELETE' and old.is_super) or (tg_op = 'UPDATE' and old.is_super and not new.is_super) then
      if (select count(*) from biodanza.allowed where is_super) <= 1 then raise exception 'last_super'; end if;
    end if;
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' and (new.is_admin or new.is_super) then raise exception 'only_super'; end if;
  if tg_op = 'UPDATE' and (old.is_admin or old.is_super or new.is_admin <> old.is_admin or new.is_super <> old.is_super) then raise exception 'only_super'; end if;
  if tg_op = 'DELETE' and (old.is_admin or old.is_super) then raise exception 'only_super'; end if;
  return coalesce(new, old);
end $$;
drop trigger if exists allowed_guard on biodanza.allowed;
create trigger allowed_guard before insert or update or delete on biodanza.allowed for each row execute function biodanza.allowed_guard();

create or replace function biodanza.exercise_placement_guard() returns trigger
  language plpgsql security definer set search_path = biodanza, public as $$
begin
  if auth.uid() is null or new.owner_id is not null or biodanza.is_super() then return new; end if;
  if (new.level_key, new.phase_hint, new.phase_keys) is distinct from (old.level_key, old.phase_hint, old.phase_keys) then raise exception 'only_super'; end if;
  return new;
end $$;
drop trigger if exists exercise_placement_guard on biodanza.exercises;
create trigger exercise_placement_guard before update on biodanza.exercises for each row execute function biodanza.exercise_placement_guard();

create or replace function biodanza.text_placement_guard() returns trigger
  language plpgsql security definer set search_path = biodanza, public as $$
declare o uuid; own boolean;
begin
  if auth.uid() is null or biodanza.is_super() then return new; end if;
  select (owner_id is not null) into own from biodanza.exercises where id = new.exercise_id;
  if coalesce(own, true) then return new; end if;
  if tg_op = 'INSERT' then
    if new.level <> '' or new.curve <> '' then raise exception 'only_super'; end if;
  elsif (new.level, new.curve, new.level_basis, new.curve_basis) is distinct from (old.level, old.curve, old.level_basis, old.curve_basis) then raise exception 'only_super'; end if;
  return new;
end $$;
drop trigger if exists text_placement_guard on biodanza.exercise_texts;
create trigger text_placement_guard before insert or update on biodanza.exercise_texts for each row execute function biodanza.text_placement_guard();

-- the super admin sets the group level and the place on the curve (a main phase and, optionally, a second one) of a catalog exercise
create or replace function biodanza.set_exercise_placement(ex uuid, lvl text, main text, second text default '') returns void
  language plpgsql security definer set search_path = biodanza, public as $$
declare ltxt text := ''; ctxt text; keys text[];
begin
  if not biodanza.is_super() then raise exception 'only_super'; end if;
  if lvl is not null and lvl <> '' then select name_he into ltxt from biodanza.levels where key = lvl; if ltxt is null then raise exception 'bad_level'; end if; else lvl := null; end if;
  if main is null or not exists (select 1 from biodanza.phases where key = main) then raise exception 'bad_phase'; end if;
  if second is null or second = '' or second = main or second = 'unclassified' or not exists (select 1 from biodanza.phases where key = second) then second := ''; end if;
  keys := case when second = '' then array[main] else array[main, second] end;
  select name_he || case when second <> '' then ', או ' || (select name_he from biodanza.phases where key = second) else '' end into ctxt from biodanza.phases where key = main;
  update biodanza.exercises set level_key = lvl, phase_hint = main, phase_keys = keys, updated_at = now() where id = ex and owner_id is null;
  if not found then raise exception 'not_a_catalog_exercise'; end if;
  insert into biodanza.exercise_texts (exercise_id, lang, source) values (ex, 'he', 'draft') on conflict do nothing;
  update biodanza.exercise_texts set level = coalesce(ltxt, ''), level_basis = case when lvl is null then '' else 'manual' end,
    curve = ctxt, curve_basis = case when main = 'unclassified' then '' else 'manual' end, updated_at = now() where exercise_id = ex and lang = 'he';
end $$;
grant execute on function biodanza.set_exercise_placement(uuid, text, text, text) to authenticated;

-- the super admin changes an account's permission level
create or replace function biodanza.set_member_role(target text, new_role text) returns void
  language plpgsql security definer set search_path = biodanza, public as $$
begin
  if not biodanza.is_super() then raise exception 'only_super'; end if;
  if new_role not in ('member', 'admin', 'super') then raise exception 'bad_role'; end if;
  update biodanza.allowed set is_admin = new_role in ('admin', 'super'), is_super = (new_role = 'super') where email = lower(target);
  if not found then raise exception 'no_such_account'; end if;
end $$;
grant execute on function biodanza.set_member_role(text, text) to authenticated;
-- SONGS A FACILITATOR UPLOADS BY HAND (2026-11-18), with no connection to the catalog.
-- The file goes into the bucket through the Worker (PUT /biodanza/audio/upload), this function records it as a song of the
-- uploader's own (owner_id = them, in_catalog = false). The uploader can rename it and change the performer (music_write already
-- lets an owner change their own rows). Everyone who can see a vivencia that uses the song can read the song's row, so a shared
-- vivencia plays for all of its members.
drop policy if exists music_read on biodanza.music;
create policy music_read on biodanza.music for select to authenticated
  using (biodanza.is_allowed() and (owner_id is null or owner_id = auth.uid()
    or exists (select 1 from biodanza.vivencia_items i where i.music_id = music.id and biodanza.can_view(i.vivencia_id))));

create or replace function biodanza.add_upload(p_object text, p_format text, p_size bigint, p_title text, p_artist text) returns uuid
language plpgsql security definer set search_path = biodanza, public as $$
declare t text := nullif(btrim(coalesce(p_title, '')), '');
  a text := btrim(coalesce(p_artist, ''));
  id uuid;
begin
  if not biodanza.is_allowed() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_object !~ '^[a-f0-9]{32}\.(mp3|flac|wav|aiff|aif|m4a)$' then raise exception 'bad object'; end if;
  if t is null then t := 'ללא שם'; end if;
  insert into biodanza.music_files (object, code, collection, format, size_bytes) values (p_object, '', '', p_format, coalesce(p_size, 0)) on conflict (object) do nothing;
  insert into biodanza.music (owner_id, name, title, artist, in_catalog, audio_object)
    values (auth.uid(), t || case when a <> '' then ', ' || a else '' end, t, a, false, p_object) returning biodanza.music.id into id;
  return id;
end $$;
revoke all on function biodanza.add_upload(text, text, bigint, text, text) from public, anon;
grant execute on function biodanza.add_upload(text, text, bigint, text, text) to authenticated;
-- A song uploaded while working on a vivencia belongs to that vivencia too: everyone who can see it sees the song in "other music"
-- there and can play it, and whoever can edit the vivencia can rename it.
alter table biodanza.music add column if not exists vivencia_id uuid references biodanza.vivencias(id) on delete set null;
create index if not exists music_viv_idx on biodanza.music (vivencia_id) where vivencia_id is not null;
drop policy if exists music_read on biodanza.music;
create policy music_read on biodanza.music for select to authenticated
  using (biodanza.is_allowed() and (owner_id is null or owner_id = auth.uid()
    or (vivencia_id is not null and biodanza.can_view(vivencia_id))
    or exists (select 1 from biodanza.vivencia_items i where i.music_id = music.id and biodanza.can_view(i.vivencia_id))));
drop policy if exists music_update_viv on biodanza.music;
create policy music_update_viv on biodanza.music for update to authenticated
  using (biodanza.is_allowed() and not in_catalog and vivencia_id is not null and biodanza.can_edit(vivencia_id))
  with check (biodanza.is_allowed() and not in_catalog and vivencia_id is not null and biodanza.can_edit(vivencia_id));
drop function if exists biodanza.add_upload(text, text, bigint, text, text);
create or replace function biodanza.add_upload(p_object text, p_format text, p_size bigint, p_title text, p_artist text, p_vivencia uuid default null) returns uuid
language plpgsql security definer set search_path = biodanza, public as $$
declare t text := nullif(btrim(coalesce(p_title, '')), '');
  a text := btrim(coalesce(p_artist, ''));
  id uuid;
begin
  if not biodanza.is_allowed() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_object !~ '^[a-f0-9]{32}\.(mp3|flac|wav|aiff|aif|m4a)$' then raise exception 'bad object'; end if;
  if p_vivencia is not null and not biodanza.can_edit(p_vivencia) then raise exception 'not allowed' using errcode = '42501'; end if;
  if t is null then t := 'ללא שם'; end if;
  insert into biodanza.music_files (object, code, collection, format, size_bytes) values (p_object, '', '', p_format, coalesce(p_size, 0)) on conflict (object) do nothing;
  insert into biodanza.music (owner_id, name, title, artist, in_catalog, audio_object, vivencia_id)
    values (auth.uid(), t || case when a <> '' then ', ' || a else '' end, t, a, false, p_object, p_vivencia) returning biodanza.music.id into id;
  return id;
end $$;
revoke all on function biodanza.add_upload(text, text, bigint, text, text, uuid) from public, anon;
grant execute on function biodanza.add_upload(text, text, bigint, text, text, uuid) to authenticated;

-- ---------- the catalog is cut loose from the vivencias (2026-11-19, owner's law) ----------
-- An item keeps its own copy of name, poetics and guidance (the app writes it when the exercise is placed). A catalog change or deletion never reaches a vivencia,
-- and a catalog song or file a vivencia uses can not be deleted.
-- deleting a catalog exercise leaves the item (with its own text) instead of being blocked
alter table biodanza.vivencia_items drop constraint vivencia_items_exercise_id_fkey;
alter table biodanza.vivencia_items add constraint vivencia_items_exercise_id_fkey foreign key (exercise_id) references biodanza.exercises(id) on delete set null;
-- a catalog song or file that a vivencia uses can not be deleted from the catalog side
create or replace function biodanza.music_in_use_guard() returns trigger language plpgsql as $f$
begin
  if old.vivencia_id is null and exists (select 1 from biodanza.vivencia_items where music_id = old.id) then
    raise exception 'song is used by a vivencia' using errcode = 'P0001';
  end if;
  return old;
end $f$;
drop trigger if exists music_in_use_guard on biodanza.music;
create trigger music_in_use_guard before delete on biodanza.music for each row execute function biodanza.music_in_use_guard();
create or replace function biodanza.file_in_use_guard() returns trigger language plpgsql as $f$
begin
  if exists (select 1 from biodanza.music m join biodanza.vivencia_items vi on vi.music_id = m.id where m.audio_object = old.object) then
    raise exception 'file is used by a vivencia' using errcode = 'P0001';
  end if;
  return old;
end $f$;
drop trigger if exists file_in_use_guard on biodanza.music_files;
create trigger file_in_use_guard before delete on biodanza.music_files for each row execute function biodanza.file_in_use_guard();
-- MUSIC OPTIONS OF AN EXERCISE IN A VIVENCIA (2026-11-19). While a vivencia is built the facilitator is torn between a few songs: each song picked
-- for an exercise stays here as an option, and ONE of them is the chosen one (vivencia_items.music_id) that plays. The chosen song is not
-- required to be here (older exercises have only music_id); whoever may see the vivencia sees the options, whoever may edit it changes them.
create table if not exists biodanza.item_music_options (
  item_id    uuid not null references biodanza.vivencia_items(id) on delete cascade,
  music_id   uuid not null references biodanza.music(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, music_id)
);
alter table biodanza.item_music_options enable row level security;
drop policy if exists item_opts_read on biodanza.item_music_options;
create policy item_opts_read on biodanza.item_music_options for select to authenticated
  using (exists (select 1 from biodanza.vivencia_items i where i.id = item_id and biodanza.can_view(i.vivencia_id)));
drop policy if exists item_opts_write on biodanza.item_music_options;
create policy item_opts_write on biodanza.item_music_options for all to authenticated
  using (exists (select 1 from biodanza.vivencia_items i where i.id = item_id and biodanza.can_edit(i.vivencia_id)))
  with check (exists (select 1 from biodanza.vivencia_items i where i.id = item_id and biodanza.can_edit(i.vivencia_id)));
grant select, insert, update, delete on biodanza.item_music_options to authenticated, service_role;
-- THE LISTENING HISTORY (2026-11-19): the songs a person started to play, one line per song and person (the last time it started). Each person sees
-- and changes only their own. The song is named by its file in the bucket (what the player knows), with the name and performer as they were shown.
create table if not exists biodanza.listen_history (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  audio_object text not null,
  title        text not null default '',
  artist       text not null default '',
  played_at    timestamptz not null default now(),
  primary key (user_id, audio_object)
);
create index if not exists listen_history_recent_idx on biodanza.listen_history (user_id, played_at desc);
alter table biodanza.listen_history enable row level security;
drop policy if exists listen_history_own on biodanza.listen_history;
create policy listen_history_own on biodanza.listen_history for all to authenticated
  using (user_id = auth.uid() and biodanza.is_allowed()) with check (user_id = auth.uid() and biodanza.is_allowed());
grant select, insert, update, delete on biodanza.listen_history to authenticated, service_role;
