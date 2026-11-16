-- Checks for mail-offers.sql on the TEST schema, business demo (node scripts/sql.mjs --table < apps/roster/mail-offers.check.sql). Everything is rolled back.
-- Expected: no_pay registration -> 'ready', then 'sent' makes ONE registration.confirmed event (and a second ask says 'already');
--           a removed registration -> cancel_mail 'ready' / 'sent' makes ONE registration.cancel_notice event, 'already' after;
--           still registered -> 'skip'; a participant without email -> 'no_email'; a past meeting -> 'past'.
begin;
create temp table res(t text, v text) on commit drop;
grant all on res to authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '0be14972-287d-4e7e-aae8-90e63f70fea7', 'role', 'authenticated', 'email', 'ofir.aviram@gmail.com')::text, true);
select set_config('request.headers', json_build_object('x-business', (select id::text from "roster-test".businesses where slug = 'demo'))::text, true);
do $$ declare b uuid; m uuid; p uuid; pe uuid; begin
  select id into b from "roster-test".businesses where slug = 'demo';
  select id into m from "roster-test".meetings where business_id = b and meeting_date > current_date order by meeting_date limit 1;
  select id into p from "roster-test".participants where business_id = b and active and btrim(coalesce(email, '')) <> '' and id not in (select participant_id from "roster-test".attendance where meeting_id = m) limit 1;
  select id into pe from "roster-test".participants where business_id = b and active and btrim(coalesce(email, '')) = '' and id not in (select participant_id from "roster-test".attendance where meeting_id = m) limit 1;
  insert into "roster-test".attendance (business_id, participant_id, meeting_id, no_pay) values (b, p, m, true);
  perform set_config('check.m', m::text, true); perform set_config('check.p', p::text, true); perform set_config('check.pe', pe::text, true);
  perform set_config('check.mpast', (select id::text from "roster-test".meetings where business_id = b and meeting_date < current_date order by meeting_date desc limit 1), true);
end $$;
set local role authenticated;
insert into res select '1 no_pay dry', "roster-test".close_payment_mail(current_setting('check.p')::uuid, current_setting('check.m')::uuid, true);
insert into res select '1 no_pay send', "roster-test".close_payment_mail(current_setting('check.p')::uuid, current_setting('check.m')::uuid);
insert into res select '1 no_pay again', "roster-test".close_payment_mail(current_setting('check.p')::uuid, current_setting('check.m')::uuid, true);
reset role;
insert into res select '1 events', count(*)::text from "roster-test".events where type = 'registration.confirmed' and source = 'admin_mail' and created_at > now() - interval '1 minute';
set local role authenticated;
insert into res select '2 still registered', "roster-test".cancel_mail(current_setting('check.p')::uuid, current_setting('check.m')::uuid, true);
reset role;
delete from "roster-test".attendance where participant_id = current_setting('check.p')::uuid and meeting_id = current_setting('check.m')::uuid;
set local role authenticated;
insert into res select '2 removed dry', "roster-test".cancel_mail(current_setting('check.p')::uuid, current_setting('check.m')::uuid, true);
insert into res select '2 removed send', "roster-test".cancel_mail(current_setting('check.p')::uuid, current_setting('check.m')::uuid);
insert into res select '2 removed again', "roster-test".cancel_mail(current_setting('check.p')::uuid, current_setting('check.m')::uuid, true);
insert into res select '3 no email', "roster-test".cancel_mail(current_setting('check.pe')::uuid, current_setting('check.m')::uuid, true);
insert into res select '4 past meeting', "roster-test".cancel_mail(current_setting('check.p')::uuid, current_setting('check.mpast')::uuid, true);
reset role;
insert into res select '2 events', count(*)::text from "roster-test".events where type = 'registration.cancel_notice' and source = 'admin_mail' and created_at > now() - interval '1 minute';
select * from res;
rollback;
