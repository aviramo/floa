-- The manager is asked, every time, how to tell a participant: by mail or by WhatsApp (owner's rule, 2026-11-17).
--  * closing an allocation: a payment closed, or a registration marked "no payment" -> close_payment_mail now also answers 'ready' for a
--    "no payment" registration and, when asked to send, makes the internal event registration.confirmed (the mail registration_confirmed:
--    "your registration is confirmed, no payment is due"). A payment that is closed keeps payment_confirmed.
--  * removing a registration by hand: the mail "registration_cancelled" is no longer sent automatically for a removal made by an admin (the Worker
--    skips registration.cancelled whose source is admin); cancel_mail(p_pid, p_mid, p_dry) lets the admin page offer it, and when asked to send makes the
--    internal event registration.cancel_notice (mail only, no webhook: the removal already sent its own registration.cancelled).
-- Answers (text): ready | sent | already | past | skip | unpaid | no_mail (the business turned it off, or pay-later) | no_email.
do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'roster.business_settings'::regclass and conname = 'roster_settings_mail_off_known') then
    alter table roster.business_settings drop constraint roster_settings_mail_off_known;
  end if;
  alter table roster.business_settings add constraint roster_settings_mail_off_known
    check (mail_off_types <@ array['registered', 'payment_confirmed', 'refund', 'registration_cancelled', 'registration_confirmed',
                                   'admin_signup', 'admin_payment_reported', 'admin_account_linked', 'admin_phone_conflict']::text[]);
  if exists (select 1 from pg_constraint where conname = 'roster_mail_templates_key_known' and conrelid = 'roster.mail_templates'::regclass) then
    alter table roster.mail_templates drop constraint roster_mail_templates_key_known;
  end if;
  alter table roster.mail_templates add constraint roster_mail_templates_key_known check (key in (
    'admin_signup', 'admin_payment_reported', 'admin_account_linked', 'admin_phone_conflict',
    'registered', 'payment_confirmed', 'refund', 'registration_cancelled', 'registration_confirmed'));
end $$;

create or replace function roster.close_payment_mail(p_pid uuid, p_mid uuid, p_dry boolean default false)
returns text language plpgsql security definer set search_path = roster, public as $fn$
declare b uuid := roster.my_current(); s roster.business_settings; a roster.attendance; mt roster.meetings;
        pa roster.participants; paid numeric; nopay boolean; tkey text;
