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

  -- Who made it, which is two different people as often as it is one, and each
  -- of the two is SEVERAL people as often as it is one: three wrote the words
  -- and two of them wrote the tune. The performer is deliberately not among
  -- them: a song is one song however many people have recorded it.
  --
  -- A LIST OF NAMES SEPARATED BY COMMAS, "דביר כהן, ליאת ציון, ינון דר", which
  -- is how a printed sheet says it and how anybody typing one in says it. The
  -- app splits on the comma everywhere it reads these (see `people` in app.js),
  -- so the songs written before it did are right without being touched: the
  -- text was always a list, it was only being read as one name.
  --
  -- Not an array like `styles` below, and not a table. What would be gained is
  -- a separator the database enforces; what it would cost is a migration, two
  -- more shapes in the Worker, and REST queries on a text[] for a fact that is
  -- never queried on. A person becomes a row here on the day a person has
  -- something to them beyond a name.
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

-- WHOSE CHANGE THIS WAS, which is a different question from whose history it
-- is. Every row here is written by the account the song belongs to, because
-- nobody else may write one, so `owner` is the same name on every row of one
-- song and answers only "who may read this". What the list is actually read
-- for is the other question, and until now it had no answer: a version made by
-- taking somebody's offer in, or by their change to who wrote the song,
-- carried nothing at all saying it was theirs.
--
-- Written by the browser and NOT defaulted from the token, exactly because it
-- is not always the token: an offer taken in records the person who made it,
-- and that person is never the one making the request.
--
-- Null on every version written before this column existed, and on any change
-- nobody can name. A row card with no name on it is a row that says when and
-- what, which is what all of them said before.
alter table public.song_versions add column if not exists made_by uuid
  references auth.users (id) on delete set null;

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

-- WHOSE READING IT WAS. Filled in by the database from the token the request
-- carried, exactly as `owner` is on a song, so it cannot be claimed: the
-- Worker writes this row with the token of whoever dropped the photograph in,
-- and that is the account the reading is charged to.
--
-- `on delete set null` and not a cascade, which is the difference between this
-- and everything else here. A song belongs to an account and goes with it; a
-- price is money that was actually spent, and an account leaving does not
-- unspend it. What goes is the name on the row.
alter table public.song_costs add column if not exists reader uuid
  references auth.users (id) on delete set null;
alter table public.song_costs alter column reader set default auth.uid();

-- HOW THE READING WENT, in one word, put here rather than on the song for the
-- same reason the price is: what came back is a fact about the reading, the
-- song is what is left of it afterwards, and a song saved by hand is a song
-- that has already been written over.
--
--   measured  the ruler and the words agreed, and the chords were placed by
--             arithmetic. The cheap read.
--   model     they did not, so the model placed them. The dear one.
--   words     the chords half failed and the words were kept.
--   failed    nothing came back, and what was burned getting there is the
--             price on this row.
--
-- Null on a row written before this column existed. Not backfilled: nobody
-- knows which of the four those readings were, and guessing would put a word
-- on the page that is not true of anything.
alter table public.song_costs add column if not exists kept text;
alter table public.song_costs drop constraint if exists song_costs_kept_check;
alter table public.song_costs add constraint song_costs_kept_check
  check (kept is null or kept in ('measured', 'model', 'words', 'failed'));

-- How much the ruler and the words agreed, 0 to 1, which is the number that
-- chose between the two answers above. Null where there was no measuring to
-- compare against.
alter table public.song_costs add column if not exists agreement numeric;

-- A reading written before there was a reader has none, and it belongs to
-- whoever the song belongs to: the Worker reads with the token of the account
-- that made the row, and the row is made by the account that uploaded the
-- picture. So this is not a guess about the past, it is the same fact read off
-- the other table.
update public.song_costs c
   set reader = s.owner
  from public.songs s
 where c.song_id = s.id and c.reader is null and s.owner is not null;

-- the page groups by account and adds up what each one spent
create index if not exists song_costs_reader_idx on public.song_costs (reader);

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

