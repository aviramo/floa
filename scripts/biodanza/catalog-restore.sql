-- RESTORE THE CATALOG to the frozen copy of 2026-11-20 (scripts/biodanza/catalog-snapshot.sql made the snap_*_20261120 tables).
--   node scripts/sql.mjs < scripts/biodanza/catalog-restore.sql
-- One transaction. After it the catalog (exercises with no owner, their music links, categories, texts and lines) is exactly the copy:
--   a catalog exercise that is not in the copy is deleted, one that changed is put back, one that was deleted comes back, and the same for the rest.
-- Hearts on exercises stay (an exercise in the copy is updated in place, not deleted and re-added).
-- The vivencias are never touched: the script stops and undoes everything if one vivencia item is different when it ends.
begin;

create temp table _viv on commit drop as select count(*) n, md5(coalesce(string_agg(v::text, '|' order by v.id), '')) h from biodanza.vivencia_items v;

do $restore$
declare
  cols text;
  sets text;
begin
  -- exercises: out with the ones the copy does not have, the rest put back in place
  delete from biodanza.exercises where owner_id is null and id not in (select id from biodanza.snap_exercises_20261120);
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
         string_agg(quote_ident(column_name) || ' = excluded.' || quote_ident(column_name), ', ' order by ordinal_position) filter (where column_name <> 'id')
    into cols, sets
    from information_schema.columns where table_schema = 'biodanza' and table_name = 'snap_exercises_20261120';
  execute format('insert into biodanza.exercises (%s) select %s from biodanza.snap_exercises_20261120 on conflict (id) do update set %s', cols, cols, sets);

  -- categories
  delete from biodanza.categories where key not in (select key from biodanza.snap_categories_20261120);
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
         string_agg(quote_ident(column_name) || ' = excluded.' || quote_ident(column_name), ', ' order by ordinal_position) filter (where column_name <> 'key')
    into cols, sets
    from information_schema.columns where table_schema = 'biodanza' and table_name = 'snap_categories_20261120';
  execute format('insert into biodanza.categories (%s) select %s from biodanza.snap_categories_20261120 on conflict (key) do update set %s', cols, cols, sets);

  -- music links, texts and lines: the catalog's rows are replaced by the copy's
  delete from biodanza.exercise_music where exercise_id in (select id from biodanza.snap_exercises_20261120);
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols from information_schema.columns where table_schema = 'biodanza' and table_name = 'snap_exercise_music_20261120';
  execute format('insert into biodanza.exercise_music (%s) select %s from biodanza.snap_exercise_music_20261120', cols, cols);

  delete from biodanza.exercise_texts where exercise_id in (select id from biodanza.snap_exercises_20261120);
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols from information_schema.columns where table_schema = 'biodanza' and table_name = 'snap_exercise_texts_20261120';
  execute format('insert into biodanza.exercise_texts (%s) select %s from biodanza.snap_exercise_texts_20261120', cols, cols);

  delete from biodanza.exercise_lines where exercise_id in (select id from biodanza.snap_exercises_20261120);
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols from information_schema.columns where table_schema = 'biodanza' and table_name = 'snap_exercise_lines_20261120';
  execute format('insert into biodanza.exercise_lines (%s) select %s from biodanza.snap_exercise_lines_20261120', cols, cols);
end
$restore$;

-- checks: the catalog equals the copy, the vivencias are unchanged
do $check$
declare bad int; v0 record; v1 record;
begin
  select count(*) into bad from (
    (select * from biodanza.exercises where owner_id is null except select * from biodanza.snap_exercises_20261120)
    union all (select * from biodanza.snap_exercises_20261120 except select * from biodanza.exercises where owner_id is null)) x;
  if bad > 0 then raise exception 'exercises differ from the copy: %', bad; end if;
  select count(*) into bad from (
    (select * from biodanza.categories except select * from biodanza.snap_categories_20261120)
    union all (select * from biodanza.snap_categories_20261120 except select * from biodanza.categories)) x;
  if bad > 0 then raise exception 'categories differ from the copy: %', bad; end if;
  select count(*) into bad from (
    (select em.* from biodanza.exercise_music em join biodanza.exercises e on e.id = em.exercise_id where e.owner_id is null except select * from biodanza.snap_exercise_music_20261120)
    union all (select * from biodanza.snap_exercise_music_20261120 except select em.* from biodanza.exercise_music em join biodanza.exercises e on e.id = em.exercise_id where e.owner_id is null)) x;
  if bad > 0 then raise exception 'music links differ from the copy: %', bad; end if;
  select count(*) into bad from (
    (select t.* from biodanza.exercise_texts t join biodanza.exercises e on e.id = t.exercise_id where e.owner_id is null except select * from biodanza.snap_exercise_texts_20261120)
    union all (select * from biodanza.snap_exercise_texts_20261120 except select t.* from biodanza.exercise_texts t join biodanza.exercises e on e.id = t.exercise_id where e.owner_id is null)) x;
  if bad > 0 then raise exception 'texts differ from the copy: %', bad; end if;
  select count(*) into bad from (
    (select l.* from biodanza.exercise_lines l join biodanza.exercises e on e.id = l.exercise_id where e.owner_id is null except select * from biodanza.snap_exercise_lines_20261120)
    union all (select * from biodanza.snap_exercise_lines_20261120 except select l.* from biodanza.exercise_lines l join biodanza.exercises e on e.id = l.exercise_id where e.owner_id is null)) x;
  if bad > 0 then raise exception 'lines differ from the copy: %', bad; end if;
  select * into v0 from _viv;
  select count(*) n, md5(coalesce(string_agg(v::text, '|' order by v.id), '')) h into v1 from biodanza.vivencia_items v;
  if v0.n <> v1.n or v0.h <> v1.h then raise exception 'a vivencia item changed, nothing was restored'; end if;
end
$check$;

commit;
