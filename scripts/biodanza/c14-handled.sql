-- Marks which 2014 exercises are fully handled: exact match and every song of its PDF list is on the catalog exercise (by music id or by the same audio file).
-- done = all songs linked; partial = at least one song could not be added. NULL = not handled (strong, possible, none).
alter table biodanza.c14_exercises add column if not exists handled text;
update biodanza.c14_exercises c set handled = case
  when c.catalog_match is distinct from 'exact' then null
  when not exists (
    select 1 from jsonb_array_elements(c.raw_sources) s
    where s->>'m' is null or not exists (
      select 1 from biodanza.exercise_music em join biodanza.music m on m.id = em.music_id
      join biodanza.music t on t.id = (s->>'m')::uuid
      where em.exercise_id = c.catalog_exercise_id and (em.music_id = t.id or (t.audio_object is not null and m.audio_object = t.audio_object)))
  ) then 'done' else 'partial' end;