-- ==========================================================================
-- WHICH SONGS THIS ACCOUNT HAS BEEN ON, latest first.
--
-- The library is ordered by when a song last CHANGED, which is the right
-- answer for a library being written and the wrong one for a library being
-- used: reading a song is not writing it, so an evening spent going back to
-- the same four songs left all four exactly where they were. What somebody
-- opens is what they are doing, so the songs this account has opened stand at
-- the front of the library and everything else keeps the order it had.
--
-- It was in the browser and it is here now, for one reason: a song worked on
-- at the desk and played off the phone an hour later is one song and one
-- person. A list that lived in localStorage knew about one screen, and the
-- second screen handed them the whole library again.
--
-- ONE ROW PER ACCOUNT, HOLDING THE LIST. Not a row per account per song with
-- a timestamp on it, which is a table growing forever, indexed forever and
-- ordered on every read, for a fact worth two seconds of looking. The order
-- IS the value, an array already has one, and the app caps it at sixty: past
-- that the library's own order is the answer again. The same argument, and
-- the same shape, as the songs in an evening (see setlists.songs).
--
-- The ids are ids and nothing more. A song deleted, or one belonging to
-- somebody else and since unpublished, is an id that matches nothing in the
-- library and falls out of the ordering on its own, which is exactly right:
-- this says where a reader has been, and it is not a second opinion about
-- what is in the library or who may read it.
-- ==========================================================================
create table if not exists public.song_opens (
  -- WHOSE. The account itself, so there cannot be anything but one row per
  -- account. The default fills it in from the token the request carried when
  -- the browser does not send it, and the policy below refuses a row written
  -- in anybody else's name when it does: the value is not the browser's to
  -- decide either way.
  id         uuid primary key default auth.uid()
             references auth.users (id) on delete cascade,

  -- ["<song id>", …], newest first.
  songs      jsonb not null default '[]'::jsonb,

  updated_at timestamptz not null default now()
);

drop trigger if exists song_opens_touch_updated_at on public.song_opens;
create trigger song_opens_touch_updated_at
  before update on public.song_opens
  for each row execute function public.touch_updated_at();

alter table public.song_opens enable row level security;

-- One rule for all four verbs, the same as an evening: this is the account's
-- own and nobody else's, ever. Not granted to anon at all, so a reader with no
-- account is answered as though the table were empty, which for them it is;
-- their order is their browser's, which is where it always was.
--
-- What is in here is a reading history, and it is the one thing in this
-- project that says what a person did rather than what they made. It is never
-- shown to anybody, including on a song they published.
drop policy if exists "what an account has opened is its own" on public.song_opens;
create policy "what an account has opened is its own"
  on public.song_opens for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ==========================================================================
-- WHICH KEY THIS ACCOUNT PLAYS EACH SONG IN, and therefore which fret.
--
-- A song is written in one key and sung in another, and which other is a fact
-- about the person singing it and not about the song: two people open the same
-- published song and each of them is right about a different key. So it is
-- kept per account and per song, and it never touches the song itself.
--
-- TWO NUMBERS AND NOT THREE. `p` is what is printed on the page, the distance
-- every chord is drawn at; `s` is what comes out of the guitar, which moving
-- the page does not move. The capo is the gap between them and is deliberately
-- NOT here: a fret stored on its own has to be clamped at each end of the neck,
-- and a clamped number added to on every press loses count. A subtraction
-- cannot (see capoOf in app.js).
--
-- It was in the browser only, on the argument that being wrong costs two
-- presses. It costs more than that: somebody sets a song up at the desk,
-- picks up the phone in the evening, and the song opens in a key they did not
-- choose, with the capo somewhere else. The pair is an answer a person gave,
-- and an answer a person gave belongs to the person and not to one screen.
--
-- ONE ROW PER ACCOUNT, HOLDING THE MAP, exactly as the opens list does above.
-- Not a row per account per song: that is a table growing without end, indexed
-- without end, for two small integers. The map is `{"<song id>": {"p": 0,
-- "s": 0}}` and it is written whole.
--
-- Uncapped, which the opens list is not, because the two lists lose different
-- things when they are trimmed. Dropping the tail off "where you have been"
-- costs a second of looking; dropping an entry here throws away something
-- somebody decided. Two integers per song is a row of a few kilobytes for a
-- reader who has answered a thousand songs.
--
-- The browser still holds its own copy, and that copy is what every frame
-- reads: the page has to be in the right key in the first frame, and an answer
-- from the network is not there in the first frame. A reader with no account
-- has exactly what they had before this, their own browser's.
-- ==========================================================================
create table if not exists public.song_keys (
  -- WHOSE, and the same argument as song_opens: the account itself, so there
  -- cannot be more than one row per account, filled in from the token when the
  -- browser leaves it out and refused by the policy when it names anybody else.
  id         uuid primary key default auth.uid()
             references auth.users (id) on delete cascade,

  -- {"<song id>": {"p": <page>, "s": <sung>}, …}
  keys       jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default now()
);

