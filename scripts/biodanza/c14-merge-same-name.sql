-- Merge exercises with the same Hebrew title in the same category (23 groups, 24 losers).
-- Keeper: the ibf2012 one if present, else the oldest. Songs, likes, vivencia items, c14 links move to the keeper.
create table biodanza.snap_exercises_before14i2_20261122 as select * from biodanza.exercises;
create table biodanza.snap_exercise_music_before14i2_20261122 as select * from biodanza.exercise_music;
create table biodanza.snap_c14_exercises_before14i2_20261122 as select * from biodanza.c14_exercises;
create table biodanza.snap_exercise_likes_before14i2_20261122 as select * from biodanza.exercise_likes;
create table biodanza.snap_vivencia_items_before14i2_20261122 as select * from biodanza.vivencia_items;
create table biodanza.snap_exercise_texts_before14i2_20261122 as select * from biodanza.exercise_texts;
create table biodanza.snap_exercise_lines_before14i2_20261122 as select * from biodanza.exercise_lines;
create table biodanza.snap_c14_matches_before14i2_20261122 as select * from biodanza.c14_matches;

create temp table mp on commit drop as
select id as loser, first_value(id) over w as keeper, row_number() over w as rn
from biodanza.exercises
where coalesce(title_he,'')<>''
window w as (partition by category, title_he order by (source='ibf2012') desc, created_at, id);
delete from mp where rn=1;

insert into biodanza.exercise_music (exercise_id, music_id, phase_hint, note, source)
select distinct on (mp.keeper, m.music_id) mp.keeper, m.music_id, m.phase_hint, m.note, m.source
from mp join biodanza.exercise_music m on m.exercise_id=mp.loser
where not exists (select 1 from biodanza.exercise_music k where k.exercise_id=mp.keeper and k.music_id=m.music_id);
delete from biodanza.exercise_music where exercise_id in (select loser from mp);

insert into biodanza.exercise_likes (user_id, exercise_id, created_at)
select distinct on (l.user_id, mp.keeper) l.user_id, mp.keeper, l.created_at
from mp join biodanza.exercise_likes l on l.exercise_id=mp.loser
where not exists (select 1 from biodanza.exercise_likes k where k.exercise_id=mp.keeper and k.user_id=l.user_id);
delete from biodanza.exercise_likes where exercise_id in (select loser from mp);

update biodanza.vivencia_items v set exercise_id=mp.keeper from mp where v.exercise_id=mp.loser;

update biodanza.exercise_texts t set exercise_id=mp.keeper from mp
where t.exercise_id=mp.loser and not exists (select 1 from biodanza.exercise_texts k where k.exercise_id=mp.keeper and k.lang=t.lang);
delete from biodanza.exercise_texts where exercise_id in (select loser from mp);
update biodanza.exercise_lines t set exercise_id=mp.keeper from mp
where t.exercise_id=mp.loser and not exists (select 1 from biodanza.exercise_lines k where k.exercise_id=mp.keeper and k.line_key=t.line_key);
delete from biodanza.exercise_lines where exercise_id in (select loser from mp);

update biodanza.c14_exercises c set catalog_exercise_id=mp.keeper from mp where c.catalog_exercise_id=mp.loser;
update biodanza.c14_matches c set exercise_id=mp.keeper from mp where c.exercise_id=mp.loser
  and not exists (select 1 from biodanza.c14_matches k where k.c14_id=c.c14_id and k.exercise_id=mp.keeper);
delete from biodanza.c14_matches where exercise_id in (select loser from mp);

delete from biodanza.exercises where id in (select loser from mp);
select count(*) merged from mp;
