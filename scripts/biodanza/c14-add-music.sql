-- APPROVED by the owner 2026-11-20: add to the app catalog's exercises the music of the 2014 catalog, for the exercises 2014 marks as EXACT.
-- Only songs the 2014 catalog lists for that exercise, only songs that already exist in our music table, no association taken from Brush.
-- No doubles: a song already on the exercise is skipped, and so is a song whose audio FILE is already on the exercise under another song row.
-- Frozen copy before it ran: biodanza.snap_exercise_music_before14_20261120. Undo = delete the rows with source 'catalog2014' of this run.
begin;
create table if not exists biodanza.snap_exercise_music_before14_20261120 as select * from biodanza.exercise_music;
alter table biodanza.snap_exercise_music_before14_20261120 enable row level security;
revoke all on biodanza.snap_exercise_music_before14_20261120 from anon, authenticated;

create temp table _add on commit drop as
select distinct c.catalog_exercise_id as exercise_id, cm.music_id
from biodanza.c14_exercises c
join biodanza.c14_music cm on cm.c14_id = c.id
join biodanza.music m on m.id = cm.music_id
where c.catalog_match = 'exact'
  and not exists (select 1 from biodanza.exercise_music em where em.exercise_id = c.catalog_exercise_id and em.music_id = cm.music_id)
  and not (m.audio_object is not null and exists (select 1 from biodanza.exercise_music em join biodanza.music m2 on m2.id = em.music_id where em.exercise_id = c.catalog_exercise_id and m2.audio_object = m.audio_object));

insert into biodanza.exercise_music (exercise_id, music_id, source) select exercise_id, music_id, 'catalog2014' from _add on conflict do nothing;

do $chk$
declare dup int; n int; before int;
begin
  select count(*) into n from biodanza.exercise_music where source = 'catalog2014';
  select count(*) into before from biodanza.snap_exercise_music_before14_20261120;
  if (select count(*) from biodanza.exercise_music) <> before + n then raise exception 'row count is not before + added'; end if;
  select count(*) into dup from (select em.exercise_id, m.audio_object from biodanza.exercise_music em join biodanza.music m on m.id = em.music_id where m.audio_object is not null group by 1, 2 having count(*) > 1) d;
  -- doubles that existed before this run are not mine; only count the ones involving a new row
  select count(*) into dup from (select em.exercise_id, m.audio_object from biodanza.exercise_music em join biodanza.music m on m.id = em.music_id where m.audio_object is not null group by 1, 2 having count(*) > 1 and bool_or(em.source = 'catalog2014')) d;
  if dup > 0 then raise exception 'a double was created: %', dup; end if;
end
$chk$;
commit;
