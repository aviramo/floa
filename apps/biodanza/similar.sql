-- similar music, by walking the network: music - exercise - music - exercise - music.
-- Edges: the catalog (exercise_music, weight 1), and what facilitators really did in vivencias (the chosen song of an exercise, weight 2;
-- its other options, weight 1). An exercise of a vivencia is joined to its catalog exercise (base_id) when it has one, else it is its own node.
-- Every edge is divided by sqrt(degree of the music * degree of the exercise), so a song that sits everywhere does not link everything.
-- Two steps: the second counts half. A song the caller loved is lifted a little. Only scores come out: no vivencia, title or owner.
-- Not the caller's own uploads of others: a song that is not of the catalog is seen only by its owner.
create or replace function biodanza.similar_music(p_music uuid[])
returns table (music_id uuid, score double precision)
language sql stable security definer set search_path = biodanza, pg_temp as $$
  with raw as (
    select 'e:' || em.exercise_id::text as node, em.music_id, 1.0::float8 as w from exercise_music em
    union all
    select case when vi.exercise_id is not null then 'e:' || coalesce(ex.base_id, vi.exercise_id)::text else 'i:' || vi.id::text end, vi.music_id, 2.0::float8
      from vivencia_items vi left join exercises ex on ex.id = vi.exercise_id where vi.music_id is not null
    union all
    select case when vi.exercise_id is not null then 'e:' || coalesce(ex.base_id, vi.exercise_id)::text else 'i:' || vi.id::text end, o.music_id, 1.0::float8
      from item_music_options o join vivencia_items vi on vi.id = o.item_id left join exercises ex on ex.id = vi.exercise_id
  ),
  seen as (select m.id from music m where m.in_catalog is not false or m.owner_id = (select auth.uid()) or m.id = any (p_music)),
  e as (select r.node, r.music_id, sum(r.w) as w from raw r join seen s on s.id = r.music_id group by r.node, r.music_id),
  dm as (select music_id, sum(w) as d from e group by music_id),
  dn as (select node, sum(w) as d from e group by node),
  n as (select e.node, e.music_id, e.w / sqrt(dm.d * dn.d) as w from e join dm using (music_id) join dn using (node)),
  seeds as (select distinct unnest(p_music) as music_id),
  h1n as (select n.node, sum(n.w) as s from n join seeds using (music_id) group by n.node),
  h1m as (select n.music_id, sum(h1n.s * n.w) as s from n join h1n using (node) group by n.music_id),
  h2n as (select n.node, sum(h1m.s * n.w) as s from n join h1m using (music_id) group by n.node),
  h2m as (select n.music_id, sum(h2n.s * n.w) as s from n join h2n using (node) group by n.music_id)
  select h1m.music_id,
         (h1m.s + 0.5 * coalesce(h2m.s, 0)) * case when exists (select 1 from song_likes l where l.music_id = h1m.music_id and l.user_id = (select auth.uid())) then 1.25 else 1.0 end as score
  from h1m left join h2m using (music_id)
  where h1m.music_id not in (select music_id from seeds)
  order by score desc
  limit 80
$$;
revoke all on function biodanza.similar_music(uuid[]) from public, anon;
grant execute on function biodanza.similar_music(uuid[]) to authenticated;
