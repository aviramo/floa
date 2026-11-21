-- Correction 2026-11-21: the 2014 entry "Allegro con brio-Sinfonie 5 c-moll op.67-1 [Part]" had been linked to BA04-08 by name. The old program attaches code IBF15-14 (a different recording that our music table does not have yet), so the link is removed again. No exercise_music row was ever written from it.
begin;
update biodanza.c14_exercises c set raw_sources = (
  select jsonb_agg(case when s->>'m' = (select id::text from biodanza.music where regexp_replace(upper(collection),'[ _]','','g')='BA04-08' and owner_id is null) and s->>'n' like 'Allegro con brio-Sinfonie 5%' then s - 'm' else s end order by o)
  from jsonb_array_elements(c.raw_sources) with ordinality t(s,o))
where exists (select 1 from jsonb_array_elements(c.raw_sources) s where s->>'n' like 'Allegro con brio-Sinfonie 5%' and s->>'m' is not null);
commit;
