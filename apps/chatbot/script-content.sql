-- The static texts of the scripted chat (all businesses): the five messages, their options and reactions, per pain, as one JSON document per version.
-- Visitors never touch this table: the chat function reads the published version (mode "script") and the page shows it.
-- Same as every table of this schema: RLS on, no policy, no grant to anon or authenticated, access only through the function below (service role).
-- Publish a new version: node scripts/chatbot-script.mjs push <business> <file.json>   (the previous one stays, so it can be put back)

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
