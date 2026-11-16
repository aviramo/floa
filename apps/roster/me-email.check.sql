-- Checks for me-email.sql on the TEST schema (run: node scripts/sql.mjs --table < apps/roster/me-email.check.sql). Everything is rolled back.
-- Expected: pre-link bound / consumed; participant email bound; two participants with one email -> none; other account holds the participant ->
-- none + one conflict event; blocked pre-link -> none; removed member row -> none; unverified email -> none.
begin;
create temp table res(t text, v text) on commit drop;
grant all on res to authenticated;
do $$ declare b uuid; me uuid := '0be14972-287d-4e7e-aae8-90e63f70fea7'; other uuid; begin
  select id into b from "roster-test".businesses where slug = 'harpatka';
  select id into other from auth.users where id <> me order by created_at limit 1;
  insert into "roster-test".participants (business_id, first_name, last_name, phone, email, age, gender) values
    (b, 'קישור', 'מראש', '+972501110011', null, 40, 'female'), (b, 'אימייל', 'אחד', '+972501110012', 'Ofir.Aviram@gmail.com', 40, 'male');
  perform set_config('check.b', b::text, true); perform set_config('check.other', other::text, true);
end $$;
select set_config('request.jwt.claims', json_build_object('sub','0be14972-287d-4e7e-aae8-90e63f70fea7','role','authenticated','email','ofir.aviram@gmail.com')::text, true);

-- 1. a pre-link wins, and is consumed
insert into "roster-test".member_links select current_setting('check.b')::uuid, 'ofir.aviram@gmail.com', id, 'approved' from "roster-test".participants where phone = '+972501110011';
set local role authenticated;
insert into res select '1 prelink status', "roster-test".me('harpatka')->>'status';
insert into res select '1 prelink who', "roster-test".me('harpatka')->'participant'->>'first_name';
reset role;
insert into res select '1 prelink consumed', count(*)::text from "roster-test".member_links where email = 'ofir.aviram@gmail.com';
delete from "roster-test".members where user_id = '0be14972-287d-4e7e-aae8-90e63f70fea7';

-- 2. no pre-link: the participant's own email (exactly one)
set local role authenticated;
insert into res select '2 email status', "roster-test".me('harpatka')->>'status';
insert into res select '2 email who', "roster-test".me('harpatka')->'participant'->>'first_name';
reset role;
delete from "roster-test".members where user_id = '0be14972-287d-4e7e-aae8-90e63f70fea7';

-- 3. a blocked pre-link stays blocked (and the email match is not used behind it)
insert into "roster-test".member_links select current_setting('check.b')::uuid, 'ofir.aviram@gmail.com', id, 'blocked' from "roster-test".participants where phone = '+972501110011';
set local role authenticated;
insert into res select '3 blocked status', "roster-test".me('harpatka')->>'status';
reset role;
delete from "roster-test".member_links where email = 'ofir.aviram@gmail.com';

-- 4. the participant is held by another account: none, and one conflict event for the admins
insert into "roster-test".members (business_id, user_id, email, participant_id, status)
  select current_setting('check.b')::uuid, current_setting('check.other')::uuid, 'other@example.com', id, 'approved' from "roster-test".participants where phone = '+972501110012';
set local role authenticated;
insert into res select '4 held status', "roster-test".me('harpatka')->>'status';
insert into res select '4 held again', "roster-test".me('harpatka')->>'status';
reset role;
insert into res select '4 conflict events', count(*)::text from "roster-test".events where type = 'participant.phone_conflict' and created_at > now() - interval '1 minute';
delete from "roster-test".members where user_id = current_setting('check.other')::uuid;

-- 5. an admin removed this account: a page load does not undo it
insert into "roster-test".members (business_id, user_id, email, participant_id, status) values (current_setting('check.b')::uuid, '0be14972-287d-4e7e-aae8-90e63f70fea7', 'ofir.aviram@gmail.com', null, 'removed');
set local role authenticated;
insert into res select '5 removed status', "roster-test".me('harpatka')->>'status';
reset role;
delete from "roster-test".members where user_id = '0be14972-287d-4e7e-aae8-90e63f70fea7';

-- 6. two participants share the email: nothing is guessed
insert into "roster-test".participants (business_id, first_name, last_name, phone, email, age, gender) values (current_setting('check.b')::uuid, 'אימייל', 'שניים', '+972501110013', 'ofir.aviram@gmail.com', 40, 'male');
set local role authenticated;
insert into res select '6 two emails status', "roster-test".me('harpatka')->>'status';
reset role;

-- 7. the email is not verified in auth: nothing
update auth.users set email_confirmed_at = null where id = '0be14972-287d-4e7e-aae8-90e63f70fea7';
delete from "roster-test".participants where phone = '+972501110013';
set local role authenticated;
insert into res select '7 unverified status', "roster-test".me('harpatka')->>'status';
reset role;
select * from res;
rollback;
