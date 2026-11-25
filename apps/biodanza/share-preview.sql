-- The preview of a shared vivencia link (WhatsApp, Facebook and the like), 2026-11-25, by the owner's decision.
-- A crawler is never signed in, so it cannot read a vivencia through RLS. This one function gives whoever holds
-- the link (the id is in it) the vivencia's NAME and the NAMES of its exercises in order, and nothing else:
-- no music, no notes, no members, no texts. Items in the backlog are not part of the sequence.
-- The site's middleware (functions/_middleware.js) calls it and writes the answer into the page's og: tags.
create or replace function biodanza.share_preview(v uuid) returns json
  language sql stable security definer set search_path = biodanza, public as $$
  select json_build_object(
    'title', vv.title,
    'items', coalesce((
      select json_agg(coalesce(nullif(btrim(i.title), ''), nullif(e.title_he, ''), e.title_en) order by i.position)
      from biodanza.vivencia_items i left join biodanza.exercises e on e.id = i.exercise_id
      where i.vivencia_id = vv.id and not coalesce(i.backlog, false)
    ), '[]'::json))
  from biodanza.vivencias vv where vv.id = v
$$;
revoke all on function biodanza.share_preview(uuid) from public;
grant execute on function biodanza.share_preview(uuid) to anon, authenticated;