begin
  if b is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into a from roster.attendance where business_id = b and participant_id = p_pid and meeting_id = p_mid;
  if not found then return 'skip'; end if;
  select * into mt from roster.meetings where id = p_mid and business_id = b;
  if not found or mt.meeting_date < roster.today() then return 'past'; end if;
  nopay := coalesce(a.no_pay, false);
  tkey := case when nopay then 'registration_confirmed' else 'payment_confirmed' end;
  if exists (select 1 from roster.mail_log l where l.business_id = b and l.participant_id = p_pid and l.meeting_id = p_mid
               and l.template = tkey and l.status in ('sent', 'pending'))
     or exists (select 1 from roster.events e where e.business_id = b and e.type = case when nopay then 'registration.confirmed' else 'payment.recorded' end and e.source = 'admin_mail'
                  and e.status in ('pending', 'processing') and (e.payload #>> '{participant,id}') = p_pid::text and (e.payload #>> '{meeting,id}') = p_mid::text) then
    return 'already';
  end if;
  s := roster.settings_of(b);
  if a.pay_later_at is not null or not coalesce(s.participant_mail_enabled, false)
     or tkey = any (coalesce(s.mail_off_types, '{}'::text[])) then return 'no_mail'; end if;
  select * into pa from roster.participants where id = p_pid and business_id = b;
  if not found then return 'skip'; end if;
  if nopay then
    if coalesce(btrim(pa.email), '') = '' then return 'no_email'; end if;
    if p_dry then return 'ready'; end if;
    if (select count(*) from roster.events where business_id = b and status in ('pending', 'processing')) >= 500 then return 'skip'; end if;
    insert into roster.events (business_id, type, payload, source)
      values (b, 'registration.confirmed', jsonb_build_object('participant', roster.participant_json(pa), 'meeting', roster.meeting_brief(mt)), 'admin_mail');
    return 'sent';
  end if;
  if coalesce(a.pay_due_amount, 0) > 0 then return 'skip'; end if;
  paid := roster.paid_for(b, p_pid, p_mid);
  if paid <= 0 then return 'unpaid'; end if;
  if coalesce(btrim(pa.email), '') = '' then return 'no_email'; end if;
  if p_dry then return 'ready'; end if;
  if (select count(*) from roster.events where business_id = b and status in ('pending', 'processing')) >= 500 then return 'skip'; end if;
  insert into roster.events (business_id, type, payload, source)
    values (b, 'payment.recorded', jsonb_build_object('participant', roster.participant_json(pa), 'meeting', roster.meeting_brief(mt),
              'payment', jsonb_build_object('id', null, 'kind', 'payment', 'amount', paid, 'method', null, 'meeting_id', p_mid)), 'admin_mail');
  return 'sent';
end $fn$;

create or replace function roster.cancel_mail(p_pid uuid, p_mid uuid, p_dry boolean default false)
returns text language plpgsql security definer set search_path = roster, public as $fn$
declare b uuid := roster.my_current(); s roster.business_settings; mt roster.meetings; pa roster.participants;
begin
  if b is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into mt from roster.meetings where id = p_mid and business_id = b;
  if not found or mt.meeting_date < roster.today() then return 'past'; end if;
  if exists (select 1 from roster.attendance where business_id = b and participant_id = p_pid and meeting_id = p_mid) then return 'skip'; end if;   -- still registered: nothing was cancelled
  select * into pa from roster.participants where id = p_pid and business_id = b;
  if not found then return 'skip'; end if;
  s := roster.settings_of(b);
  if not coalesce(s.participant_mail_enabled, false) or 'registration_cancelled' = any (coalesce(s.mail_off_types, '{}'::text[])) then return 'no_mail'; end if;
  if exists (select 1 from roster.mail_log l where l.business_id = b and l.participant_id = p_pid and l.meeting_id = p_mid
               and l.template = 'registration_cancelled' and l.status in ('sent', 'pending') and l.created_at > now() - interval '10 minutes')
     or exists (select 1 from roster.events e where e.business_id = b and e.type = 'registration.cancel_notice' and e.status in ('pending', 'processing')
                  and (e.payload #>> '{participant,id}') = p_pid::text and (e.payload #>> '{meeting,id}') = p_mid::text) then
    return 'already';
  end if;
  if coalesce(btrim(pa.email), '') = '' then return 'no_email'; end if;
  if p_dry then return 'ready'; end if;
  if (select count(*) from roster.events where business_id = b and status in ('pending', 'processing')) >= 500 then return 'skip'; end if;
  insert into roster.events (business_id, type, payload, source)
    values (b, 'registration.cancel_notice', jsonb_build_object('participant', roster.participant_json(pa), 'meeting', roster.meeting_brief(mt)), 'admin_mail');
  return 'sent';
end $fn$;
revoke all on function roster.cancel_mail(uuid, uuid, boolean) from public, anon;
grant execute on function roster.cancel_mail(uuid, uuid, boolean) to authenticated;

create or replace function roster.mail_test(p_template text)
returns jsonb language plpgsql security definer set search_path = roster, public as $fn$
declare b uuid := roster.my_current(); me text := lower(btrim(coalesce(roster.email_of(), ''))); wait int; id bigint;
begin
  if b is null then return jsonb_build_object('error', 'forbidden'); end if;
  if p_template is null or p_template not in ('registered', 'payment_confirmed', 'refund', 'registration_cancelled', 'registration_confirmed',
                                              'admin_signup', 'admin_payment_reported', 'admin_account_linked', 'admin_phone_conflict') then
    return jsonb_build_object('error', 'unknown_template');
  end if;
  if me = '' or not roster.valid_email(me) then return jsonb_build_object('error', 'no_email'); end if;
  wait := roster.rate_take('mailtest:' || b, 60, 10);
  if wait > 0 then return jsonb_build_object('error', 'rate_limited', 'retry_in', wait); end if;
  if (select count(*) from roster.events where business_id = b and status in ('pending', 'processing')) >= 500 then
    return jsonb_build_object('error', 'busy');
  end if;
  insert into roster.events (business_id, type, payload, source)
    values (b, 'mail.test', jsonb_build_object('template', p_template, 'to', me), 'admin') returning events.id into id;
  return jsonb_build_object('queued', true, 'event_id', id, 'to', me);
end $fn$;
