-- Owner-approved 2026-11-21 (two steps, one transaction).
-- Step 2: six 2014 exercises matched 'exact' to a catalog exercise whose category differs from the old program's: the catalog exercise takes the old program's category (all six categories already exist).
-- Step 1: thirteen 2014 exercises that are separate exercises in the old program but were only 'possible'/'strong' links to a catalog exercise become new catalog exercises:
--   source 'catalog2014', title from the 2014 PDF, category from the old program, songs from the PDF list (deduped by collection code), no texts, no lines.
-- Frozen copies before: biodanza.snap_exercises_before14c_20261121, snap_exercise_music_before14c_20261121, snap_c14_exercises_before14c_20261121.
-- Undo: restore from the snapshots (exercises category, c14 links) and delete the 'catalog2014'-source exercises created here.
begin;
create table if not exists biodanza.snap_exercises_before14c_20261121 as select * from biodanza.exercises;
create table if not exists biodanza.snap_exercise_music_before14c_20261121 as select * from biodanza.exercise_music;
create table if not exists biodanza.snap_c14_exercises_before14c_20261121 as select * from biodanza.c14_exercises;
alter table biodanza.snap_exercises_before14c_20261121 enable row level security;
alter table biodanza.snap_exercise_music_before14c_20261121 enable row level security;
alter table biodanza.snap_c14_exercises_before14c_20261121 enable row level security;
revoke all on biodanza.snap_exercises_before14c_20261121, biodanza.snap_exercise_music_before14c_20261121, biodanza.snap_c14_exercises_before14c_20261121 from anon, authenticated;

-- Step 2
create temp table _cat on commit drop as
select e.id, c.category_brush from biodanza.c14_exercises c join biodanza.exercises e on e.id = c.catalog_exercise_id
where c.catalog_match = 'exact' and c.category_brush <> '' and c.category_brush <> e.category;
do $c$ begin
  if (select count(*) from _cat) <> 6 then raise exception 'expected 6 category changes, got %', (select count(*) from _cat); end if;
  if exists (select 1 from _cat where category_brush not in (select distinct category from biodanza.exercises)) then raise exception 'a category does not exist yet'; end if;
end $c$;
update biodanza.exercises e set category = _cat.category_brush, updated_at = now() from _cat where e.id = _cat.id;

-- Step 1
create temp table _new on commit drop as
select c.id as c14_id, gen_random_uuid() as new_id, c.title_en, c.title_he, c.category_brush, c.raw_sources
from biodanza.c14_exercises c join biodanza.exercises e on e.id = c.catalog_exercise_id
where c.catalog_match in ('possible','strong') and c.category_brush <> '' and c.category_brush <> e.category;
do $c$ begin if (select count(*) from _new) <> 13 then raise exception 'expected 13 new exercises, got %', (select count(*) from _new); end if; end $c$;

insert into biodanza.exercises (id, source, category, title_he, title_en, raw_sources)
select new_id, 'catalog2014', category_brush, title_he, title_en, '[]'::jsonb from _new;

insert into biodanza.exercise_music (exercise_id, music_id, source)
select distinct on (n.new_id, regexp_replace(upper(m.collection),'[ _]|^IBFC','','g')) n.new_id, m.id, 'catalog2014'
from _new n cross join lateral jsonb_array_elements(n.raw_sources) s
join biodanza.music m on m.id = (s->>'m')::uuid
order by n.new_id, regexp_replace(upper(m.collection),'[ _]|^IBFC','','g'), m.id;

update biodanza.c14_exercises c set catalog_exercise_id = n.new_id, catalog_match = 'exact' from _new n where c.id = n.c14_id;
commit;
