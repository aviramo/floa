-- Owner's order 2026-11-20: the rhythm tag of a song becomes two fields.
--   rhythm_char_tags  (many values allowed): Rhythmic, Melodic, Other   (Other = no rhythm, repetitive/monotonic, progressive, eurythmic)
--   rhythm_speed_tags (many values allowed): Slow, Medium, Fast        (very slow -> Slow, very fast -> Fast, "medium / slow" -> Medium + Slow, "slow and fast" -> Slow + Fast)
-- The old column rhythm_tags is NOT touched or dropped: it stays until the app reads the two new ones. Frozen copy first: biodanza.snap_music_before_split_20261120.
begin;
create table if not exists biodanza.snap_music_before_split_20261120 as select * from biodanza.music;
alter table biodanza.snap_music_before_split_20261120 enable row level security;
revoke all on biodanza.snap_music_before_split_20261120 from anon, authenticated;
alter table biodanza.music add column if not exists rhythm_char_tags text[] not null default '{}';
alter table biodanza.music add column if not exists rhythm_speed_tags text[] not null default '{}';
update biodanza.music m set
  rhythm_char_tags = array(select c from (values ('Rhythmic', 1), ('Melodic', 2), ('Other', 3)) k(c, o)
    where (k.c = 'Rhythmic' and m.rhythm_tags @> array['Rhythmic'])
       or (k.c = 'Melodic' and m.rhythm_tags @> array['Rhythm-Melodic'])
       or (k.c = 'Other' and m.rhythm_tags && array['No Rhythm', 'Rhythm-Repetitive - monotonic', 'Rhythm-Progressive', 'eurythmic'])
    order by k.o),
  rhythm_speed_tags = array(select s from (values ('Slow', 1), ('Medium', 2), ('Fast', 3)) k(s, o)
    where (k.s = 'Slow' and m.rhythm_tags && array['Rhythm-Slow', 'Rhythm-Very Slow', 'Rhythm- Medium / Slow', 'Rhythm- Slow and Fast'])
       or (k.s = 'Medium' and m.rhythm_tags && array['Rhythm-Medium', 'Rhythm- Medium / Slow'])
       or (k.s = 'Fast' and m.rhythm_tags && array['Rhythm-Fast', 'Rhythm-Very Fast', 'Rhythm- Slow and Fast'])
    order by k.o)
where m.owner_id is null and cardinality(m.rhythm_tags) > 0;
commit;
