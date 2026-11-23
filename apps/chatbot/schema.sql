-- chatbot: shared chatbot conversation logs, one row per conversation per business.
-- Additive only. Does not touch harpatka.* or any public.harpatka_* function.
-- Does NOT expose the schema to PostgREST (db_schemas untouched): access is via public RPC wrappers only.
begin;

create schema if not exists chatbot;

create table if not exists chatbot.logs (
  business   text        not null,
  id         uuid        not null,
  source     text,
  ad         text,
  messages   jsonb       not null default '[]'::jsonb,
  turns      integer     not null default 0,
  cta        text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business, id)
);
create index if not exists logs_business_updated_idx on chatbot.logs (business, updated_at desc);

-- conversations are personal data: RLS on, no policies, no grants to API roles.
alter table chatbot.logs enable row level security;
revoke all on schema chatbot from public, anon, authenticated;
revoke all on chatbot.logs from public, anon, authenticated;

-- copy existing harpatka rows (idempotent; safe to re-run for a final sync before cutover)
insert into chatbot.logs (business, id, source, ad, messages, turns, cta, created_at, updated_at)
select 'harpatka', id, source, ad, messages, turns, cta, created_at, updated_at
from harpatka.chat_logs
on conflict (business, id) do update
  set messages = excluded.messages, turns = excluded.turns,
      cta = coalesce(excluded.cta, chatbot.logs.cta), updated_at = excluded.updated_at;

-- owner check (same rule as public.harpatka_wa_chk)
create or replace function public.chatbot_owner_chk() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'ofir.aviram@gmail.com' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

-- write: service_role only (same as harpatka_chat_log)
create or replace function public.chatbot_log(p_business text, p_id uuid, p_source text, p_ad text, p_messages jsonb, p_cta text)
returns void language sql security definer set search_path = public, chatbot as $$
  insert into chatbot.logs(business, id, source, ad, messages, turns, cta)
  values (p_business, p_id, p_source, p_ad, coalesce(p_messages, '[]'::jsonb),
          (select count(*) from jsonb_array_elements(coalesce(p_messages, '[]'::jsonb)) e where e ->> 'role' = 'user'), p_cta)
  on conflict (business, id) do update
    set messages = excluded.messages, turns = excluded.turns,
        cta = coalesce(excluded.cta, chatbot.logs.cta), updated_at = now() $$;

-- read: owner only (same as harpatka_chat_logs_list)
create or replace function public.chatbot_logs_list(p_business text, p_limit integer default 200)
returns setof chatbot.logs language plpgsql stable security definer set search_path = public, chatbot as $$
begin
  perform public.chatbot_owner_chk();
  return query select * from chatbot.logs where business = p_business
    order by updated_at desc limit greatest(1, least(coalesce(p_limit, 200), 1000));
end $$;

revoke all on function public.chatbot_owner_chk() from public, anon, authenticated;
revoke all on function public.chatbot_log(text, uuid, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.chatbot_logs_list(text, integer) from public, anon;
grant execute on function public.chatbot_owner_chk() to service_role;
grant execute on function public.chatbot_log(text, uuid, text, text, jsonb, text) to service_role;
grant execute on function public.chatbot_logs_list(text, integer) to authenticated, service_role;

commit;
