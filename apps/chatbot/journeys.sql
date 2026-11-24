-- The journeys of the chat, for the statistics window of the editor.
-- One row per visit (the anonymous id of a tab) and ad: when it opened, and every event in order
-- (open, a message shown, an option chosen, a link tapped). Nothing identifies the visitor.
-- Called straight from the editor with the signed-in user's token; only an admin of the chatbot gets data.
create or replace function public.chatbot_journeys(p_business text)
returns jsonb
language sql
stable
security definer
set search_path = public, chatbot
as $$
  select case when not public.chatbot_is_admin(auth.jwt() ->> 'email') then null else coalesce((
    select jsonb_agg(j order by j ->> 'at' desc) from (
      select jsonb_build_object(
        'ad', ad, 'gender', gender, 'at', min(at),
        'ev', jsonb_agg(jsonb_build_object('k', kind, 's', step, 'o', opt, 'l', label) order by at, id)
      ) j
      from chatbot.clicks
      where business = p_business and visit <> ''
      group by visit, ad, gender
      order by min(at) desc
      limit 2000
    ) x
  ), '[]'::jsonb) end;
$$;

revoke all on function public.chatbot_journeys(text) from public, anon;
grant execute on function public.chatbot_journeys(text) to authenticated;
