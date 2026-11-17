-- payment-method-on-report.sql (owner-approved 2026-11-17, TEST FIRST)
-- "I paid" can say HOW: POST /payments/click takes an optional `method`, me_report_payment takes an optional p_method.
-- The value is a pay_methods key of the business (bit, paybox ... ). A key the business does not have is ignored
-- silently (no error, the answer is the same). The method is stored on the report (attendance.pay_method) and its
-- name is added to the note. Without a method everything is exactly what it was: the old functions keep their
-- signatures and answers; the new ones are overloads that only a call WITH p_method reaches (no defaults, so a call
-- without it can never be ambiguous). Written with the schema name `roster`; for roster-test replace it (never copy
-- a test definition to production).

-- the shared core: the old report_core / report_core_me become wrappers of these (m = null: unchanged)
create or replace function roster.report_core(b uuid, pid uuid, mid uuid, m text)
returns text language plpgsql security definer set search_path = roster, public as $fn$
declare mt roster.meetings; a roster.attendance; paid numeric; due numeric; amt numeric; mk text; mn text;
begin
  perform pg_advisory_xact_lock(hashtext(pid::text));   -- one report or spend of this participant at a time
  select * into mt from roster.meetings where id = mid and business_id = b;
  if not found then return 'past'; end if;
  select * into a from roster.attendance where business_id = b and participant_id = pid and meeting_id = mid;
  if not found then return 'not_registered'; end if;
  paid := roster.paid_for(b, pid, mid);
  due := nullif(a.pay_due_amount, 0);
  if coalesce(a.no_pay, false) then return 'free'; end if;
  if paid > 0 and due is null then return 'already_paid'; end if;
  if a.pay_reported_at is not null then return 'already_reported'; end if;
  amt := coalesce(due, roster.meeting_price(mt.price_tiers, greatest(mt.meeting_date - roster.today(), 0)));
  select x.key, x.name into mk, mn from roster.pay_methods x where x.business_id = b and x.key = lower(btrim(coalesce(m, ''))) limit 1;   -- a key the business does not have: nothing
  update roster.attendance set pay_reported_at = now(), pay_reported_amount = amt, pay_rejected_at = null, pay_method = coalesce(mk, pay_method)
   where business_id = b and participant_id = pid and meeting_id = mid;
  perform roster.sys_note(b, pid, 'דווח על תשלום' || coalesce(' ₪' || roster.money_text(amt), '') || coalesce(' ב' || mn, '') || ' למפגש ' || roster.meeting_short(b, mid) || ' (ממתין לאימות)',
    'payment_reported', mid, null, amt);
  return 'reported';
end $fn$;

create or replace function roster.report_core_me(b uuid, pid uuid, mid uuid, m text)
returns text language plpgsql security definer set search_path = roster, public as $fn$
declare mt roster.meetings; a roster.attendance; paid numeric; due numeric; amt numeric; mk text; mn text;
begin
  perform pg_advisory_xact_lock(hashtext(pid::text));   -- one report or spend of this participant at a time
  select * into mt from roster.meetings where id = mid and business_id = b;
  if not found then return 'past'; end if;
  select * into a from roster.attendance where business_id = b and participant_id = pid and meeting_id = mid;
  if not found then return 'not_registered'; end if;
  paid := roster.paid_for(b, pid, mid);
  due := nullif(a.pay_due_amount, 0);
  if coalesce(a.no_pay, false) then return 'free'; end if;
  if paid > 0 and due is null then return 'already_paid'; end if;
  if a.pay_reported_at is not null then return 'already_reported'; end if;
  amt := coalesce(due, a.ticket_price, roster.meeting_price(mt.price_tiers, greatest(mt.meeting_date - roster.today(), 0)));
  select x.key, x.name into mk, mn from roster.pay_methods x where x.business_id = b and x.key = lower(btrim(coalesce(m, ''))) limit 1;
  update roster.attendance set pay_reported_at = now(), pay_reported_amount = amt, pay_rejected_at = null, pay_method = coalesce(mk, pay_method)
   where business_id = b and participant_id = pid and meeting_id = mid;
  perform roster.sys_note(b, pid, 'דווח על תשלום' || coalesce(' ₪' || roster.money_text(amt), '') || coalesce(' ב' || mn, '') || ' למפגש ' || roster.meeting_short(b, mid) || ' (ממתין לאימות)',
    'payment_reported', mid, null, amt);
  return 'reported';
