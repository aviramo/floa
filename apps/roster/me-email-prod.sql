-- PRODUCTION VERSION of me-email.sql (narrowed). Needs prod-columns.sql first (business_settings.email_link).
-- The pre-link table and roster.me_link_email are new. roster.me is replaced by the production body PLUS one guarded branch: for a business whose
-- business_settings.email_link is off the branch is never entered, so me answers exactly as the production version does. The switch defaults to on
-- (prod-columns.sql), and production has it on for every business today.
-- me_link_email also checks the switch itself and returns null when it is off.
create table if not exists roster.member_links (
  business_id    uuid not null references roster.businesses(id) on delete cascade,
  email          text not null check (email = lower(btrim(email)) and email <> ''),
  participant_id uuid not null,
  status         text not null default 'approved' check (status in ('approved', 'blocked')),
  created_at     timestamptz not null default now(),
  primary key (business_id, email),
  constraint roster_member_links_participant_fk foreign key (business_id, participant_id) references roster.participants (business_id, id) on delete cascade
);
alter table roster.member_links enable row level security;
revoke all on roster.member_links from public, anon, authenticated;

create or replace function roster.me_link_email(p_business uuid)
returns uuid language plpgsql security definer set search_path = roster, public as $fn$
declare
  uid uuid := auth.uid(); em text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  gname text := left(coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''), nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''), ''), 120);
  m roster.members; ln roster.member_links; pid uuid; n int; pa roster.participants; acct text; pre boolean := false;
begin
  if uid is null or em = '' or p_business is null then return null; end if;
  if not coalesce((select s.email_link from roster.business_settings s where s.business_id = p_business), false) then return null; end if;   -- the business has not turned this on
  if not exists (select 1 from auth.users u where u.id = uid and u.email_confirmed_at is not null and lower(u.email) = em) then return null; end if;
  select * into m from roster.members where business_id = p_business and user_id = uid;
  if m.user_id is not null and (m.status in ('blocked', 'removed') or m.participant_id is not null) then return null; end if;
  select * into ln from roster.member_links where business_id = p_business and email = em;
  if found then
    if ln.status <> 'approved' then return null; end if;
    pid := ln.participant_id; pre := true;
  else
    select count(*), min(id::text)::uuid into n, pid from roster.participants where business_id = p_business and active and lower(btrim(email)) = em;
    if n <> 1 then return null; end if;
  end if;
  select * into pa from roster.participants where id = pid and business_id = p_business;
  if not found then return null; end if;
  perform set_config('roster.source', 'me', true);
  acct := jsonb_build_object('email', em, 'name', gname)::text;
  if exists (select 1 from roster.members x where x.business_id = p_business and x.participant_id = pid and x.user_id <> uid and x.status in ('approved', 'blocked')) then
    if roster.rate_take('me_email_conflict:' || uid || ':' || p_business, 60, 1) = 0 then
      perform roster.emit(p_business, 'participant.phone_conflict', jsonb_build_object('participant', roster.participant_json(pa), 'google', acct::jsonb, 'account', acct::jsonb));
      perform roster.sys_note(p_business, pid, 'חשבון גוגל נוסף ניסה להתחבר עם האימייל הזה (' || em || ') ולא חובר', 'phone_conflict');
    end if;
    return null;
  end if;
  begin
    insert into roster.members (business_id, user_id, email, google_name, participant_id, status) values (p_business, uid, em, gname, pid, 'approved')
      on conflict (business_id, user_id) do update set participant_id = excluded.participant_id, status = 'approved', email = excluded.email, google_name = excluded.google_name;
  exception when unique_violation then
    return null;
  end;
  if pre then delete from roster.member_links where business_id = p_business and email = em; end if;
  perform roster.sys_note(p_business, pid, 'חשבון גוגל חובר לפי אימייל: ' || em, 'google_linked');
  perform roster.emit(p_business, 'participant.linked', jsonb_build_object('participant', roster.participant_json(pa), 'account', acct::jsonb));
  return pid;
end $fn$;
revoke all on function roster.me_link_email(uuid) from public, anon, authenticated;

create or replace function roster.me(p_slug text)
returns jsonb language plpgsql security definer set search_path = roster, public as $fn$
declare
  r jsonb := roster.me_resolve(p_slug, true); st text := r->>'status'; b uuid := nullif(r->>'business_id', '')::uuid; pid uuid := nullif(r->>'participant_id', '')::uuid;
  bz roster.businesses; s roster.business_settings; pa roster.participants; binfo jsonb; linked uuid;
begin
  if st = 'none' and b is not null and coalesce((select x.email_link from roster.business_settings x where x.business_id = b), false) then   -- a signed-in account with no participant yet: its verified email may find exactly one
    linked := roster.me_link_email(b);
    if linked is not null then r := roster.me_resolve(p_slug, true); st := r->>'status'; pid := nullif(r->>'participant_id', '')::uuid; end if;
  end if;
  if st = 'auth' then return jsonb_build_object('status', 'auth'); end if;
  if st = 'not_found' then return jsonb_build_object('status', 'unknown_business'); end if;
  select * into bz from roster.businesses where id = b;
  s := roster.settings_of(b);
  binfo := jsonb_build_object('name', bz.name, 'payment_url', s.payment_url, 'contact_whatsapp', s.contact_whatsapp);
  if st <> 'ok' then return jsonb_build_object('status', st, 'business', binfo); end if;   -- none | blocked | disabled
  select * into pa from roster.participants where id = pid and business_id = b;   -- a removed participant still sees the area, and stays removed
  if not found then return jsonb_build_object('status', 'none', 'business', binfo); end if;
  return jsonb_build_object('status', 'ok', 'business', binfo,
    'participant', jsonb_build_object('id', pa.id, 'first_name', pa.first_name, 'last_name', pa.last_name, 'phone', pa.phone, 'email', pa.email, 'address', pa.address,
                                      'age', roster.current_age(pa.age, pa.age_set_at), 'gender', pa.gender),
    'balance', roster.balance_money(b, pid), 'sessions', roster.sessions(b, pid), 'passes', roster.passes_json(b),
    'meetings', roster.person_meetings_me(b, pid));
end $fn$;
