-- Owner-approved 2026-11-21 (links follow the old program): Corcovado (feat. Astrud Gilberto) -> IBF14-02 and the two Danube [Part] entries -> IBF07-21, because the old program attaches exactly these songs to the same exercises. Entries whose old-program song is not in our music table stay open.
-- Frozen copies before: biodanza.snap_c14_exercises_before14f_20261121, snap_exercise_music_before14f_20261121. Undo: restore from them.
begin;
create table if not exists biodanza.snap_c14_exercises_before14f_20261121 as select * from biodanza.c14_exercises;
create table if not exists biodanza.snap_exercise_music_before14f_20261121 as select * from biodanza.exercise_music;
alter table biodanza.snap_c14_exercises_before14f_20261121 enable row level security;
alter table biodanza.snap_exercise_music_before14f_20261121 enable row level security;
revoke all on biodanza.snap_c14_exercises_before14f_20261121, biodanza.snap_exercise_music_before14f_20261121 from anon, authenticated;

create temp table _map(prefix text, code text) on commit drop;
insert into _map values
 ('Corcovado (feat. Astrud Gilberto)','IBF14-02'),('An der schönen blauen Donau, op.314 [Part]','IBF07-21');
create temp table _res on commit drop as
select mp.prefix, mp.code, (select array_agg(m.id) from biodanza.music m where m.owner_id is null and regexp_replace(upper(m.collection),'[ _]|^IBFC','','g') = regexp_replace(mp.code,'[ _]','','g')) ids from _map mp;
do $c$ begin
  if exists (select 1 from _res where ids is null or array_length(ids,1) <> 1) then raise exception 'a code does not resolve to exactly one song: %', (select string_agg(code,',') from _res where ids is null or array_length(ids,1) <> 1); end if;
end $c$;

update biodanza.c14_exercises c set raw_sources = (
  select jsonb_agg(case when s->>'m' is null and r.ids is not null then s || jsonb_build_object('m', r.ids[1]::text) else s end order by o)
  from jsonb_array_elements(c.raw_sources) with ordinality t(s,o)
  left join _res r on (s->>'n') like r.prefix || '%')
where exists (select 1 from jsonb_array_elements(c.raw_sources) s where s->>'m' is null);

insert into biodanza.exercise_music (exercise_id, music_id, source)
select distinct on (e.id, regexp_replace(upper(m.collection),'[ _]|^IBFC','','g')) e.id, m.id, 'catalog2014'
from biodanza.c14_exercises c join biodanza.exercises e on e.id = c.catalog_exercise_id and e.source = 'catalog2014'
cross join lateral jsonb_array_elements(c.raw_sources) s
join biodanza.music m on m.id = (s->>'m')::uuid
where not exists (select 1 from biodanza.exercise_music x join biodanza.music xm on xm.id = x.music_id
  where x.exercise_id = e.id and regexp_replace(upper(xm.collection),'[ _]|^IBFC','','g') = regexp_replace(upper(m.collection),'[ _]|^IBFC','','g'))
order by e.id, regexp_replace(upper(m.collection),'[ _]|^IBFC','','g'), m.id;
commit;
