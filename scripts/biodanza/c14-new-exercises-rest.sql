-- Owner-approved 2026-11-21: every 2014 exercise still unlinked to the catalog becomes a new catalog exercise (all but 6 are separate exercises in the old program too).
-- Category: the old program's category when it has a real one that already exists here; otherwise empty, which the app shows as "ללא קטגוריה".
-- source 'catalog2014', title from the 2014 PDF, songs from the PDF list (deduped by collection code), no texts, no lines.
-- Frozen copies before: biodanza.snap_exercises_before14d_20261121, snap_exercise_music_before14d_20261121, snap_c14_exercises_before14d_20261121.
-- Undo: delete the exercises created here (source 'catalog2014' and created in this run, ids in snap_c14 diff) and restore c14 links from the snapshot.
begin;
create table if not exists biodanza.snap_exercises_before14d_20261121 as select * from biodanza.exercises;
create table if not exists biodanza.snap_exercise_music_before14d_20261121 as select * from biodanza.exercise_music;
create table if not exists biodanza.snap_c14_exercises_before14d_20261121 as select * from biodanza.c14_exercises;
alter table biodanza.snap_exercises_before14d_20261121 enable row level security;
alter table biodanza.snap_exercise_music_before14d_20261121 enable row level security;
alter table biodanza.snap_c14_exercises_before14d_20261121 enable row level security;
revoke all on biodanza.snap_exercises_before14d_20261121, biodanza.snap_exercise_music_before14d_20261121, biodanza.snap_c14_exercises_before14d_20261121 from anon, authenticated;

create temp table _new on commit drop as
select c.id as c14_id, gen_random_uuid() as new_id, c.title_en, c.title_he,
  case when c.category_brush <> '' and c.category_brush in (select category from biodanza.exercises where category <> '') then c.category_brush else '' end as cat,
  c.raw_sources
from biodanza.c14_exercises c where c.catalog_exercise_id is null;
do $c$ begin if (select count(*) from _new) <> 231 then raise exception 'expected 231, got %', (select count(*) from _new); end if; end $c$;

insert into biodanza.exercises (id, source, category, title_he, title_en, raw_sources)
select new_id, 'catalog2014', cat, title_he, title_en, '[]'::jsonb from _new;

insert into biodanza.exercise_music (exercise_id, music_id, source)
select distinct on (n.new_id, regexp_replace(upper(m.collection),'[ _]|^IBFC','','g')) n.new_id, m.id, 'catalog2014'
from _new n cross join lateral jsonb_array_elements(n.raw_sources) s
join biodanza.music m on m.id = (s->>'m')::uuid
order by n.new_id, regexp_replace(upper(m.collection),'[ _]|^IBFC','','g'), m.id;

update biodanza.c14_exercises c set catalog_exercise_id = n.new_id, catalog_match = 'exact' from _new n where c.id = n.c14_id;
commit;
