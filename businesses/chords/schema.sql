-- ==========================================================================
-- Chords — the Supabase schema.
--
-- Run this once, whole, in the Supabase SQL editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run).
--
-- One table. Everyone may read it, only a signed-in user may change it, and
-- that rule is enforced by the database rather than by the browser: the anon
-- key that ships in the page can select and nothing else.
-- ==========================================================================

create table if not exists public.songs (
  id          uuid primary key default gen_random_uuid(),

  -- the URL: floa.co.il/chords/<slug>. Hebrew is fine here.
  slug        text not null unique,

  title       text not null,

  -- Who made it, which is two different people as often as it is one. The
  -- performer is deliberately not among them: a song is one song however many
  -- people have recorded it.
  lyrics_by   text not null default '',
  music_by    text not null default '',

  -- Kept, read by nothing. `artist` held a performer and `song_key` a key, and
  -- both were dropped from the app rather than from the table, because a
  -- column that is not read costs nothing and a column that is dropped takes
  -- whatever was typed into it with it.
  artist      text not null default '',
  song_key    text not null default '',

  -- 'rtl' for a Hebrew song, 'ltr' for an English one. Per song, because a
  -- single index holds both.
  dir         text not null default 'rtl' check (dir in ('rtl', 'ltr')),

  -- The song itself, as ONE piece of text, in the ChordPro convention:
  --
  --   "ש[Am]לום לך אדו[G]ני\nו[F]איך היה היום\n\n{פזמון}\n..."
  --
  -- A CHORD SITS ON A CHARACTER, and its brackets go immediately AFTER that
  -- character: ABC[Am]DEF means the Am is on the C. Not on the seam between
  -- two characters. A printed sheet puts the symbol over a letter and marks
  -- that letter with a tick, so a position naming a gap was describing the
  -- drawing rather than the song.
  --
  -- A heading is a line in braces; a newline is a newline.
  --
  -- Stored this way rather than as text plus a list of offsets because then
  -- the link between a chord and its syllable is not a number anyone has to
  -- keep true: the chord is INSIDE the words. Type a space before a word and
  -- the chord moves with it because it cannot do anything else. It is also
  -- readable straight out of the database, and pastes into any other program
  -- that speaks ChordPro.
  --
  -- The column is jsonb and holds a JSON string. Songs written before this,
  -- as an array of line objects, are still read correctly by the app.
  lines       jsonb not null default '""'::jsonb,

  -- 'ready' unless a picture of it is waiting to be read or being read.
  --
  -- Reading a photo takes a minute or two and it happens in the Worker, not in
  -- the browser, so the row is created first and filled in when the reading
  -- lands. That is what lets you close the tab and come back to a finished
  -- song, and what makes a half-read song visible instead of invisible.
  status      text not null default 'ready',
  status_note text not null default '',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- added after the first version of this file; safe to re-run
alter table public.songs add column if not exists status      text not null default 'ready';
alter table public.songs add column if not exists status_note text not null default '';
alter table public.songs add column if not exists lyrics_by   text not null default '';
alter table public.songs add column if not exists music_by    text not null default '';

-- The price of a reading used to live here, in two columns on the song, and it
-- lives in a table of its own now: a column on a row somebody may read is a
-- column they may read, and row level security has nothing to say about it.
-- The move, the copy and the drop are all at the BOTTOM of this file, in one
-- block, in that order. They were not, once, and the drop ran first.

-- A song that came out of a machine is a song nobody has read yet. True from
-- the moment the Worker saves a reading, false the moment a person says they
-- have looked at it, and never true for a song typed by hand: there is nothing
-- to check a song against when the person who typed it is the source.
--
-- Not backfilled. Songs read before this column existed have been lived with
-- for a while already, and labelling them all "unchecked" one morning would
-- say something about them that nobody knows to be true.
alter table public.songs add column if not exists review      boolean not null default false;

-- Not finished, and said so by the person writing it. The other label is the
-- machine's ("nobody has checked this"); this one is the author's ("I am not
-- done with this"), and a song can easily be both. It is set and unset by hand
-- and travels with the song when it is saved, because deciding a song is still
-- a draft is a decision about the song, made while working on it.
alter table public.songs add column if not exists draft       boolean not null default false;

-- Out in the world. The third of the three things an author can say about
-- their own song, after "I am not done" and the silence that means "it is
-- finished": this one is out, other people may have it.
--
-- IT IS ALSO THE ONLY THING THAT MAKES A SONG READABLE BY ANYBODY ELSE (see
-- the read policy below). Not a label about a song, a fact about who can open
-- it, which is why it is a column and not a tag in the browser.
alter table public.songs add column if not exists published   boolean not null default false;

-- WHOSE SONG THIS IS. Filled in by the database from the token the request
-- carried, never by the browser, so it cannot be claimed: a song belongs to
-- the account that wrote it the moment it is written, and there is no other
-- way to write one.
--
-- The same shape the evenings have had from the start, and for the same
-- reason. The difference is what the two do with it: an evening is its
-- owner's and nobody else's ever, and a song is its owner's until they
-- publish it.
alter table public.songs add column if not exists owner uuid
  default auth.uid() references auth.users (id) on delete cascade;

-- A song written before there was an owner has none, and a row whose owner is
-- null belongs to nobody: after the policies below it would be invisible to
-- everyone including the person who wrote it, and unpublished songs are most
-- of the library. So it goes to the account that has been here longest, which
-- in a project with one account is that account. This runs BEFORE the policy
-- for exactly that reason.
update public.songs
   set owner = (select id from auth.users order by created_at limit 1)
 where owner is null;

-- who owns what, asked on every read
create index if not exists songs_owner_idx on public.songs (owner);

-- WHAT KIND OF SONG IT IS, in the words of whoever keeps the library. Several
-- at once, because a song is a circle song and a prayer and a lullaby and
-- there is no sense in making somebody pick one.
--
-- Free text and not a list to choose from. The vocabulary of a library is
-- something its keeper discovers over a year of adding songs to it, and a
-- fixed list would be a guess made on the first day; what the app does instead
-- is offer back every style already used, so the second song of a kind is
-- named the same as the first without anybody deciding on the vocabulary.
--
-- An array rather than a table of its own, because a style has nothing to it
-- but its name: there is no fact about "שירי מעגל" that is not a fact about
-- the songs in it.
alter table public.songs add column if not exists styles      text[] not null default '{}';

-- everything in one kind, asked as `styles=cs.{...}`
create index if not exists songs_styles_idx on public.songs using gin (styles);

-- WHEN IT WAS DELETED, because deleting a song does not delete it. A song is
-- an evening's worth of typing and half of them are deleted by somebody
-- meaning to delete the other one; so the row stays exactly as it was and this
-- column is the whole of the difference, and the library reads only the rows
-- where it is null.
--
-- Its ADDRESS goes, though, which is the one thing that cannot be kept: the
-- slug is unique, and a deleted song holding on to its own name is a song
-- nobody can write again under that name. It is moved aside to a string
-- nothing will ever ask for, and a restored song is given a fresh one from its
-- title, the same way a new song gets its first.
alter table public.songs add column if not exists deleted_at  timestamptz;

-- the library asks for the living, newest change first, and that is the index
create index if not exists songs_alive_idx on public.songs (updated_at desc)
  where deleted_at is null;

-- EVERY READING THE SONG HAS HAD, kept side by side.
--
-- A song is read by two different machines that fail in different ways, and
-- the only way to know which to trust on which kind of page is to have both
-- answers and the corrected song beside them. Until now the losing answer was
-- thrown away the moment it lost, so every tuning round started by paying to
-- read the same pages again.
--
--   { measured: "<chordpro>", model: "<chordpro>", agreement: 0.67,
--     kept: "measured" | "model" }
--
-- Null on a song nobody read. Never shown to anybody: this is for measuring
-- the reader, and it is dropped the moment the song is saved by hand, because
-- by then the song IS the answer.
alter table public.songs add column if not exists reads jsonb;

-- Dropped and recreated rather than added, because 'queued' arrived after the
-- first version of this constraint and an "add if it is not there" would leave
-- the old one in place and refuse every queued row.
alter table public.songs drop constraint if exists songs_status_check;
alter table public.songs add constraint songs_status_check
  check (status in ('queued', 'ready', 'reading', 'failed'));

-- the index page sorts by title
create index if not exists songs_title_idx on public.songs (title);

-- updated_at that cannot be forgotten
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists songs_touch_updated_at on public.songs;
create trigger songs_touch_updated_at
  before update on public.songs
  for each row execute function public.touch_updated_at();

-- --------------------------------------------------------------------------
-- Row level security.
--
-- Without this every visitor holding the anon key (which is every visitor,
-- it is printed in the page) could delete the whole library.
--
-- THE LIBRARY USED TO BE PUBLIC AND IT IS NOT ANY MORE. A song is its
-- author's until they publish it: what everybody can read is the published
-- ones, and everything else, the drafts, the half-corrected readings, the
-- ones nobody has checked, is visible to the account that wrote it and to
-- nobody at all besides.
--
-- The old policies are dropped by name and the lines stay here forever. On a
-- project that never had them this does nothing; on the one that did it is
-- the only thing standing between the rule below and an older, more
-- permissive one still sitting underneath it. Postgres ORs its policies
-- together, so a leftover `using (true)` would quietly undo all of this.
-- --------------------------------------------------------------------------
alter table public.songs enable row level security;

drop policy if exists "songs are readable by everyone" on public.songs;
drop policy if exists "signed in users may add songs" on public.songs;
drop policy if exists "signed in users may edit songs" on public.songs;
drop policy if exists "signed in users may delete songs" on public.songs;

-- Anybody at all, signed in or not, and the published ones only. A visitor
-- has no uid, so the second half is false for them and the first is the whole
-- of what they get.
drop policy if exists "published songs are readable by everyone" on public.songs;
create policy "published songs are readable by everyone"
  on public.songs for select
  using (published or owner = auth.uid());

-- And writing is the author's alone. `with check` is what stops a song being
-- written into somebody else's name, or handed to them afterwards.
drop policy if exists "a song is written by its account" on public.songs;
create policy "a song is written by its account"
  on public.songs for insert to authenticated
  with check (owner = auth.uid());

drop policy if exists "a song is edited by its account" on public.songs;
create policy "a song is edited by its account"
  on public.songs for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "a song is deleted by its account" on public.songs;
create policy "a song is deleted by its account"
  on public.songs for delete to authenticated
  using (owner = auth.uid());

-- ==========================================================================
-- Every version of a song that was ever published.
--
-- A row is written by the app the moment "פורסם" is pressed and never touched
-- again: it is what the song WAS at that moment, whole, in the same shape the
-- song itself is kept in. So it is not a diff and not a log of what changed.
-- Reading an old version means opening it, not reconstructing it.
--
-- WHY PUBLISHING AND NOT SAVING. A song saves itself every second while it is
-- being typed, and a history of that is a history of keystrokes: hundreds of
-- rows, no two of them a version of anything. Pressing פורסם is the one moment
-- somebody says the song is finished, so it is the only moment worth keeping.
--
-- The undo inside the editor is a different thing entirely and stays what it
-- is: it lives in the browser, it goes when the tab does, and it is about the
-- last few minutes. This is about the last few months.
--
-- It carries a copy of the words rather than pointing at anything, which is
-- the point: the song moves on and the version does not.
-- ==========================================================================
create table if not exists public.song_versions (
  id         uuid primary key default gen_random_uuid(),

  -- Which song. `on delete cascade` because a version of a song that no longer
  -- exists is not a version of anything, and the songs table already keeps a
  -- deleted song around (deleted_at); only a purge takes both.
  song_id    uuid not null references public.songs (id) on delete cascade,

  -- Whose. Filled in by the database from the token the request carried, never
  -- by the browser, exactly as on the song itself. A HISTORY IS THE AUTHOR'S
  -- AND NOBODY ELSE'S: the published song is what the world gets, and the
  -- drafts it passed through on the way are not part of the offer.
  owner      uuid default auth.uid() references auth.users (id) on delete cascade,

  -- The song as it stood, in the columns it stands in on the songs table and
  -- in the same formats, so restoring is a copy across and not a translation.
  title      text not null default '',
  lyrics_by  text not null default '',
  music_by   text not null default '',
  dir        text not null default 'rtl',
  lines      jsonb not null default '""'::jsonb,
  styles     text[] not null default '{}',

  created_at timestamptz not null default now()
);

-- one song's versions, newest first, which is the only question ever asked
create index if not exists song_versions_song_idx
  on public.song_versions (song_id, created_at desc);

alter table public.song_versions enable row level security;

-- Read by the account that wrote them. Not by a reader of the published song:
-- what was published is one song, and how it got there is the author's own
-- room. Not granted to anon at all, so a visitor is answered as though the
-- table were empty, which for them it is.
drop policy if exists "a history belongs to its author" on public.song_versions;
create policy "a history belongs to its author"
  on public.song_versions for select to authenticated
  using (owner = auth.uid());

drop policy if exists "a version is written by its author" on public.song_versions;
create policy "a version is written by its author"
  on public.song_versions for insert to authenticated
  with check (owner = auth.uid());

-- NO UPDATE POLICY AND NO DELETE POLICY, so there is neither. A version that
-- can be edited is not a record of anything, and one that can be deleted is a
-- history with a hole in it. They go when their song is purged, by the cascade
-- above, and that is the only way out.

-- ==========================================================================
-- Evenings of singing.
--
-- A name, a date, and songs in the order they will be sung. A table of its
-- own rather than a column on a song, because the two do not belong to each
-- other: a song does not know which evenings it is in, and an evening whose
-- song was deleted from the library is still an evening.
--
-- THIS TABLE IS NOT LIKE THE SONGS ONE. The library is public: everyone reads
-- it and a signed-in user writes it. An evening belongs to the account that
-- made it and to nobody else, which is the whole of the rule below: it is
-- read, changed and deleted by its owner alone, and a visitor without an
-- account does not see that it exists.
-- ==========================================================================

create table if not exists public.setlists (
  id          uuid primary key default gen_random_uuid(),

  -- Whose evening. Filled in by the database from the token the request
  -- carried, never by the browser, so it cannot be claimed: an evening is the
  -- account's the moment it is written and there is no other way to write
  -- one. The policy below is one line of arithmetic on this column.
  owner       uuid default auth.uid() references auth.users (id) on delete cascade,

  -- May be empty. An evening usually gets its songs before it gets its name,
  -- and refusing to save one until it is named would mean losing the songs.
  title       text not null default '',

  -- A DAY, not a moment. An evening happens on a date, nobody plans one to
  -- the second, and a timestamp would drag a timezone in behind it.
  event_date  date,

  -- Where. Free text, because the answer is "אצל דנה", "מועדון הזמר" or a
  -- street address depending on the evening, and a form that insisted on one
  -- of them would be wrong about the other two.
  venue       text not null default '',

  -- The songs, in order:  [{"id": "…", "title": "…"}, …]
  --
  -- The id is what a row is drawn from: the title, the credits and the chords
  -- are read live out of the library, so renaming a song renames it wherever
  -- it appears. The title stored beside the id is not a copy of that, it is
  -- what is left when the song itself has been deleted, and "the song that
  -- was here is gone" reads better than a blank line.
  --
  -- An array rather than a row per song with a position column, because the
  -- order IS the point and an array already has one. A column of positions is
  -- a set of numbers somebody has to keep true across every drag.
  songs       jsonb not null default '[]'::jsonb,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- added after the first version of this table; safe to re-run
alter table public.setlists add column if not exists venue text not null default '';
alter table public.setlists add column if not exists owner uuid
  default auth.uid() references auth.users (id) on delete cascade;

-- An evening written before there was an owner has none, and a row whose
-- owner is null is invisible to everybody, because no uid equals null. So it
-- goes to the account that has been here longest, which in a project with one
-- account is that account. This is the difference between an evening kept and
-- an evening lost, and it is why the backfill runs before the policy does.
update public.setlists
   set owner = (select id from auth.users order by created_at limit 1)
 where owner is null;

-- Deliberately not `not null`. The insert policy below already refuses a row
-- whose owner is not the account writing it, and null is not, so the column
-- cannot be left empty by anything that comes through the API. A constraint
-- would only be able to fail this file on a project whose table predates the
-- column and whose users table is empty.

drop trigger if exists setlists_touch_updated_at on public.setlists;
create trigger setlists_touch_updated_at
  before update on public.setlists
  for each row execute function public.touch_updated_at();

alter table public.setlists enable row level security;

-- The first version of this table was public the way the songs are. Those
-- policies are dropped by name and the lines stay here forever: on a project
-- that never had them this does nothing, and on the one that did it is the
-- only thing standing between "an evening belongs to its account" and an
-- older, more permissive rule still sitting underneath it. Postgres ORs its
-- policies together, so a leftover `using (true)` would quietly undo all of
-- this.
drop policy if exists "evenings are readable by everyone" on public.setlists;
drop policy if exists "signed in users may add evenings" on public.setlists;
drop policy if exists "signed in users may edit evenings" on public.setlists;
drop policy if exists "signed in users may delete evenings" on public.setlists;

-- One rule for all four verbs, because there is only one thing to say: an
-- evening is its owner's. `using` decides which rows can be seen, changed and
-- deleted; `with check` decides what may be written, and it is what stops an
-- evening from being handed to somebody else.
--
-- Not granted to anon at all, so a visitor without an account does not read
-- an evening, and a link to one answers as though it were not there. Which it
-- is not, for them.
drop policy if exists "an evening belongs to its account" on public.setlists;
create policy "an evening belongs to its account"
  on public.setlists for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

-- ==========================================================================
-- What the readings cost.
--
-- ONE ACCOUNT PAYS FOR ALL OF THEM, and what they cost is that account's
-- business. It was two columns on the song until the library stopped being
-- public: row level security is about ROWS, so a column on a row somebody is
-- allowed to read is a column they are allowed to read, and there is no
-- policy that can say otherwise. Hiding it in the browser would have hidden
-- it from the page and from nobody else.
--
-- So it is a table, and a table has its own rule. Written by whoever's reading
-- it was, because the bill happens whoever pressed the button and a cost that
-- is refused is a cost nobody ever knows about; read by the one address that
-- gets the invoice.
-- ==========================================================================
create table if not exists public.song_costs (
  song_id    uuid primary key references public.songs (id) on delete cascade,

  -- in US cents, from the token counts the API itself reported
  read_cost  numeric,

  -- what a dollar was worth in shekels the day it was read. KEPT RATHER THAN
  -- LOOKED UP: a price is a fact about a moment, and converting at the rate of
  -- whenever somebody opens the page would restate an old reading in this
  -- morning's money.
  usd_ils    numeric,

  created_at timestamptz not null default now()
);

-- Everything the two old columns held, copied across and THEN dropped, in that
-- order and in one block. The copy stood at the bottom of this file while the
-- drop stood at the top once, which is a way of saying the columns were emptied
-- into nothing: one run of the file and thirteen readings' prices were gone.
-- The order is the whole of the safety here, so the two live together.
--
-- Both halves run only where the old columns are still there, so the file
-- stays safe to run again on a project that has already moved.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'songs' and column_name = 'read_cost'
  ) then
    insert into public.song_costs (song_id, read_cost, usd_ils)
    select id, read_cost, usd_ils from public.songs where read_cost is not null
    on conflict (song_id) do nothing;

    alter table public.songs drop column read_cost;
    alter table public.songs drop column if exists usd_ils;
  end if;
end $$;

alter table public.song_costs enable row level security;

-- The one address that pays. In the file rather than in a settings table
-- because it is one fact that changes when the person changes, and a table of
-- one row would be a second place to keep it true.
drop policy if exists "the bill is the payer's" on public.song_costs;
create policy "the bill is the payer's"
  on public.song_costs for select to authenticated
  using (auth.jwt() ->> 'email' = 'ofir.aviram@gmail.com');

-- Written by whoever did the reading, and never changed afterwards: a price is
-- what it was. No update policy and no delete policy at all, so there are none
-- of either; the row goes when its song does, by the cascade above.
drop policy if exists "a reading records what it cost" on public.song_costs;
create policy "a reading records what it cost"
  on public.song_costs for insert to authenticated
  with check (true);

-- ==========================================================================
-- What to call an account, where somebody else has to be named.
--
-- A person's name is already kept, on the account itself, in the metadata
-- auth.users holds for it. And auth.users is not readable through the API by
-- anybody but the account it belongs to: there is no policy that could open
-- it and there should not be, because that table holds the email addresses,
-- the providers and the tokens of everybody who ever signed in.
--
-- Which is right for the bar at the top of the page, where an account reads
-- its own name, and no use at all in the one place another person has to be
-- named: the song says who put it in the library, and what it says it in is a
-- uuid. A uuid is not an answer.
--
-- So this is a row per account holding the ONE thing about an account that
-- other people are shown, and nothing else. No email, no provider, no dates
-- anybody signed in on. Written by the account itself and by nothing else,
-- read by anybody at all, and kept in step by the app the moment a name is
-- set (see auth.announce).
-- ==========================================================================
create table if not exists public.people (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null default '',
  updated_at timestamptz not null default now()
);

drop trigger if exists people_touch_updated_at on public.people;
create trigger people_touch_updated_at
  before update on public.people
  for each row execute function public.touch_updated_at();

-- Everybody who signed in before this table existed, named the way the app
-- names them: their own answer first, then whatever Google said, then the
-- first half of the email. The same order as nameFrom in the browser, because
-- a person who is called one thing in the bar and another under a song is two
-- people as far as anybody reading is concerned.
--
-- `on conflict do nothing`, so this fills in what is missing and never writes
-- over a name somebody has since given themselves.
insert into public.people (id, name)
select u.id,
       coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                nullif(u.raw_user_meta_data ->> 'full_name', ''),
                nullif(u.raw_user_meta_data ->> 'name', ''),
                split_part(coalesce(u.email, ''), '@', 1),
                '')
  from auth.users u
on conflict (id) do nothing;

alter table public.people enable row level security;

-- Anybody, signed in or not. What is in here is a name somebody chose to put
-- over their own songs, and the songs it names are readable by everybody: a
-- row that said who wrote them but only to people with an account would be a
-- credit that goes missing on exactly the page it belongs on.
drop policy if exists "a person is readable by everyone" on public.people;
create policy "a person is readable by everyone"
  on public.people for select
  using (true);

-- And it is written by the one account it is about. `with check` on both is
-- what stops a row being written in somebody else's name, or handed over
-- afterwards, which is the same rule the songs live under.
drop policy if exists "a person names themselves" on public.people;
create policy "a person names themselves"
  on public.people for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "a person renames themselves" on public.people;
create policy "a person renames themselves"
  on public.people for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- No delete policy, so there is none. A row here is what a song's owner
-- column means, and deleting it would leave every song that account put in
-- the library owned by a uuid again. It goes when the account goes, by the
-- cascade above, and that is the only way out.