drop trigger if exists song_keys_touch_updated_at on public.song_keys;
create trigger song_keys_touch_updated_at
  before update on public.song_keys
  for each row execute function public.touch_updated_at();

alter table public.song_keys enable row level security;

-- One rule for all four verbs: this is the account's own and nobody else's.
-- Not granted to anon, so a reader with no account is answered as though the
-- table were empty, which for them it is.
--
-- And never shown to anybody, including on a song they published. Which key
-- somebody sings a song in says something about their voice, and it is theirs
-- the same way the reading history above is.
drop policy if exists "the key an account plays in is its own" on public.song_keys;
create policy "the key an account plays in is its own"
  on public.song_keys for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ==========================================================================
-- THE LIBRARY CHANGED, AND NOBODY PUSHED ANYTHING.
--
-- The songs are written to disk at build time. Every address under /chords/
-- is a real file, built by asking this table with the anon key (see
-- businesses/chords/pages/library.js), which is what lets a search engine
-- have the library at all. The price is that the site knows what was true at
-- the last build: a song published this morning is not on it, and, which
-- matters more, a song taken off the shelf keeps its page and its words.
--
-- So the table says so itself. The moment a song is published, unpublished,
-- deleted or restored, this posts to GitHub and the site builds again, about
-- a minute later. Nothing here writes the site; it only says that what the
-- site was built from has moved.
--
-- IT DOES NOT FIRE ON SAVING. A song saves itself every second while it is
-- being typed, and a build per keystroke is not a fresher site, it is a
-- queue. What it fires on is the small set of moments somebody decided
-- something about who may read a song:
--
--   published changed      out into the world, or back off the shelf
--   deleted_at changed     deleted, or restored
--   a version written      "פורסם" was pressed, which is the one moment an
--                          edited song is finished (see song_versions)
--   a published row born   or one purged for good
--
-- THE TOKEN IS NOT IN THIS FILE and must never be: this repo is public. It
-- lives in the project's own vault under the name below, and this reads it
-- from there. Without it the function does nothing at all and every write
-- goes through as before, which is the right way round: a notification that
-- is not set up must never be able to stop a song being saved.
--
-- To put it there, once, in the SQL editor:
--
--   select vault.create_secret('<github token>', 'github_dispatch_token',
--     'fine grained PAT on aviramo/floa, Contents: read and write');
--
-- and to replace it later, vault.update_secret under the same name.
-- ==========================================================================
create extension if not exists pg_net;

create or replace function public.library_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
begin
  select decrypted_secret into token
    from vault.decrypted_secrets
   where name = 'github_dispatch_token';

  -- No token, no notification, and the write itself is untouched. A project
  -- restored from a dump, or one nobody has set this up on, behaves exactly
  -- as it did before this existed.
  if token is null or token = '' then
    return coalesce(new, old);
  end if;

  -- pg_net QUEUES the request and returns. Nothing here waits on GitHub, so a
  -- slow answer cannot make saving a song slow, and a failed one cannot roll
  -- one back. What came of it is readable afterwards in net._http_response.
  perform net.http_post(
    url := 'https://api.github.com/repos/aviramo/floa/dispatches',
    headers := jsonb_build_object(
      'authorization', 'Bearer ' || token,
      'accept', 'application/vnd.github+json',
      'content-type', 'application/json',
      'user-agent', 'floa-chords'),
    body := jsonb_build_object('event_type', 'library-changed')
  );

  return coalesce(new, old);
end;
$$;

-- A song crossing the line between "mine" and "everybody's", in either
-- direction, and a song leaving or coming back. Nothing else on the row.
drop trigger if exists songs_library_changed on public.songs;
create trigger songs_library_changed
  after update on public.songs
  for each row
  when (old.published is distinct from new.published
     or old.deleted_at is distinct from new.deleted_at)
  execute function public.library_changed();