end $fn$;

-- the old three-argument cores: the same answers, now one body
create or replace function roster.report_core(b uuid, pid uuid, mid uuid)
returns text language sql security definer set search_path = roster, public as $fn$
  select roster.report_core(b, pid, mid, null::text)
$fn$;

create or replace function roster.report_core_me(b uuid, pid uuid, mid uuid)
returns text language sql security definer set search_path = roster, public as $fn$
  select roster.report_core_me(b, pid, mid, null::text)
$fn$;

-- POST /payments/click with a method: the same checks and the same answer as without it
create or replace function roster.api_payment_click(p_key_hash text, p_token_hash text, p_meeting uuid, p_ip_hash text, p_method text)
returns jsonb language plpgsql security definer set search_path = roster, public as $fn$
declare k roster.api_keys; t roster.participant_tokens; pa roster.participants; mt roster.meetings;
begin
  k := roster.api_key_of(p_key_hash);
  if k.id is null then return jsonb_build_object('error', 'invalid_key'); end if;
  if k.kind <> 'public' then return jsonb_build_object('error', 'wrong_key_kind'); end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error', 'invalid_token'); end if;
  select * into t from roster.participant_tokens where token_hash = p_token_hash and business_id = k.business_id and expires_at > now();
  if not found then return jsonb_build_object('error', 'invalid_token'); end if;
  if t.meeting_id is not null and p_meeting is not null and p_meeting = t.meeting_id then
    select * into pa from roster.participants where id = t.participant_id and business_id = k.business_id;
    select * into mt from roster.meetings where id = p_meeting and business_id = k.business_id;
    if pa.id is not null and pa.active and mt.id is not null and mt.meeting_date >= roster.today() then
      perform set_config('roster.source', 'api', true);
      perform roster.report_core(k.business_id, pa.id, p_meeting, p_method);
    end if;
  end if;
  return jsonb_build_object('status', 'ok');
end $fn$;

-- "I paid" from the personal area with a method
create or replace function roster.me_report_payment(p_slug text, p_meeting uuid, p_method text)
returns text language plpgsql security definer set search_path = roster, public as $fn$
declare r jsonb := roster.me_resolve(p_slug, true); st text := r->>'status'; b uuid := nullif(r->>'business_id', '')::uuid; pid uuid := nullif(r->>'participant_id', '')::uuid; c text;
begin
  if st <> 'ok' then return roster.me_text(st); end if;
  perform set_config('roster.source', 'me', true);
  c := roster.report_core_me(b, pid, p_meeting, p_method);
  return case c when 'reported' then 'ok' when 'already_reported' then 'reported' when 'already_paid' then 'already' when 'free' then 'already' else c end;
end $fn$;

-- the same doors as the functions they sit beside
revoke all on function roster.report_core(uuid, uuid, uuid, text)                              from public, anon, authenticated, service_role;
revoke all on function roster.report_core_me(uuid, uuid, uuid, text)                           from public, anon, authenticated, service_role;
revoke all on function roster.api_payment_click(text, text, uuid, text, text)                  from public, anon, authenticated;
grant execute on function roster.api_payment_click(text, text, uuid, text, text)               to service_role;
revoke all on function roster.me_report_payment(text, uuid, text)                              from public, anon;
grant execute on function roster.me_report_payment(text, uuid, text)                           to authenticated;
