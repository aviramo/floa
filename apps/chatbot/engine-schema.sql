-- Chatbot engine data layer, per the architecture spec (chapter 22). DRAFT, not run yet.
-- Additive only: new tables in the chatbot schema plus new columns on chatbot.logs.
-- Nothing here touches harpatka.*, roster.*, or an existing function. The schema stays unexposed to PostgREST:
-- every table has RLS on, no policy, and no grant to anon/authenticated. Access only through the RPCs at the bottom.
begin;

-- 22.12: dimensions a campaign may filter by (gender, relationship_status, later age...), with allowed values
create table if not exists chatbot.segment_dimensions (
  key     text primary key,
  kind    text not null check (kind in ('enum', 'range')),
  allowed jsonb not null default '[]'::jsonb,
  note    text
);
insert into chatbot.segment_dimensions (key, kind, allowed, note) values
  ('gender', 'enum', '["female","male"]', 'audience of the ad, never a fact about the visitor'),
  ('relationship_status', 'enum', '["partnered","single"]', 'no longer used: the owner dropped it (2026-11-24); gender is the only segment')
on conflict (key) do nothing;

-- 22.12: a journey type is configuration: its milestones, their goals and transition rules (the pain journey keeps the six milestones)
create table if not exists chatbot.journeys (
  journey_type text    not null,
  version      int     not null,
  definition   jsonb   not null,        -- { milestones: [{ id, goal, learn, done_when, branches }], ... }
  active       boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (journey_type, version)
);
create unique index if not exists journeys_one_active on chatbot.journeys (journey_type) where active;

-- 22.10: research as published versions. A new file becomes a new version; the active pointer flips only after approval.
create table if not exists chatbot.content_versions (
  id           uuid primary key default gen_random_uuid(),
  journey_type text not null,
  label        text,
  source_name  text,
  checksum     text,
  status       text not null default 'draft' check (status in ('draft', 'approved', 'active', 'archived')),
  created_at   timestamptz not null default now(),
  published_at timestamptz
);
create unique index if not exists content_one_active on chatbot.content_versions (journey_type) where status = 'active';

-- 22.2: one profile per (version, topic, segment): the pain card plus what Biodanza may offer, with an evidence grade A..D
create table if not exists chatbot.research_profiles (
  id                 uuid primary key default gen_random_uuid(),
  content_version_id uuid not null references chatbot.content_versions (id),
  topic_id           text not null,                 -- pain_id for the pain journey (stable across versions)
  segment_filters    jsonb not null default '{}'::jsonb,
  title              text not null,
  profile            jsonb not null,                -- fields of the stable content schema; missing = "not in source", never guessed
  summary            text,                          -- the short brief handed to a session (about 400-700 tokens)
  evidence           text check (evidence in ('A', 'B', 'C', 'D')),
  unique (content_version_id, topic_id, segment_filters)
);
create index if not exists research_topic_idx on chatbot.research_profiles (content_version_id, topic_id);

-- 22.11: campaigns resolve server-side from an opaque id; the browser never decides pain or segment
create table if not exists chatbot.campaigns (
  id                 text primary key,              -- the opaque value of ?pain= (existing ad keys stay valid)
  business           text not null,
  journey_type       text not null default 'pain',
  topic_id           text,
  segment_filters    jsonb not null default '{}'::jsonb,
  status             text not null default 'draft' check (status in ('draft', 'pending', 'active', 'paused', 'archived')),
  content_version_id uuid references chatbot.content_versions (id),
  journey_version    int,
  creative           jsonb not null default '{}'::jsonb,   -- ad sentence, image brief, image url
  note               text,
  created_at         timestamptz not null default now()
);

-- 22.4: every conversation remembers where it came from and the versions it ran on, plus the structured state
alter table chatbot.logs
  add column if not exists campaign_id text,
  add column if not exists journey_type text,
  add column if not exists topic_id text,
  add column if not exists segment_filters jsonb,
  add column if not exists content_version_id uuid,
  add column if not exists journey_version int,
  add column if not exists milestone text,
  add column if not exists readiness text,
  add column if not exists state jsonb not null default '{}'::jsonb,
  add column if not exists outcome text;

-- 22.4: events for the funnel (entry, milestone done, concern, click, end). Registration is only counted from a trusted source.
create table if not exists chatbot.events (
  id         bigint generated always as identity primary key,
  business   text not null,
  session_id uuid not null,
  type       text not null,
  milestone  text,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_session_idx on chatbot.events (business, session_id, created_at);
create index if not exists events_type_idx on chatbot.events (business, type, created_at);

-- 22.5 and 22.7: approved nightly insights, by journey/topic/segment, versioned. Only 'approved' ever reaches a session.
create table if not exists chatbot.insights (
  id              uuid primary key default gen_random_uuid(),
  business        text not null,
  journey_type    text not null,
  topic_id        text,
  segment_filters jsonb not null default '{}'::jsonb,
  version         int not null default 1,
  status          text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'retired')),
  body            text not null,
  window_from     date,
  window_to       date,
  observations    int,
  metric          text,
  confidence      text,
  suggested_test  text,
  content_version_id uuid,
  created_at      timestamptz not null default now(),
  approved_at     timestamptz
);

do $$ declare t text; begin
  foreach t in array array['segment_dimensions','journeys','content_versions','research_profiles','campaigns','events','insights'] loop
    execute format('alter table chatbot.%I enable row level security', t);
    execute format('revoke all on chatbot.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- the engine (service_role) loads everything about a session in one call
create or replace function public.chatbot_session_context(p_business text, p_campaign text)
returns jsonb language plpgsql stable security definer set search_path = public, chatbot as $$
declare c chatbot.campaigns; j chatbot.journeys; v uuid; prof jsonb; ins jsonb;
begin
  select * into c from chatbot.campaigns where business = p_business and id = p_campaign and status = 'active';
  if c.id is null then return null; end if;
  select * into j from chatbot.journeys where journey_type = c.journey_type and active;
  v := coalesce(c.content_version_id, (select id from chatbot.content_versions where journey_type = c.journey_type and status = 'active'));
  -- a profile applies when its segment is contained in the campaign's (see profile-match.sql); the most specific one wins, never a silent guess
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

-- state and funnel events written by the engine
create or replace function public.chatbot_state(p_business text, p_id uuid, p_state jsonb, p_milestone text, p_readiness text, p_outcome text default null)
returns void language sql security definer set search_path = public, chatbot as $$
  update chatbot.logs set state = coalesce(p_state, state), milestone = coalesce(p_milestone, milestone),
         readiness = coalesce(p_readiness, readiness), outcome = coalesce(p_outcome, outcome), updated_at = now()
   where business = p_business and id = p_id $$;

create or replace function public.chatbot_event(p_business text, p_session uuid, p_type text, p_milestone text, p_data jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public, chatbot as $$
  insert into chatbot.events (business, session_id, type, milestone, data) values (p_business, p_session, p_type, p_milestone, coalesce(p_data, '{}'::jsonb)) $$;

revoke all on function public.chatbot_session_context(text, text), public.chatbot_state(text, uuid, jsonb, text, text, text),
  public.chatbot_event(text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.chatbot_session_context(text, text), public.chatbot_state(text, uuid, jsonb, text, text, text),
  public.chatbot_event(text, uuid, text, text, jsonb) to service_role;

commit;