-- A row that arrives already published, and one that is purged for good. A
-- new song is written unpublished and is nobody's business yet, so an
-- ordinary insert says nothing.
drop trigger if exists songs_born_published on public.songs;
create trigger songs_born_published
  after insert on public.songs
  for each row
  when (new.published and new.deleted_at is null)
  execute function public.library_changed();

drop trigger if exists songs_purged on public.songs;
create trigger songs_purged
  after delete on public.songs
  for each row
  when (old.published)
  execute function public.library_changed();

-- AND THE PRESS ITSELF. A version row is written the moment "פורסם" is
-- pressed and at no other time, so it is exactly "this song is finished and
-- it is out", said once however many times the song saved itself on the way
-- there. It is what carries an EDIT to a song that was already published.
drop trigger if exists song_published_again on public.song_versions;
create trigger song_published_again
  after insert on public.song_versions
  for each row
  execute function public.library_changed();

-- ==========================================================================
-- TAKES. Somebody playing the song, recorded.
--
-- A song is words and chords, and that is the same for everybody who ever sang
-- it. A take is one person playing it once: their tempo, their strumming,
-- their voice, on an evening. The two are different kinds of thing, which is
-- why this is a table rather than a column, and why a song can have any number
-- of them from any number of accounts.
--
-- WHAT IS KEPT IS NOT ONLY THE SOUND. `marks` is where the mark was and when:
-- every time the follower moved while the recording was running, the moment it
-- moved and the chord it moved to. Which is the whole point of it. Sound alone
-- is a recording and every phone has one of those; sound WITH the times turns
-- playing it back into the page moving through the song exactly as it moved
-- while it was being played, with no microphone in the room at all.
--
-- The audio itself is not in here. A row is a few hundred bytes and a take is
-- a megabyte, so the sound lives in the bucket set up at the bottom of this
-- file and the row holds the path to it.
-- ==========================================================================
create table if not exists public.song_takes (
  id       uuid primary key default gen_random_uuid(),

  song_id  uuid not null references public.songs (id) on delete cascade,

  -- Whose. Filled in by the database from the token the request carried, never
  -- by the browser, exactly as on a song and on an evening: a take belongs to
  -- the account that recorded it the moment it is recorded, and there is no
  -- other way to record one.
  owner    uuid default auth.uid() references auth.users (id) on delete cascade,

  -- WHICH TAKE THIS IS, counted per song per account: 1, 2, 3. The same idea
  -- as a song's versions and for the same reason: somebody who played it three
  -- times has three of them and needs to be able to say which. Worked out by
  -- the browser from what it can already see, which is exactly this account's
  -- takes of this song.
  take     int not null default 1,

  -- Where the sound is inside the bucket: <owner>/<song>/<id>. Not a URL: a
  -- URL is an address that could change, and this is a name in a bucket this
  -- project owns.
  path     text not null,
  -- What the browser managed to record in. Chrome gives webm and opus, Safari
  -- gives mp4 and aac, and whichever it was has to be handed back to the audio
  -- element that plays it.
  mime     text not null default '',
  seconds  numeric,

  -- [{ "t": 1240, "at": 3 }, ...]  milliseconds from the start of the take,
  -- and the chord it moved to, counted along the song the way the sheet counts
  -- them (see followRead in app.js).
  marks    jsonb not null default '[]'::jsonb,

  -- THE KEY IT WAS PLAYED IN, because a take is a sound at a pitch and the
  -- page is a drawing that moves. Somebody playing it back after taking the
  -- song down two is hearing a recording that no longer matches what is
  -- printed, and these are what lets the app say so. `page` is the
  -- transposition the chords were drawn at, `capo` the fret the hand was at.
  page     int not null default 0,
  capo     int not null default 0,

  -- Out in the world, and exactly like a song's own `published`: the only
  -- thing that makes it readable by anybody else. A take is a recording of a
  -- person singing, which is a more personal thing than a chord sheet, so it
  -- starts private and stays that way until it is offered.
  published boolean not null default false,

  created_at timestamptz not null default now()
);

-- one song's takes, newest first, which is the only question asked of it
create index if not exists song_takes_song_idx
  on public.song_takes (song_id, created_at desc);
create index if not exists song_takes_owner_idx on public.song_takes (owner);

alter table public.song_takes enable row level security;

