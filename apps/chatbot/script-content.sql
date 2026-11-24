-- The static texts of the scripted chat (all businesses): the five messages, their options and reactions, per pain, as one JSON document per version.
-- Visitors never touch this table: the chat function reads the published version (mode "script") and the page shows it.
-- Same as every table of this schema: RLS on, no policy, no grant to anon or authenticated, access only through the function below (service role).
-- Publish a new version: node scripts/chatbot-script.mjs push <business> <file.json>   (the previous one stays, so it can be put back)

create schema if not exists chatbot;
create table if not exists chatbot.script_versions (
  id bigserial primary key,
  business text not null,
  version int not null,
  content jsonb not null,
  published boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  unique (business, version)
);
alter table chatbot.script_versions enable row level security;
revoke all on chatbot.script_versions from public, anon, authenticated;

create or replace function public.chatbot_script(p_business text)
returns jsonb language sql stable security definer set search_path = public, chatbot as $$
  select jsonb_build_object('version', version, 'content', content)
  from chatbot.script_versions
  where business = p_business and published
  order by version desc limit 1;
$$;
revoke all on function public.chatbot_script(text) from public, anon, authenticated;
grant execute on function public.chatbot_script(text) to service_role;

-- ---- who may edit, and the functions the editor uses (all through the chat function, which checks the signed in person's email against this table)
create table if not exists chatbot.admins (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table chatbot.admins enable row level security;
revoke all on chatbot.admins from public, anon, authenticated;

create or replace function public.chatbot_is_admin(p_email text)
returns boolean language sql stable security definer set search_path = public, chatbot as $$
  select exists (select 1 from chatbot.admins where lower(email) = lower(coalesce(p_email, '')));
$$;

create or replace function public.chatbot_script_versions(p_business text)
returns jsonb language sql stable security definer set search_path = public, chatbot as $$
  select coalesce(jsonb_agg(jsonb_build_object('version', version, 'published', published, 'note', note, 'created_at', created_at) order by version desc), '[]'::jsonb)
  from chatbot.script_versions where business = p_business;
$$;

create or replace function public.chatbot_script_get(p_business text, p_version int)
returns jsonb language sql stable security definer set search_path = public, chatbot as $$
  select jsonb_build_object('version', version, 'published', published, 'content', content)
  from chatbot.script_versions
  where business = p_business and (case when p_version is null then published else version = p_version end)
  order by version desc limit 1;
$$;

create or replace function public.chatbot_script_save(p_business text, p_content jsonb, p_note text)
returns int language plpgsql security definer set search_path = public, chatbot as $$
declare v int;
begin
  select coalesce(max(version), 0) + 1 into v from chatbot.script_versions where business = p_business;
  update chatbot.script_versions set published = false where business = p_business;
  insert into chatbot.script_versions(business, version, content, published, note) values (p_business, v, p_content, true, left(p_note, 200));
  return v;
end $$;

create or replace function public.chatbot_script_publish(p_business text, p_version int)
returns boolean language plpgsql security definer set search_path = public, chatbot as $$
begin
  if not exists (select 1 from chatbot.script_versions where business = p_business and version = p_version) then return false; end if;
  update chatbot.script_versions set published = (version = p_version) where business = p_business;
  return true;
end $$;

revoke all on function public.chatbot_is_admin(text), public.chatbot_script_versions(text), public.chatbot_script_get(text, int), public.chatbot_script_save(text, jsonb, text), public.chatbot_script_publish(text, int) from public, anon, authenticated;
grant execute on function public.chatbot_is_admin(text), public.chatbot_script_versions(text), public.chatbot_script_get(text, int), public.chatbot_script_save(text, jsonb, text), public.chatbot_script_publish(text, int) to service_role;

-- The draft of the editor: one per business, shared by the editors, never shown to the visitors.
create table if not exists chatbot.script_drafts (business text primary key, content jsonb not null, by_email text, at timestamptz not null default now());
alter table chatbot.script_drafts enable row level security;
revoke all on chatbot.script_drafts from anon, authenticated;

create or replace function public.chatbot_script_draft_set(p_business text, p_content jsonb, p_by text) returns void language sql security definer set search_path = public, chatbot as $$
  insert into chatbot.script_drafts(business, content, by_email, at) values (p_business, p_content, left(p_by, 200), now())
  on conflict (business) do update set content = excluded.content, by_email = excluded.by_email, at = now();
$$;
create or replace function public.chatbot_script_draft_get(p_business text) returns jsonb language sql security definer set search_path = public, chatbot as $$
  select jsonb_build_object('content', content, 'by', by_email, 'at', at) from chatbot.script_drafts where business = p_business;
$$;
create or replace function public.chatbot_script_draft_clear(p_business text) returns void language sql security definer set search_path = public, chatbot as $$
  delete from chatbot.script_drafts where business = p_business;
$$;
revoke all on function public.chatbot_script_draft_set(text, jsonb, text), public.chatbot_script_draft_get(text), public.chatbot_script_draft_clear(text) from public, anon, authenticated;
grant execute on function public.chatbot_script_draft_set(text, jsonb, text), public.chatbot_script_draft_get(text), public.chatbot_script_draft_clear(text) to service_role;
