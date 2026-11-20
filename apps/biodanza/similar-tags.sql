-- Similar music: the usage network (as in similar.sql) refined by the four tags of a song: line, character, speed, effect.
-- Why these weights: among songs used together in the same exercise the four tags agree about equally more than among random pairs (Jaccard 0.43 vs 0.26 line,
-- 0.63 vs 0.46 character, 0.52 vs 0.36 speed, 0.29 vs 0.13 effect), so they count equally. A missing tag never counts against a song.
-- The previous version is apps/biodanza/similar.sql.
create or replace function biodanza._jac(a text[], b text[]) returns float8
  language sql immutable parallel safe as $$
  select case when coalesce(cardinality(a), 0) = 0 or coalesce(cardinality(b), 0) = 0 then null
    else (select count(*) from unnest(a) t where t = any (b))::float8
         / (cardinality(a) + cardinality(b) - (select count(*) from unnest(a) t where t = any (b))) end $$;

-- speed is an order, not a set: the same speed is 1, a neighbour (slow and medium, medium and fast) a quarter, slow and fast nothing
create or replace function biodanza._speed_sim(a text[], b text[]) returns float8
  language sql immutable parallel safe as $$
  select case when coalesce(cardinality(a), 0) = 0 or coalesce(cardinality(b), 0) = 0 then null
    else (select case min(abs(x.r - y.r)) when 0 then 1.0 when 1 then 0.25 else 0.0 end
            from (select case t when 'Slow' then 0 when 'Medium' then 1 when 'Fast' then 2 end r from unnest(a) t) x,
                 (select case t when 'Slow' then 0 when 'Medium' then 1 when 'Fast' then 2 end r from unnest(b) t) y
           where x.r is not null and y.r is not null) end $$;

create or replace function biodanza.similar_music(p_music uuid[])
 returns table(music_id uuid, score double precision)
 language sql stable security definer set search_path to 'biodanza', 'pg_temp'
as $$
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
  h2m as (select n.music_id, sum(h2n.s * n.w) as s from n join h2n using (node) group by n.music_id),
  -- 1. how the songs are used together: the walk over the network, as before
  usage as (select h1m.music_id, h1m.s + 0.5 * coalesce(h2m.s, 0) as s from h1m left join h2m using (music_id) where h1m.music_id not in (select music_id from seeds)),
  umax as (select max(s) as m from usage),
  -- 2. how the songs sound: the four tags (line, character, speed, effect), against the NEAREST song of the seeds
  cand as (select m.id, m.line_tags l, m.rhythm_char_tags c, m.rhythm_speed_tags sp, m.effect_tags ef from music m where m.id in (select id from seen) and m.id not in (select music_id from seeds)),
  sd as (select m.id, m.line_tags l, m.rhythm_char_tags c, m.rhythm_speed_tags sp, m.effect_tags ef from music m where m.id in (select music_id from seeds)),
  pr as (
    select c.id cid, s.id sid,
           (select count(*) from unnest(x.arr) v where v is not null) nd,
           (select coalesce(sum(v), 0) from unnest(x.arr) v) sm
      from cand c cross join sd s
      cross join lateral (select array[biodanza._jac(c.l, s.l), biodanza._jac(c.c, s.c), biodanza._speed_sim(c.sp, s.sp), biodanza._jac(c.ef, s.ef)] arr) x
  ),
  -- a tag that is missing says nothing (it never counts against a song): the missing ones are filled with 0.3, what two songs picked at random share on average
  best as (
    select distinct on (cid) cid, nd, adj from (select cid, nd, (sm + (4 - nd) * 0.3) / 4 as adj from pr where nd >= 1) q order by cid, adj desc
  ),
  fin as (
    select coalesce(u.music_id, b.cid) as music_id,
           case when u.music_id is not null
                then (u.s / um.m) * (case when b.cid is not null then least(1.5, greatest(0.8, 0.8 + 0.8 * b.adj)) else 1.0 end)   -- used together: the tags raise or lower it a little
                else 0.25 * greatest(0, (b.adj - 0.35) / 0.65)                                                                 -- never used: only the tags, and at most a quarter of the best
           end as sc
      from usage u full join best b on b.cid = u.music_id cross join umax um
     where u.music_id is not null or (b.nd >= 2 and b.adj >= 0.5)
  )
  select f.music_id,
         f.sc * case when exists (select 1 from song_likes l where l.music_id = f.music_id and l.user_id = (select auth.uid())) then 1.25 else 1.0 end as score
    from fin f
   where f.sc > 0 and f.music_id not in (select music_id from seeds)
   order by score desc
   limit 80
$$;
