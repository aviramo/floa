-- PRODUCTION STEP: the new function api_meetings_past (the Worker calls it only for ?past). roster.api_meetings(text, int) is NOT touched: no drop, no new signature next to it.
create or replace function roster.api_meetings_past(p_key_hash text, p_limit int default 20, p_past int default 0)
returns jsonb language plpgsql security definer set search_path = roster, public as $fn$
declare k roster.api_keys; bz roster.businesses; today date := roster.today(); lim int := least(greatest(coalesce(p_limit, 20), 1), 100); pst int := least(greatest(coalesce(p_past, 0), 0), 10);
begin
  k := roster.api_key_of(p_key_hash);
  if k.id is null then return jsonb_build_object('error', 'invalid_key'); end if;
  select * into bz from roster.businesses where id = k.business_id;
  return jsonb_build_object('business', jsonb_build_object('name', bz.name), 'meetings', coalesce((
    select jsonb_agg(roster.meeting_json(m, k.kind = 'secret', today) order by m.meeting_date, m.meeting_time)
      from roster.meetings m
     where m.id in (select x.id from roster.meetings x where x.business_id = k.business_id and x.meeting_date >= today
                     order by x.meeting_date, x.meeting_time limit lim)
        or (pst > 0 and m.id in (select y.id from roster.meetings y where y.business_id = k.business_id and y.meeting_date < today
                     order by y.meeting_date desc, y.meeting_time desc limit pst))), '[]'::jsonb));
end $fn$;
revoke all on function roster.api_meetings_past(text, int, int) from public, anon, authenticated;
grant execute on function roster.api_meetings_past(text, int, int) to service_role;
