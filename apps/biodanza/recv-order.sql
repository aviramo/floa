-- the order of the start and end music of a vivencia: a place in the list (until now it was by the time it was added)
alter table biodanza.vivencia_reception_music add column if not exists position int;
update biodanza.vivencia_reception_music r set position = x.p
  from (select vivencia_id, kind, music_id, row_number() over (partition by vivencia_id, kind order by created_at) as p from biodanza.vivencia_reception_music) x
  where r.vivencia_id = x.vivencia_id and r.kind = x.kind and r.music_id = x.music_id and r.position is null;
