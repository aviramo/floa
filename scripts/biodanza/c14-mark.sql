-- In the 2014 side table, mark on each exercise the exercise of the app's catalog it belongs to (the best match, with how sure it is).
-- exact: same name; strong: almost the same name, or a similar name with shared music; possible: a similar name only. No match: both columns stay empty.
-- Run it after c14-matches.sql. Only the side table is written; the catalog is only read.
begin;
alter table biodanza.c14_exercises add column if not exists catalog_exercise_id uuid;
alter table biodanza.c14_exercises add column if not exists catalog_match text;
update biodanza.c14_exercises set catalog_exercise_id = null, catalog_match = null;
update biodanza.c14_exercises c set catalog_exercise_id = m.exercise_id, catalog_match = m.strength
  from biodanza.c14_matches m where m.c14_id = c.id and m.rank = 1 and m.strength in ('exact', 'strong', 'possible');
commit;
