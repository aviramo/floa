-- A frozen copy of the catalog as it is now (2026-11-20): the exercises, their music links, their categories, their texts and their lines. Side tables only, nothing reads them.
begin;
create table biodanza.snap_exercises_20261120 as select * from biodanza.exercises where owner_id is null;
create table biodanza.snap_exercise_music_20261120 as select em.* from biodanza.exercise_music em join biodanza.snap_exercises_20261120 e on e.id = em.exercise_id;
create table biodanza.snap_categories_20261120 as select * from biodanza.categories;
create table biodanza.snap_exercise_texts_20261120 as select t.* from biodanza.exercise_texts t join biodanza.snap_exercises_20261120 e on e.id = t.exercise_id;
create table biodanza.snap_exercise_lines_20261120 as select l.* from biodanza.exercise_lines l join biodanza.snap_exercises_20261120 e on e.id = l.exercise_id;
alter table biodanza.snap_exercise_lines_20261120 enable row level security;
alter table biodanza.snap_exercises_20261120 enable row level security;
alter table biodanza.snap_exercise_music_20261120 enable row level security;
alter table biodanza.snap_categories_20261120 enable row level security;
alter table biodanza.snap_exercise_texts_20261120 enable row level security;
revoke all on biodanza.snap_exercises_20261120, biodanza.snap_exercise_music_20261120, biodanza.snap_categories_20261120, biodanza.snap_exercise_texts_20261120, biodanza.snap_exercise_lines_20261120 from anon, authenticated;
commit;
