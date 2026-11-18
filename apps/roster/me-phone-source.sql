-- me-phone-source.sql (owner-approved 2026-11-18, TEST FIRST)
-- Creating a participant WITH THE PHONE takes the same optional things whether the person is signed in with Google or not:
-- an email and the ad source (the ?s= code). Guests already send both in /signup/phone; this gives the signed-in path the same,
-- in the same call, so a failed second call (me_source) can no longer lose the source.
-- me_phone(p_slug, p_phone, p_meeting, p_email, p_source): the new 5-argument overload. The old 3-argument function keeps its
-- signature and answers and becomes a wrapper (null, null); no defaults on the new one, so no call can be ambiguous.
-- Not a public-API change: the answers do not change. An invalid email or an unknown code is ignored silently.
-- Source only when the participant has none yet. Written with the schema name roster; for roster-test replace it
-- (never copy a test definition to production).

create or replace function roster.me_phone(p_slug text, p_phone text, p_meeting uuid, p_email text, p_source text)
returns jsonb language plpgsql security definer set search_path = roster, public as $fn$
declare
  r jsonb := roster.me_resolve(p_slug, false); st text := r->>'status'; b uuid := nullif(r->>'business_id', '')::uuid; uid uuid := auth.uid();
  norm text := roster.normalize_phone(p_phone);
  em text := lower(coalesce(auth.jwt() ->> 'email', ''));
  gname text := left(coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''), nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''), ''), 120);
  m roster.members; pa roster.participants; pid uuid; act boolean; created boolean := false; react boolean := false; reg boolean := false; ast text;
  already boolean; acct text; bucket_me text;
  pem text := lower(btrim(coalesce(p_email, ''))); sc text := lower(btrim(coalesce(p_source, ''))); prid uuid;
begin
  if st <> 'ok' then return jsonb_build_object('status', st); end if;
  select * into m from roster.members where business_id = b and user_id = uid;
  if m.user_id is not null and m.status = 'blocked' then return jsonb_build_object('status', 'blocked'); end if;
  if norm = '' then return jsonb_build_object('status', 'invalid_phone'); end if;
  bucket_me := 'me_phone:' || uid || ':' || b;
  if roster.rate_take(bucket_me, 60, 30) > 0 then return jsonb_build_object('status', 'rate_limited'); end if;
  if roster.rate_take('me_try:' || b, 60, 600) > 0 then
    perform roster.rate_give_back(bucket_me);
    return jsonb_build_object('status', 'try_later');
  end if;
  perform set_config('roster.source', 'me', true);
  acct := jsonb_build_object('email', em, 'name', gname)::text;

  select id, active into pid, act from roster.participants where business_id = b and phone_norm = norm;
  if pid is not null and exists (select 1 from roster.members x where x.business_id = b and x.participant_id = pid and x.user_id <> uid and x.status in ('approved', 'blocked')) then
    select * into pa from roster.participants where id = pid;
    perform roster.emit(b, 'participant.phone_conflict', jsonb_build_object('participant', roster.participant_json(pa),
      'google', acct::jsonb, 'account', acct::jsonb));
    perform roster.sys_note(b, pid, 'חשבון גוגל נוסף ניסה להתחבר עם הטלפון הזה (' || em || ') ולא חובר', 'phone_conflict');
    return jsonb_build_object('status', 'phone_taken');
  end if;

  if pid is null then   -- a new participant: the phone only, the details come with me_complete
    if roster.rate_take('me_new:' || b, 60, 60) > 0 then
      perform roster.rate_give_back(bucket_me);
      perform roster.rate_give_back('me_try:' || b);
      return jsonb_build_object('status', 'try_later');
    end if;
    begin
      insert into roster.participants (business_id, first_name, last_name, phone, age_set_at) values (b, '', '', norm, roster.today()) returning id into pid;
      created := true;
    exception when unique_violation then
      select id, active into pid, act from roster.participants where business_id = b and phone_norm = norm;
    end;
  end if;
  already := m.user_id is not null and m.participant_id is not distinct from pid and m.status = 'approved';
  if created then
    perform roster.sys_note(b, pid, 'נרשם/ה דרך האזור האישי עם חשבון גוגל · טלפון ' || norm, 'registered');
  elsif not coalesce(act, true) then
    update roster.participants set active = true where id = pid and business_id = b;   -- the trigger notes it
    react := true;
  end if;

  -- optional, never an error: an email given with the phone (only when the participant has none) and the ad source (only when it has none yet).
  -- Same rules as me_source and the guest /signup/phone; what is invalid or unknown is ignored and the answer stays the same.
  if pem <> '' and roster.valid_email(pem) then
    begin
      update roster.participants set email = pem where id = pid and business_id = b and coalesce(email, '') = '';
    exception when unique_violation then null;   -- the email belongs to another participant of this business: not saved, nothing said
    end;
  end if;
  if sc <> '' and char_length(sc) <= 40 and sc !~ '[[:cntrl:]]' then
    select pr.id into prid from roster.promoters pr where pr.business_id = b and (lower(pr.code) = sc or sc = any (select lower(x) from unnest(coalesce(pr.codes, '{}'::text[])) x)) limit 1;
    if prid is not null then
      update roster.participants set source = 'site-ad', source_code = sc, promoter_id = prid where id = pid and business_id = b and promoter_id is null and coalesce(source_code, '') = '';
    end if;
  end if;

  if p_meeting is not null then
    ast := roster.attach(b, pid, p_meeting);
    reg := ast in ('registered', 'exists');
  end if;

  begin
    insert into roster.members (business_id, user_id, email, google_name, participant_id, status) values (b, uid, em, gname, pid, 'approved')
      on conflict (business_id, user_id) do update set participant_id = excluded.participant_id, status = 'approved', email = excluded.email, google_name = excluded.google_name;
  exception when unique_violation then
    return jsonb_build_object('status', 'phone_taken');
  end;
  perform roster.sys_note(b, pid, 'חשבון גוגל חובר לאזור האישי: ' || em, 'google_linked');

  select * into pa from roster.participants where id = pid;
  if not created and not already then   -- an account got linked to a participant that was already there: tell the admins
    perform roster.emit(b, 'participant.linked', jsonb_build_object('participant', roster.participant_json(pa), 'account', acct::jsonb));
  end if;
  return jsonb_build_object('status', case when created then 'created' when react then 'reactivated' else 'linked' end,
    'complete', (char_length(btrim(pa.first_name)) >= 2 and char_length(btrim(pa.last_name)) >= 2 and pa.age is not null and pa.gender is not null),
    'registered', reg) - case when p_meeting is null then 'registered' else '' end;   -- exactly {status, complete} unless a meeting was asked for
end $fn$;

create or replace function roster.me_phone(p_slug text, p_phone text, p_meeting uuid default null)
returns jsonb language sql security definer set search_path = roster, public as $fn$
  select roster.me_phone(p_slug, p_phone, p_meeting, null::text, null::text)
$fn$;

revoke all on function roster.me_phone(text, text, uuid, text, text) from public, anon;
grant execute on function roster.me_phone(text, text, uuid, text, text) to authenticated;
revoke all on function roster.me_phone(text, text, uuid) from public, anon;
grant execute on function roster.me_phone(text, text, uuid) to authenticated;
notify pgrst, 'reload schema';
