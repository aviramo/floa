-- A link names its campaign by separate parameters: the pain and one parameter per segment dimension (today only gender, tomorrow maybe age).
-- This finds the active campaign whose topic and segment equal what the link carries, and returns its full session context.
-- New function only: it calls the existing public.chatbot_session_context and changes nothing else. service_role only, like the others.
create or replace function public.chatbot_session_context_for(p_business text, p_topic text, p_segment jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, chatbot as $$
declare cid text;
begin
  select id into cid from chatbot.campaigns
   where business = p_business and topic_id = p_topic and segment_filters = coalesce(p_segment, '{}'::jsonb) and status = 'active'
   order by created_at limit 1;
  if cid is null then return null; end if;
  return public.chatbot_session_context(p_business, cid);
end $$;

revoke all on function public.chatbot_session_context_for(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.chatbot_session_context_for(text, text, jsonb) to service_role;
