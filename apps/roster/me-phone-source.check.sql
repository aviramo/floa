-- Checks for me-phone-source.sql on the TEST schema (run: node scripts/sql.mjs --table < apps/roster/me-phone-source.check.sql). Everything is rolled back.
-- Expected: 1 email/source/registered; 2 old 3-argument answer is exactly {status, complete}; 3 a bad email is ignored and an unknown code is kept (source unchanged, no promoter);
-- 4 an existing source is never overwritten; 5 the email of another participant is not saved and nothing fails.
begin;
create temp table res(t text, v text) on commit drop;
grant all on res to authenticated;
do $$ declare b uuid; begin
  select id into b from "roster-test".businesses where slug = 'harpatka';
  perform set_config('check.b', b::text, true);
  delete from "roster-test".members where business_id = b and user_id = '0be14972-287d-4e7e-aae8-90e63f70fea7';
  insert into "roster-test".participants (business_id, first_name, last_name, phone, email, age, gender, source, source_code, promoter_id)
    values (b, 'Has', 'Source', '+972501110031', 'taken@example.com', 40, 'male', 'site-ad', 'b', '0d2c9696-40aa-4f94-a56e-7803a3007288'),
           (b, 'Plain', 'One', '+972501110032', null, 40, 'male', null, null, null);
end $$;
select set_config('request.jwt.claims', json_build_object('sub','0be14972-287d-4e7e-aae8-90e63f70fea7','role','authenticated','email','ofir.aviram@gmail.com')::text, true);
set local role authenticated;

-- 1. new participant with phone + email + source + meeting, one call
insert into res select '1 status', "roster-test".me_phone('harpatka', '0501110021', '5bdda240-db58-4d6d-a519-e277308fd6f5', 'New.Person@example.com', 'PM')->>'status';
reset role;
insert into res select '1 email', email from "roster-test".participants where business_id = current_setting('check.b')::uuid and phone_norm = roster.normalize_phone('0501110021');
insert into res select '1 source', source || '/' || source_code from "roster-test".participants where business_id = current_setting('check.b')::uuid and phone_norm = roster.normalize_phone('0501110021');
insert into res select '1 promoter p', (promoter_id = '4781bace-7072-4a6c-ab9f-f63a98f55881')::text from "roster-test".participants where business_id = current_setting('check.b')::uuid and phone_norm = roster.normalize_phone('0501110021');
insert into res select '1 attendance source p', (a.source_promoter_id = '4781bace-7072-4a6c-ab9f-f63a98f55881')::text from "roster-test".attendance a join "roster-test".participants p on p.id = a.participant_id where p.phone_norm = roster.normalize_phone('0501110021') and p.business_id = current_setting('check.b')::uuid;
delete from "roster-test".members where user_id = '0be14972-287d-4e7e-aae8-90e63f70fea7';

-- 2. the old call (3 arguments, no meeting): exactly {status, complete}, no source
set local role authenticated;
insert into res select '2 keys', (select string_agg(k, ',' order by k) from jsonb_object_keys("roster-test".me_phone('harpatka', '0501110022')) k);
reset role;
insert into res select '2 source empty', coalesce(source_code, '(none)') from "roster-test".participants where business_id = current_setting('check.b')::uuid and phone_norm = roster.normalize_phone('0501110022');
delete from "roster-test".members where user_id = '0be14972-287d-4e7e-aae8-90e63f70fea7';

-- 3. a bad email and an unknown code: ignored, the call succeeds
set local role authenticated;
insert into res select '3 status', "roster-test".me_phone('harpatka', '0501110023', null, 'not-an-email', 'zzz')->>'status';
reset role;
insert into res select '3 email/code/source/promoter', coalesce(email, '(none)') || '/' || coalesce(source_code, '(none)') || '/' || coalesce(source, '(none)') || '/' || (promoter_id is null)::text from "roster-test".participants where business_id = current_setting('check.b')::uuid and phone_norm = roster.normalize_phone('0501110023');
delete from "roster-test".members where user_id = '0be14972-287d-4e7e-aae8-90e63f70fea7';

-- 4. a participant that already has a source keeps it
set local role authenticated;
insert into res select '4 status', "roster-test".me_phone('harpatka', '0501110031', null, null, 'p')->>'status';
reset role;
insert into res select '4 source kept', source_code from "roster-test".participants where business_id = current_setting('check.b')::uuid and phone_norm = roster.normalize_phone('0501110031');
delete from "roster-test".members where user_id = '0be14972-287d-4e7e-aae8-90e63f70fea7';

-- 5. an email another participant already has: not saved, no error
set local role authenticated;
insert into res select '5 status', "roster-test".me_phone('harpatka', '0501110032', null, 'taken@example.com', null)->>'status';
reset role;
insert into res select '5 email not copied', coalesce(email, '(none)') from "roster-test".participants where business_id = current_setting('check.b')::uuid and phone_norm = roster.normalize_phone('0501110032');

select * from res order by t;
rollback;
