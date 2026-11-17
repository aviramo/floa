-- Harpatka gap file 2: roster.meeting_json answers an 'image' key (the meeting's picture, else its type's), ONLY when there is one.
-- Replaces the existing function (same signature, same security, same body otherwise), so run it AFTER prod-harpatka-gaps.sql.
-- For a business without pictures (AUM) the answer is byte-for-byte what it was: the key is added only when a picture exists.
-- Rollback: create or replace the previous body (saved before running; the production definition of 2026-11-17 is in the roster backup).
create or replace function roster.meeting_json(m roster.meetings, secret boolean, today date)
returns jsonb language plpgsql stable security definer set search_path = roster, public as $fn$
declare tname text; timg text; reg int; cap int := m.max_participants; o jsonb;
begin
  select name, nullif(btrim(image_url), '') into tname, timg from meeting_types where id = m.type_id and business_id = m.business_id;
  reg := registered_count(m.business_id, m.id);
  o := jsonb_build_object('id', m.id, 'date', to_char(m.meeting_date, 'YYYY-MM-DD'), 'time', to_char(m.meeting_time, 'HH24:MI'),
    'name', coalesce(nullif(btrim(m.name), ''), nullif(btrim(tname), '')), 'city', m.city, 'place', m.place,
    'capacity', cap, 'spots_left', case when cap is null then null else greatest(cap - reg, 0) end,
    'full', coalesce(cap is not null and reg >= cap, false),
    'price', meeting_price(m.price_tiers, greatest(m.meeting_date - today, 0)), 'price_tiers', m.price_tiers);
  -- the picture of the meeting, else of its type; the key is there only when there is one (a business without pictures answers exactly as before)
  if coalesce(nullif(btrim(m.image_url), ''), timg) is not null then o := o || jsonb_build_object('image', coalesce(nullif(btrim(m.image_url), ''), timg)); end if;
  if secret then
    o := o || jsonb_build_object('directions', m.directions, 'registered', reg,
      'type', tname);   -- the meeting type's NAME, or null
  end if;
  return o;
end $fn$;