-- Anybody at all for the ones that are out, and the account's own either way,
-- which is the same rule the songs live under.
drop policy if exists "a take that is out is readable" on public.song_takes;
create policy "a take that is out is readable"
  on public.song_takes for select
  using (published or owner = auth.uid());

drop policy if exists "a take is recorded by its account" on public.song_takes;
create policy "a take is recorded by its account"
  on public.song_takes for insert to authenticated
  with check (owner = auth.uid());

drop policy if exists "a take is changed by its account" on public.song_takes;
create policy "a take is changed by its account"
  on public.song_takes for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "a take is deleted by its account" on public.song_takes;
create policy "a take is deleted by its account"
  on public.song_takes for delete to authenticated
  using (owner = auth.uid());

-- ==========================================================================
-- And the bucket the sound itself is in.
--
-- NOT PUBLIC. A public bucket is one where knowing the path is knowing the
-- sound, and an unpublished take would then be private only in the sense that
-- nobody has been told where it is. This one is read through the same rule the
-- table is read through, asked of the row that names the file: out, or yours.
-- So a take nobody has offered is readable by nobody, and there is no address
-- that changes that.
--
-- What it costs is that the browser cannot point an <audio> element straight
-- at a URL, because an element cannot carry an authorization header. It
-- fetches the sound and plays it out of memory instead, which for a few
-- minutes of opus is nothing.
-- ==========================================================================
-- NO LIST OF ALLOWED TYPES, and that is not laziness. A browser does not
-- record "audio/webm", it records "audio/webm;codecs=opus", and a list is
-- matched against the whole string: every upload was refused by the bucket
-- before it reached the row, with a message about storage that said nothing
-- about codecs. Safari would have failed the same way on mp4.
--
-- What the list was protecting against is not a real risk here either. The
-- bucket is private, only the owning account may write to it, and it can only
-- write under its own uuid. A size limit is a useful rule; a guess at how a
-- browser will spell its own container is not.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('takes', 'takes', false, 26214400, null)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = null;

-- Readable exactly when the row that names it is readable. `name` in
-- storage.objects is the path within the bucket, which is what song_takes.path
-- holds, so the two are the same string and this is one lookup.
drop policy if exists "a take sound follows its row" on storage.objects;
create policy "a take sound follows its row"
  on storage.objects for select
  using (
    bucket_id = 'takes' and exists (
      select 1 from public.song_takes t
       where t.path = storage.objects.name
         and (t.published or t.owner = auth.uid())
    )
  );

-- And written by the account it belongs to. The path opens with that account's
-- own uuid, which is what makes this checkable without reading another table:
-- a file can only be put where its owner's name already is.
drop policy if exists "a take sound is uploaded by its account" on storage.objects;
create policy "a take sound is uploaded by its account"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'takes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "a take sound is removed by its account" on storage.objects;
create policy "a take sound is removed by its account"
  on storage.objects for delete to authenticated
  using (bucket_id = 'takes' and (storage.foldername(name))[1] = auth.uid()::text);

