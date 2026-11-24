-- The rule-violation log of the chatbot engine (all businesses). Every time the agent broke a hard rule and the server corrected it,
-- a row is written: which rule, what the agent wrote, what the visitor got instead, and whether the correction held.
-- Read it with: node scripts/chatbot.mjs violations [days]
-- Like every table of this schema: RLS on, no policy, no grant to anon or authenticated. Written only through the function below (service role).

create table if not exists chatbot.violations (
  id bigserial primary key,
  at timestamptz not null default now(),
  business text not null,
  session text,
  rule text not null,
  before text,
  after text,
  fixed boolean not null default true
);
create index if not exists violations_at_idx on chatbot.violations (at desc);
create index if not exists violations_rule_idx on chatbot.violations (business, rule, at desc);
alter table chatbot.violations enable row level security;
revoke all on chatbot.violations from public, anon, authenticated;

create or replace function public.chatbot_violation(p_business text, p_session text, p_rule text, p_before text, p_after text, p_fixed boolean)
returns void language sql security definer set search_path = public, chatbot as $$
  insert into chatbot.violations(business, session, rule, before, after, fixed)
  values (left(p_business, 40), left(p_session, 60), left(p_rule, 60), left(p_before, 1500), left(p_after, 1500), coalesce(p_fixed, true));
  -- the log keeps 90 days
  delete from chatbot.violations where at < now() - interval '90 days' and random() < 0.01;
$$;
revoke all on function public.chatbot_violation(text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.chatbot_violation(text, text, text, text, text, boolean) to service_role;
