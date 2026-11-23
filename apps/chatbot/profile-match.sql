-- A research profile now applies to every campaign whose segment contains the profile's own segment.
-- A profile with no segment ({}) is the knowledge of a pain for everyone (the owner's rule: women and men on the same pain share one source);
-- a profile with a segment (say a gender) wins over a general one for exactly that audience. No profile matches means no invented research.
-- Replaces public.chatbot_session_context only. Same name, same arguments, same result shape, same grants.
create or replace function public.chatbot_session_context(p_business text, p_campaign text)
returns jsonb language plpgsql stable security definer set search_path = public, chatbot as $$
declare c chatbot.campaigns; j chatbot.journeys; v uuid; prof jsonb; ins jsonb;
begin
  select * into c from chatbot.campaigns where business = p_business and id = p_campaign and status = 'active';
  if c.id is null then return null; end if;
  select * into j from chatbot.journeys where journey_type = c.journey_type and active;
  v := coalesce(c.content_version_id, (select id from chatbot.content_versions where journey_type = c.journey_type and status = 'active'));
  select to_jsonb(r) - 'content_version_id' into prof from chatbot.research_profiles r
   where r.content_version_id = v and r.topic_id = c.topic_id and r.segment_filters <@ c.segment_filters
   order by (select count(*) from jsonb_object_keys(r.segment_filters)) desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'body', i.body, 'confidence', i.confidence) order by i.approved_at desc), '[]'::jsonb) into ins
    from (select * from chatbot.insights i where i.business = p_business and i.status = 'approved' and i.journey_type = c.journey_type
            and (i.topic_id is null or i.topic_id = c.topic_id) and (i.segment_filters = '{}'::jsonb or i.segment_filters <@ c.segment_filters)
          order by i.approved_at desc limit 5) i;
  return jsonb_build_object('campaign', to_jsonb(c), 'journey', case when j.journey_type is null then null else to_jsonb(j) end,
                            'content_version_id', v, 'profile', prof, 'insights', ins);
end $$;
