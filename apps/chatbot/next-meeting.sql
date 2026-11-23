-- The chatbot engine reads the next meeting of a business straight from the roster schema, not through the public roster API.
-- Read only, one new function in public. Touches no table, no existing function, no grant of anything else.
-- service_role only: the engine runs as an Edge Function in this same project. Not callable from a browser.
-- Run: node scripts/sql.mjs < apps/chatbot/next-meeting.sql
create or replace function public.chatbot_next_meeting(p_business text) returns jsonb
language sql stable security definer set search_path = roster, public as $$
  select jsonb_build_object(
           'date', m.meeting_date, 'time', m.meeting_time, 'name', m.name,
           'city', m.city, 'place', m.place, 'capacity', m.max_participants, 'price_tiers', m.price_tiers)
    from roster.meetings m
    join roster.businesses b on b.id = m.business_id
   where b.slug = p_business and m.meeting_date >= (now() at time zone 'Asia/Jerusalem')::date
   order by m.meeting_date, m.meeting_time
   limit 1 $$;

revoke all on function public.chatbot_next_meeting(text) from public, anon, authenticated;
grant execute on function public.chatbot_next_meeting(text) to service_role;
