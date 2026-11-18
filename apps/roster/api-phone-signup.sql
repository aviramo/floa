-- Public signup in two steps (a business whose form asks for the phone first, the rest after): additive, no existing function or
-- route changes. Applied to the schema "roster" and, with `roster.` -> `"roster-test".`, to "roster-test".
--
--   api_signup_phone(p_key_hash, p_payload, p_ip_hash)   payload: phone (required), email, meeting_id, source_code
--     Creates the participant with the phone only (or reuses and reactivates the one that has it), attaches the meeting, and
--     answers { status, registered, participant_token, complete } (+ participant_id, created for a secret key). `complete` says
--     whether the participant already has the details (first, last, age, gender), so the form can skip the second step.
--     A phone-only participant emits no participant.created: that event, and the admins' mail, come with the details.
--   api_signup_complete(p_key_hash, p_payload, p_ip_hash)   payload: participant_token, first_name, last_name, age, gender, email
--     Fills ONLY what the participant does not have yet (a public key never overwrites a detail), by the token the first step
--     returned. The first time the names arrive, participant.created is emitted.
--
-- Same promise as api_signup: a public call never modifies an existing participant's details.

create or replace function roster.api_signup_phone(p_key_hash text, p_payload jsonb, p_ip_hash text default null)
returns jsonb language plpgsql security definer set search_path = roster, public as $fn$
declare
  k roster.api_keys; s roster.business_settings; pl jsonb;
  ph text; norm text; em text; midt text; mid uuid; scode text; prid uuid;
  pa roster.participants; pid uuid; created boolean := false; reg boolean := false; st text; tok text; mt roster.meetings; r int;
begin
  k := roster.api_key_of(p_key_hash);
  if k.id is null then return jsonb_build_object('error', 'invalid_key'); end if;
  s := roster.settings_of(k.business_id);
  if not coalesce(s.registration_open, true) then return jsonb_build_object('error', 'closed'); end if;
  perform set_config('roster.source', 'api', true);

  pl := case when jsonb_typeof(p_payload) = 'object' then p_payload else '{}'::jsonb end;
  ph := btrim(coalesce(pl->>'phone', ''));
  em := lower(btrim(coalesce(pl->>'email', '')));
  midt := btrim(coalesce(pl->>'meeting_id', ''));
  scode := lower(btrim(coalesce(pl->>'source_code', '')));

  norm := roster.normalize_phone(ph);
  if ph = '' or norm = '' then return jsonb_build_object('error', 'validation', 'field', 'phone'); end if;
  if em <> '' and not roster.valid_email(em) then return jsonb_build_object('error', 'validation', 'field', 'email'); end if;
  if char_length(scode) > 40 or scode ~ '[[:cntrl:]]' then return jsonb_build_object('error', 'validation', 'field', 'source_code'); end if;
  if midt <> '' then
    if midt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('error', 'validation', 'field', 'meeting_id'); end if;
    mid := midt::uuid;
    select * into mt from roster.meetings where id = mid and business_id = k.business_id;
    if not found then return jsonb_build_object('error', 'not_found'); end if;
  end if;

  select * into pa from roster.participants where business_id = k.business_id and phone_norm = norm;
  if not found then
    r := roster.rate_take('newpub:' || k.business_id, 60, 120);
    if r > 0 then return jsonb_build_object('error', 'rate_limited', 'retry_after', r); end if;
    if scode <> '' then select pr.id into prid from roster.promoters pr where pr.business_id = k.business_id and (lower(pr.code) = scode or scode = any (select lower(x) from unnest(coalesce(pr.codes, '{}'::text[])) x)) limit 1; end if;
    begin
      insert into roster.participants (business_id, first_name, last_name, phone, age_set_at, email, source, source_code, promoter_id)
        values (k.business_id, '', '', norm, roster.today(), nullif(em, ''), case when prid is not null then 'site-ad' else 'site' end, nullif(scode, ''), prid)   -- an unknown code is kept too (source stays site, no promoter): the admin sees which link the person came from
        returning id into pid;
      created := true;
      perform roster.sys_note(k.business_id, pid, 'נרשם/ה דרך האתר · טלפון ' || norm, 'registered');
    exception when unique_violation then
      select * into pa from roster.participants where business_id = k.business_id and phone_norm = norm;
      pid := pa.id;
    end;
  else
    pid := pa.id;
  end if;
  if not created and not coalesce(pa.active, true) then
    update roster.participants set active = true where id = pid;   -- the trigger notes it
  end if;

  if mid is not null and mt.meeting_date >= roster.today() then
    if mt.max_participants is not null and roster.registered_count(k.business_id, mid) >= mt.max_participants then
      return jsonb_build_object('error', 'full');
    end if;
    st := roster.attach(k.business_id, pid, mid);
    if st = 'full' then return jsonb_build_object('error', 'full'); end if;
    reg := st in ('registered', 'exists');
  end if;

  tok := 'pt_' || roster.random_text(32);
  insert into roster.participant_tokens (token_hash, business_id, participant_id, expires_at, meeting_id)
    values (roster.sha256_hex(tok), k.business_id, pid, now() + interval '30 days', case when reg then mid end);
  if random() < 0.02 then perform roster.rate_cleanup(); end if;

  select * into pa from roster.participants where id = pid;
  return jsonb_build_object('status', 'ok', 'registered', reg, 'participant_token', tok,
    'complete', (char_length(btrim(pa.first_name)) >= 2 and char_length(btrim(pa.last_name)) >= 2 and pa.age is not null and pa.gender is not null))
    || case when k.kind = 'secret' then jsonb_build_object('participant_id', pid, 'created', created) else '{}'::jsonb end;
