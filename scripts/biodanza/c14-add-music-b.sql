-- Second run of the approved 2014 music step (2026-11-20): songs the 2014 catalog lists that our music table lacked.
-- 14 songs were added (file from the old program folder, name and code from the 2014 PDF); two more (IBF15-12, BA49-03) already existed under another spelling.
-- Frozen copies before: biodanza.snap_music_before14b_20261120, snap_music_files_before14b_20261120. Undo = delete the 'catalog2014' links of this run.
begin;
create table if not exists biodanza.snap_exercise_music_before14b_20261120 as select * from biodanza.exercise_music;
alter table biodanza.snap_exercise_music_before14b_20261120 enable row level security;
revoke all on biodanza.snap_exercise_music_before14b_20261120 from anon, authenticated;

create temp table _map(prefix text, code text) on commit drop;
insert into _map values
 ('Presto-Concerto ''L''estate''','IBF15-12'),('Crime Of The Century','MMU08-04'),('Voyage dans l''au','BA01-06'),
 ('Corcovado [Short version]','BA05-16'),('Fruta Boa','MMU07-05'),('Largo, Concerto in Re','MMU11-08'),
 ('Corcovado (Quiet','BA44-04'),('Largo-Concerto ''La primavera''','IBF15-15'),('Ness And His Family','BA29-13'),
 ('An der schönen blauen Donau, op.314 [Part]','IBF07-21'),('Larghetto (Transcr','IBF09-18'),('You Needed Me, Anne Murray/Shania','HLBC27-75'),
 ('Shine On You Crazy Diamond, Pts.1-5 [Part 2]','IBF18-13'),('Solo Sagrado [Part]','BA49-03'),('Boléro [end Part]','BA15-12'),('Aquele Abraço (','HLBC27-79');

create temp table _res on commit drop as
select mp.prefix, mp.code, (select m.id from biodanza.music m where m.owner_id is null and regexp_replace(upper(m.collection),'[ _]','','g') = mp.code) as mid
from _map mp;
do $c$ begin
  if exists (select 1 from _res where mid is null) then raise exception 'a song row is missing: %', (select string_agg(code,',') from _res where mid is null); end if;
  if (select count(*) from (select code from _res group by 1 having count(*)>1) x) > 0 then null; end if;
end $c$;

update biodanza.c14_exercises c set raw_sources = (
  select jsonb_agg(case when s->>'m' is null and r.mid is not null then jsonb_set(s,'{m}',to_jsonb(r.mid::text)) else s end order by ord)
  from jsonb_array_elements(c.raw_sources) with ordinality t(s,ord)
  left join lateral (select mid from _res where (s->>'n') like prefix || '%' order by length(prefix) desc limit 1) r on true)
where c.catalog_match='exact' and exists (select 1 from jsonb_array_elements(c.raw_sources) s where s->>'m' is null);

create temp table _add on commit drop as
select distinct c.catalog_exercise_id as exercise_id, (s->>'m')::uuid as music_id
from biodanza.c14_exercises c, jsonb_array_elements(c.raw_sources) s
join biodanza.music m on m.id = (s->>'m')::uuid
where c.catalog_match='exact' and s->>'m' is not null
  and not exists (select 1 from biodanza.exercise_music em where em.exercise_id=c.catalog_exercise_id and em.music_id=(s->>'m')::uuid)
  and not (m.audio_object is not null and exists (select 1 from biodanza.exercise_music em join biodanza.music m2 on m2.id=em.music_id where em.exercise_id=c.catalog_exercise_id and m2.audio_object=m.audio_object));

insert into biodanza.exercise_music (exercise_id, music_id, source) select exercise_id, music_id, 'catalog2014' from _add on conflict do nothing;

do $chk$
declare dup int; n int; before int;
begin
  select count(*) into n from _add;
  select count(*) into before from biodanza.snap_exercise_music_before14b_20261120;
  if (select count(*) from biodanza.exercise_music) <> before + n then raise exception 'row count is not before + added'; end if;
  select count(*) into dup from (select em.exercise_id, m.audio_object from biodanza.exercise_music em join biodanza.music m on m.id = em.music_id where m.audio_object is not null group by 1, 2 having count(*) > 1 and bool_or(em.source = 'catalog2014')) d;
  if dup > 0 then raise exception 'a double was created: %', dup; end if;
  if exists (select 1 from biodanza.c14_exercises c, jsonb_array_elements(c.raw_sources) s where c.catalog_match='exact' and s->>'m' is not null and not exists (select 1 from biodanza.music where id=(s->>'m')::uuid)) then raise exception 'bad m'; end if;
end
$chk$;
commit;
