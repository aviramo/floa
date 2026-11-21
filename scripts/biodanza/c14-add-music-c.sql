-- Owner-approved 2026-11-21 ("תסדר את השירים"): the five songs that the 2014 lists have and our music table lacked. The old program attaches exactly these codes to the same exercises.
-- Audio files read (never changed) from Desktop\yaron\Music IBF, uploaded to the private R2 bucket biodanza-audio under random names; title/artist/name from the 2014 PDF list, tags left empty.
-- Frozen copies before: biodanza.snap_music_before14h_20261121, snap_music_files_before14h_20261121, snap_exercise_music_before14h_20261121, snap_c14_exercises_before14h_20261121.
-- Undo: delete these five rows from music and music_files and their exercise_music links; delete the five objects from R2; restore c14 from the snapshot.
begin;
create table if not exists biodanza.snap_music_before14h_20261121 as select * from biodanza.music;
create table if not exists biodanza.snap_music_files_before14h_20261121 as select * from biodanza.music_files;
create table if not exists biodanza.snap_exercise_music_before14h_20261121 as select * from biodanza.exercise_music;
create table if not exists biodanza.snap_c14_exercises_before14h_20261121 as select * from biodanza.c14_exercises;
alter table biodanza.snap_music_before14h_20261121 enable row level security;
alter table biodanza.snap_music_files_before14h_20261121 enable row level security;
alter table biodanza.snap_exercise_music_before14h_20261121 enable row level security;
alter table biodanza.snap_c14_exercises_before14h_20261121 enable row level security;
revoke all on biodanza.snap_music_before14h_20261121, biodanza.snap_music_files_before14h_20261121, biodanza.snap_exercise_music_before14h_20261121, biodanza.snap_c14_exercises_before14h_20261121 from anon, authenticated;

create temp table _s(code text, obj text, title text, artist text, dur int, file_sec numeric, size bigint, coll text) on commit drop;
insert into _s values
 ('IBF15-14','a11c65efcf71419488a47671dbb2ceb0.mp3','Allegro con brio-Sinfonie 5 c-moll op.67-1 [Part]','Ludwig van Beethoven',89,88.604,2246656,'IBF'),
 ('BA45-16','9985b7aa7a234459b2b0b983afd33b37.mp3','Boléro [Part]','Eduardo Mata/Dallas Symphony Orchestra',490,489.93,19705984,'BA'),
 ('SCR09-10','7991b1b9dcec43b18342f5d0aea43d43.mp3','Wiegenlied op.49/4 (Piano transcription) Berceuse','Johannes Brahms',105,105.13,2525334,'SCR'),
 ('IBF10-19','b9528e028b60479a9c9e320281d0dc76.mp3','Slavonic Dance in e minor "Starodávny" [Part]- Slavonic Dances, op 72/2 (Allegretto Grazioso) (Antonín Dvořák)','Kurt Masur/New York Philharmonic',131,131.06,4390912,'IBF'),
 ('BA04-09','3df2e42693ef47cf868ab90cc770ed5c.mp3','An der schönen blauen Donau [BA Part], op.314','Johann Strauss',309,308.97,7417383,'BA');
do $c$ begin
  if exists (select 1 from _s s join biodanza.music m on m.owner_id is null and regexp_replace(upper(m.collection),'[ _]|^IBFC','','g') = regexp_replace(s.code,'[ _]','','g')) then raise exception 'a song with this code already exists'; end if;
end $c$;
insert into biodanza.music_files (object, code, collection, format, size_bytes) select obj, code, coll, 'mp3', size from _s;
insert into biodanza.music (name, title, artist, collection, duration_sec, file_sec, audio_object, in_catalog)
select title || ', ' || artist, title, artist, code, dur, file_sec, obj, true from _s;

create temp table _map(prefix text, code text) on commit drop;
insert into _map values ('Allegro con brio-Sinfonie 5','IBF15-14'),('Boléro [Part], Eduardo Mata','BA45-16'),('Wiegenlied op.49/4','SCR09-10'),('Slavonic Dance in e minor','IBF10-19'),('An der schönen blauen Donau [BA Part]','BA04-09');
create temp table _res on commit drop as
select mp.prefix, (select array_agg(m.id) from biodanza.music m where m.owner_id is null and regexp_replace(upper(m.collection),'[ _]|^IBFC','','g') = regexp_replace(mp.code,'[ _]','','g')) ids from _map mp;
do $c$ begin if exists (select 1 from _res where ids is null or array_length(ids,1) <> 1) then raise exception 'a code does not resolve to one song'; end if; end $c$;

update biodanza.c14_exercises c set raw_sources = (
  select jsonb_agg(case when s->>'m' is null and r.ids is not null then s || jsonb_build_object('m', r.ids[1]::text) else s end order by o)
  from jsonb_array_elements(c.raw_sources) with ordinality t(s,o) left join _res r on (s->>'n') like r.prefix || '%')
where exists (select 1 from jsonb_array_elements(c.raw_sources) s where s->>'m' is null);

insert into biodanza.exercise_music (exercise_id, music_id, source)
select distinct on (e.id, regexp_replace(upper(m.collection),'[ _]|^IBFC','','g')) e.id, m.id, 'catalog2014'
from biodanza.c14_exercises c join biodanza.exercises e on e.id = c.catalog_exercise_id and e.source = 'catalog2014'
cross join lateral jsonb_array_elements(c.raw_sources) s join biodanza.music m on m.id = (s->>'m')::uuid
where not exists (select 1 from biodanza.exercise_music x join biodanza.music xm on xm.id = x.music_id
  where x.exercise_id = e.id and regexp_replace(upper(xm.collection),'[ _]|^IBFC','','g') = regexp_replace(upper(m.collection),'[ _]|^IBFC','','g'))
order by e.id, regexp_replace(upper(m.collection),'[ _]|^IBFC','','g'), m.id;
commit;