end $fn$;

create or replace function roster.api_signup_complete(p_key_hash text, p_payload jsonb, p_ip_hash text default null)
returns jsonb language plpgsql security definer set search_path = roster, public as $fn$
declare
  k roster.api_keys; s roster.business_settings; pl jsonb; t roster.participant_tokens; old roster.participants; pa roster.participants;
  tok text; fn text; ln text; em text; agt text; ag int; gd text;
begin
  k := roster.api_key_of(p_key_hash);
  if k.id is null then return jsonb_build_object('error', 'invalid_key'); end if;
  s := roster.settings_of(k.business_id);
  perform set_config('roster.source', 'api', true);

  pl := case when jsonb_typeof(p_payload) = 'object' then p_payload else '{}'::jsonb end;
  tok := btrim(coalesce(pl->>'participant_token', ''));
  fn := btrim(regexp_replace(coalesce(pl->>'first_name', ''), '[\u0009-\u000d \u0085   -     　]+', ' ', 'g'));
  ln := btrim(regexp_replace(coalesce(pl->>'last_name', ''), '[\u0009-\u000d \u0085   -     　]+', ' ', 'g'));
  em := lower(btrim(coalesce(pl->>'email', '')));
  agt := btrim(coalesce(pl->>'age', ''));
  gd := lower(btrim(coalesce(pl->>'gender', '')));

  select * into t from roster.participant_tokens where token_hash = roster.sha256_hex(tok) and business_id = k.business_id and expires_at > now();
  if not found then return jsonb_build_object('error', 'invalid_token'); end if;

  if char_length(fn) < 2 or char_length(fn) > 40 or not roster.valid_name(fn) then return jsonb_build_object('error', 'validation', 'field', 'first_name'); end if;
  if char_length(ln) < 2 or char_length(ln) > 40 or not roster.valid_name(ln) then return jsonb_build_object('error', 'validation', 'field', 'last_name'); end if;
  if char_length(btrim(fn || ' ' || ln)) > 60 then return jsonb_build_object('error', 'validation', 'field', 'last_name'); end if;
  if 'age' = any (coalesce(s.signup_required, '{}'::text[])) and agt = '' then return jsonb_build_object('error', 'validation', 'field', 'age'); end if;
  if 'gender' = any (coalesce(s.signup_required, '{}'::text[])) and gd = '' then return jsonb_build_object('error', 'validation', 'field', 'gender'); end if;
  if agt <> '' then
    if agt !~ '^[0-9]{1,3}$' or agt::int < 18 or agt::int > 99 then return jsonb_build_object('error', 'validation', 'field', 'age'); end if;
    ag := agt::int;
  end if;
  if gd <> '' and gd not in ('male', 'female') then return jsonb_build_object('error', 'validation', 'field', 'gender'); end if;
  if em <> '' and not roster.valid_email(em) then return jsonb_build_object('error', 'validation', 'field', 'email'); end if;

  select * into old from roster.participants where id = t.participant_id and business_id = k.business_id;
  if not found then return jsonb_build_object('error', 'invalid_token'); end if;

  -- only what is still empty is filled: a token (anyone who typed this phone has one) never changes a detail that is already there
  update roster.participants set
         first_name = case when btrim(first_name) = '' then fn else first_name end,
         last_name  = case when btrim(last_name) = '' then ln else last_name end,
         age        = coalesce(age, ag),
         age_set_at = case when age is null and ag is not null then roster.today() else age_set_at end,
         gender     = coalesce(gender, nullif(gd, '')),
         email      = coalesce(email, nullif(em, ''))
   where id = old.id and business_id = k.business_id;

  select * into pa from roster.participants where id = old.id;
  if (old.first_name is distinct from pa.first_name or old.last_name is distinct from pa.last_name or old.age is distinct from pa.age or old.gender is distinct from pa.gender or old.email is distinct from pa.email) then
    perform roster.sys_note(k.business_id, old.id, 'השלים/ה פרטים: ' || pa.first_name || ' ' || pa.last_name || coalesce(' · גיל ' || pa.age, '')
      || case pa.gender when 'male' then ' · זכר' when 'female' then ' · נקבה' else '' end, 'profile_completed');
  end if;
  if btrim(coalesce(old.first_name, '') || coalesce(old.last_name, '')) = '' and btrim(pa.first_name || pa.last_name) <> '' then
    perform roster.emit(k.business_id, 'participant.created', jsonb_build_object('participant', roster.participant_json(pa)));
  end if;
  return jsonb_build_object('status', 'ok');
end $fn$;

revoke all on function roster.api_signup_phone(text, jsonb, text)    from public, anon, authenticated;
revoke all on function roster.api_signup_complete(text, jsonb, text) from public, anon, authenticated;
grant execute on function roster.api_signup_phone(text, jsonb, text)    to service_role;
grant execute on function roster.api_signup_complete(text, jsonb, text) to service_role;
notify pgrst, 'reload schema';
