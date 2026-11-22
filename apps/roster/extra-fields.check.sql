-- Checks for extra-fields.sql on the TEST schema, all in one transaction that is rolled back (nothing stays):
-- (the test copy stores the public key kind as "test", as db-split left it)
--   (echo "begin;"; sed -E "s/([^'a-z_])roster\./\"roster-test\"./g" apps/roster/extra-fields.sql; cat apps/roster/extra-fields.check.sql) | node scripts/sql.mjs --table
-- Expected: see the "want" column.
create temp table res(t text, got text, want text) on commit drop;
insert into "roster-test".api_keys (business_id, kind, prefix, key_hash, label) select id, 'test', 'rk_pub_chk', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'check' from "roster-test".businesses where slug = 'harpatka';

create temp table r1(v text) on commit drop; insert into r1 select ("roster-test".api_signup_extra('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '{"first_name":"דנה","last_name":"לוי","phone":"0501110001","age":"30","gender":"female","extra_fields":[{"key":"past","label":"ניסיון קודם","value":"כן, שנתיים"},{"key":"health","label":"מצב בריאותי ונפשי","value":"תקין"},{"key":"empty","label":"ריק","value":"  "}]}'::jsonb))::text;
insert into res select 'new participant: stored list (empty value dropped)', (select extra_fields::text from "roster-test".participants where phone_norm = "roster-test".normalize_phone('0501110001')), '[{"key":"past","label":"ניסיון קודם","value":"כן, שנתיים"},{"key":"health","label":"מצב בריאותי ונפשי","value":"תקין"}]';
insert into res select 'note written on the participant', (select count(*)::text from "roster-test".notes n join "roster-test".participants p on p.id = n.participant_id where p.phone_norm = "roster-test".normalize_phone('0501110001') and n.body like E'ניסיון קודם: כן, שנתיים\nמצב בריאותי ונפשי: תקין'), '1';
insert into res select 'participant_json carries it', ("roster-test".participant_json(p) ? 'extra_fields')::text, 'true' from "roster-test".participants p where phone_norm = "roster-test".normalize_phone('0501110001');

create temp table r2(v text) on commit drop; insert into r2 select ("roster-test".api_signup_extra('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '{"first_name":"דנה","last_name":"לוי","phone":"0501110001","age":"30","gender":"female","extra_fields":[{"key":"past","label":"ניסיון קודם","value":"לא נכון, שונה"}]}'::jsonb))::text;
insert into res select 'existing participant: not changed by a public call', (select extra_fields->0->>'value' from "roster-test".participants where phone_norm = "roster-test".normalize_phone('0501110001')), 'כן, שנתיים';

create temp table r3(v text) on commit drop; insert into r3 select ("roster-test".api_signup('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '{"first_name":"דנה","last_name":"כהן","phone":"0501110002","age":"31","gender":"female"}'::jsonb))::text;
insert into res select 'plain signup: no extra_fields key, column null', ("roster-test".participant_json(p) ? 'extra_fields')::text || '/' || (p.extra_fields is null)::text, 'false/true' from "roster-test".participants p where phone_norm = "roster-test".normalize_phone('0501110002');

create temp table r4(v text) on commit drop; insert into r4 select ("roster-test".api_signup_extra('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '{"phone":"0501110003","first_name":"דנה","extra_fields":[{"key":"a","label":"x","value":"1"},{"key":"a","label":"y","value":"2"}]}'::jsonb))::text;
insert into res values ('duplicate key', (select v from r4), '{"field": "extra_fields", "error": "validation"}');
create temp table r5(v text) on commit drop; insert into r5 select ("roster-test".api_signup_extra('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '{"phone":"0501110003","first_name":"דנה","extra_fields":[{"key":"Bad Key","label":"x","value":"1"}]}'::jsonb))::text;
insert into res values ('bad key chars', (select v from r5), '{"field": "extra_fields", "error": "validation"}');
create temp table r6(v text) on commit drop; insert into r6 select ("roster-test".api_signup_extra('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '{"phone":"0501110003","first_name":"דנה","extra_fields":"nope"}'::jsonb))::text;
insert into res values ('not a list', (select v from r6), '{"field": "extra_fields", "error": "validation"}');
create temp table r7(v text) on commit drop; insert into r7 select ("roster-test".api_signup_extra('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '{"phone":"0501110003","extra_fields":"nope"}'::jsonb))::text;
insert into res values ('bad key learns nothing', (select v from r7), '{"error": "invalid_key"}');
insert into res select 'nothing created by the refused calls', count(*)::text, '0' from "roster-test".participants where phone_norm = "roster-test".normalize_phone('0501110003');
select * from res;
rollback;
