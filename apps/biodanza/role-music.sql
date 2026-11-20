-- music suggested for a vivencia's start or end slot, by ROLE: songs that facilitators really used as the start (or end) music of a vivencia.
-- Score = in how many different vivencias the song was that kind of reception music (a repeat in one vivencia counts once). Only scores come out: no vivencia, title or owner.
-- A song that is not of the catalog is seen only by its owner (same rule as similar_music).
create or replace function biodanza.role_music(p_kind text)
returns table (music_id uuid, score double precision)
language sql stable security definer set search_path = biodanza, pg_temp as $$
  select r.music_id, count(distinct r.vivencia_id)::float8 as score
  from vivencia_reception_music r
  join music m on m.id = r.music_id
  where r.kind = p_kind and p_kind in ('start', 'end')
    and (m.in_catalog is not false or m.owner_id = (select auth.uid()))
  group by r.music_id
  order by score desc, r.music_id
  limit 80
$$;
revoke all on function biodanza.role_music(text) from public, anon;
grant execute on function biodanza.role_music(text) to authenticated;