-- ==========================================================================
-- OFFERS. How somebody who does not own a song changes it.
--
-- The library is everybody's to read and each song is one account's to write.
-- That is the rule on songs and it is the right one, and what it had no answer
-- for at all is the ordinary thing that happens in a library: somebody who
-- knows the song sees a wrong chord in the second verse. They could type over
-- it and be refused, which teaches them that the app is broken rather than
-- that the song is not theirs.
--
-- So an edit by anybody else is not refused, it is KEPT, here, and the song
-- does not move. It is an offer: this is how I would have it. The account the
-- song belongs to is the only one that can take it, and taking it is what
-- writes the words into the song. Both of them see that it is standing there,
-- and until it is taken the world goes on reading the song as it was.
--
-- ONE ROW PER PERSON PER SONG, and not a row per attempt. An offer is written
-- the way a song is written, a word at a time with a save a second later, and
-- a row per save would be a history of typing. That is the same argument
-- song_versions makes for putting a version on the shelf when פורסם is
-- pressed and not when a key is; here there is no press at all, so the row is
-- rewritten in place and `state` is the whole of what became of it.
-- ==========================================================================
create table if not exists public.song_offers (
  id       uuid primary key default gen_random_uuid(),

  song_id  uuid not null references public.songs (id) on delete cascade,

  -- WHOSE OFFER. Filled in by the database from the token the request carried,
  -- never by the browser, exactly as on a song, an evening and a take: an
  -- offer is made by the account that makes it and there is no other way to
  -- make one.
  owner    uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- The song as this person would have it, in the columns the song stands in
  -- and in the same formats, so taking an offer is a copy across and not a
  -- translation. The same six a version keeps, and for the same reason: these
  -- are the song. Everything else on this row is about the offer.
  title      text not null default '',
  lyrics_by  text not null default '',
  music_by   text not null default '',
  dir        text not null default 'rtl',
  lines      jsonb not null default '""'::jsonb,
  styles     text[] not null default '{}',

  --   open      written, and waiting for the account the song belongs to
  --   taken     the song was written from it
  --   declined  it was read, and not taken
  --
  -- It goes back to `open` by itself the moment the person types into it
  -- again, which is what makes one row enough: an answered offer that has been
  -- worked on since is a new offer.
  state    text not null default 'open'
           check (state in ('open', 'taken', 'declined')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- ONE PER PERSON PER SONG, said by the database rather than by the browser.
  -- Two open offers from one account on one song are two answers to the same
  -- question, and the page that has to draw them cannot say which is the one
  -- being typed into.
  unique (song_id, owner)
);

-- "is anything waiting on this song", which is the question every song page
-- and every row of the library asks
create index if not exists song_offers_open_idx
  on public.song_offers (song_id) where state = 'open';
create index if not exists song_offers_owner_idx on public.song_offers (owner);

drop trigger if exists song_offers_touch_updated_at on public.song_offers;
create trigger song_offers_touch_updated_at
  before update on public.song_offers
  for each row execute function public.touch_updated_at();

alter table public.song_offers enable row level security;

-- TWO PEOPLE AND NOBODY ELSE: the one who wrote it and the one who can take
-- it. Not the world, even on a published song. What is published is the song;
-- an offer is a half-finished sentence about it, and until it is taken it is
-- between the two of them.
drop policy if exists "an offer is read by the two it is between" on public.song_offers;
create policy "an offer is read by the two it is between"
  on public.song_offers for select to authenticated
  using (
    owner = auth.uid()
    or exists (select 1 from public.songs s where s.id = song_id and s.owner = auth.uid())
  );

-- Written by the person making it, and it arrives open. An offer that could be
-- written already taken would be a way of writing somebody else's song in one
-- request.
drop policy if exists "an offer is written by the one making it" on public.song_offers;
create policy "an offer is written by the one making it"
  on public.song_offers for insert to authenticated
  with check (owner = auth.uid() and state = 'open');

-- And rewritten by them for as long as they like, at the price of it being
-- open again: touching an offer is asking again.
--
-- `with check` pinning the state is the whole rule this table exists for.
-- Without it the person making an offer could mark their own offer taken. What
-- that would still not do is change the song, because nothing here can: the
-- taking is a write to `songs`, and only its owner may make it.
drop policy if exists "an offer is rewritten while it is open" on public.song_offers;
create policy "an offer is rewritten while it is open"
  on public.song_offers for update to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and state = 'open');

-- ANSWERED BY THE ACCOUNT THE SONG BELONGS TO, which is the other half of it.
drop policy if exists "an offer is answered by the song's account" on public.song_offers;
create policy "an offer is answered by the song's account"
  on public.song_offers for update to authenticated
  using (exists (select 1 from public.songs s where s.id = song_id and s.owner = auth.uid()))
  with check (exists (select 1 from public.songs s where s.id = song_id and s.owner = auth.uid()));

-- Taken back by whoever made it, cleared away by whoever it was made to.
drop policy if exists "an offer is withdrawn or cleared" on public.song_offers;
create policy "an offer is withdrawn or cleared"
  on public.song_offers for delete to authenticated
  using (
    owner = auth.uid()
    or exists (select 1 from public.songs s where s.id = song_id and s.owner = auth.uid())
  );

-- NO TRIGGER OF ITS OWN, and that is deliberate. Taking an offer into a
-- published song changes what the world reads, so the site on disk has to be
-- built again, and it already is: the app writes a version the moment an offer
-- is taken into a published song, exactly as it does for פורסם, and the
-- trigger on song_versions is what posts to GitHub. A second trigger here
-- would be a second build of the same change.
