-- WhatsApp send list (added 2026-11-19, owner approved): an internal page of one business reads who to message and marks who was sent / must not be sent again.
-- Addition only: two new tables and three new functions. Nothing existing is touched. Reached ONLY by the Worker (service role); the browser has no access.
create table if not exists roster.wa_marks (
  business_id    uuid not null references roster.businesses(id) on delete cascade,
  participant_id uuid not null,
  sent_at        timestamptz,
  no_more        boolean not null default false,
  updated_at     timestamptz not null default now(),
  primary key (business_id, participant_id),
  foreign key (business_id, participant_id) references roster.participants (business_id, id) on delete cascade
);
create table if not exists roster.wa_settings (
  business_id uuid primary key references roster.businesses(id) on delete cascade,
  message     text not null default '' check (length(message) <= 4000),
  updated_at  timestamptz not null default now()
);
alter table roster.wa_marks enable row level security;
alter table roster.wa_settings enable row level security;
revoke all on roster.wa_marks, roster.wa_settings from anon, authenticated;

create or replace function roster.wa_list(p_slug text)
returns jsonb language sql stable set search_path = roster, public as $$
  select jsonb_build_object(
    'message', coalesce((select s.message from roster.wa_settings s where s.business_id = b.id), ''),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'phone', p.phone,
        'attended', (select count(*) from roster.attendance a where a.participant_id = p.id and a.business_id = p.business_id and a.attended),
        'sent_at', m.sent_at, 'no_more', coalesce(m.no_more, false)
      ) order by p.name)
      from roster.participants p
      left join roster.wa_marks m on m.business_id = p.business_id and m.participant_id = p.id
      where p.business_id = b.id and p.active and btrim(p.phone) <> ''), '[]'::jsonb))
  from roster.businesses b where b.slug = p_slug;
$$;

create or replace function roster.wa_mark(p_slug text, p_participant uuid, p_sent boolean, p_no_more boolean)
returns jsonb language plpgsql set search_path = roster, public as $$
declare b uuid; r roster.wa_marks;
begin
  select id into b from roster.businesses where slug = p_slug;
  if b is null or not exists (select 1 from roster.participants where id = p_participant and business_id = b) then return null; end if;
  insert into roster.wa_marks (business_id, participant_id, sent_at, no_more)
  values (b, p_participant, case when p_sent then now() end, coalesce(p_no_more, false))
  on conflict (business_id, participant_id) do update set
    sent_at = case when p_sent is null then roster.wa_marks.sent_at when p_sent then now() else null end,
    no_more = coalesce(p_no_more, roster.wa_marks.no_more),
    updated_at = now()
  returning * into r;
  return jsonb_build_object('id', r.participant_id, 'sent_at', r.sent_at, 'no_more', r.no_more);
end $$;

create or replace function roster.wa_message(p_slug text, p_message text)
returns jsonb language plpgsql set search_path = roster, public as $$
declare b uuid;
begin
  select id into b from roster.businesses where slug = p_slug;
  if b is null then return null; end if;
  insert into roster.wa_settings (business_id, message) values (b, left(coalesce(p_message, ''), 4000))
  on conflict (business_id) do update set message = excluded.message, updated_at = now();
  return jsonb_build_object('message', left(coalesce(p_message, ''), 4000));
end $$;

revoke all on function roster.wa_list(text), roster.wa_mark(text, uuid, boolean, boolean), roster.wa_message(text, text) from public, anon, authenticated;
grant execute on function roster.wa_list(text), roster.wa_mark(text, uuid, boolean, boolean), roster.wa_message(text, text) to service_role;
