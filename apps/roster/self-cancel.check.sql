-- Checks for self-cancel.sql on the TEST schema (node scripts/sql.mjs --table < apps/roster/self-cancel.check.sql). Rolled back.
-- Expected: with allow_self_cancel false me_unregister answers forbidden and the registration stays; with true it cancels (as always).
begin;
create temp table res(t text, v text) on commit drop;
grant all on res to authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '0be14972-287d-4e7e-aae8-90e63f70fea7', 'role', 'authenticated', 'email', 'ofir.aviram@gmail.com')::text, true);
do $$ declare b uuid; m uuid; p uuid; begin
  select id into b from "roster-test".businesses where slug = 'demo';
  select id into m from "roster-test".meetings where business_id = b and meeting_date > current_date order by meeting_date limit 1;
  select id into p from "roster-test".participants where business_id = b and active and id not in (select participant_id from "roster-test".attendance where meeting_id = m) limit 1;
  insert into "roster-test".attendance (business_id, participant_id, meeting_id) values (b, p, m);
  delete from "roster-test".members where user_id = '0be14972-287d-4e7e-aae8-90e63f70fea7' and business_id = b;
  insert into "roster-test".members (business_id, user_id, email, participant_id, status) values (b, '0be14972-287d-4e7e-aae8-90e63f70fea7', 'ofir.aviram@gmail.com', p, 'approved');
  update "roster-test".business_settings set allow_self_cancel = false where business_id = b;
  perform set_config('check.m', m::text, true); perform set_config('check.p', p::text, true);
end $$;
set local role authenticated;
insert into res select 'false: answer', "roster-test".me_unregister('demo', current_setting('check.m')::uuid);
reset role;
insert into res select 'false: still registered', count(*)::text from "roster-test".attendance where participant_id = current_setting('check.p')::uuid and meeting_id = current_setting('check.m')::uuid;
update "roster-test".business_settings set allow_self_cancel = true where business_id = (select id from "roster-test".businesses where slug = 'demo');
set local role authenticated;
insert into res select 'true: answer', "roster-test".me_unregister('demo', current_setting('check.m')::uuid);
reset role;
insert into res select 'true: registered after', count(*)::text from "roster-test".attendance where participant_id = current_setting('check.p')::uuid and meeting_id = current_setting('check.m')::uuid;
select * from res;
rollback;
