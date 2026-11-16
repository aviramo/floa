-- Checks for member-email.sql on the TEST schema (node scripts/sql.mjs --table < apps/roster/member-email.check.sql). Rolled back.
-- Expected: link a participant without email -> email set + note; the participant already has one -> kept; the email is another participant's -> skipped, no error.
begin;
create temp table res(t text, v text) on commit drop;
delete from "roster-test".members where user_id = '0be14972-287d-4e7e-aae8-90e63f70fea7';   -- the owner's real link, restored by the rollback
update "roster-test".participants set email = null where email = 'ofir.aviram@gmail.com';   -- ditto (the backfill may have set it)
insert into "roster-test".participants (business_id, first_name, last_name, phone, email) select id, 'ללא', 'אימייל', '+972501130001', null from "roster-test".businesses where slug = 'harpatka';
insert into "roster-test".participants (business_id, first_name, last_name, phone, email) select id, 'עם', 'אימייל', '+972501130002', 'keep@example.com' from "roster-test".businesses where slug = 'harpatka';
insert into "roster-test".members (business_id, user_id, email, participant_id, status)
  select b.id, '0be14972-287d-4e7e-aae8-90e63f70fea7', 'ofir.aviram@gmail.com', p.id, 'approved' from "roster-test".businesses b, "roster-test".participants p where b.slug = 'harpatka' and p.phone = '+972501130001';
insert into res select '1 set', coalesce((select email from "roster-test".participants where phone = '+972501130001'), 'null');
insert into res select '1 note', count(*)::text from "roster-test".notes n join "roster-test".participants p on p.id = n.participant_id where p.phone = '+972501130001' and n.body like 'האימייל נשמר מחשבון הגוגל%';
update "roster-test".members set participant_id = (select id from "roster-test".participants where phone = '+972501130002') where user_id = '0be14972-287d-4e7e-aae8-90e63f70fea7';
insert into res select '2 kept', (select email from "roster-test".participants where phone = '+972501130002');
update "roster-test".participants set email = null where phone = '+972501130001';
insert into "roster-test".participants (business_id, first_name, last_name, phone, email) select id, 'שלישי', 'תפוס', '+972501130003', 'ofir.aviram@gmail.com' from "roster-test".businesses where slug = 'harpatka';
update "roster-test".participants set email = null where phone = '+972501130003';
update "roster-test".participants set email = 'ofir.aviram@gmail.com' where phone = '+972501130003';
update "roster-test".members set participant_id = (select id from "roster-test".participants where phone = '+972501130001') where user_id = '0be14972-287d-4e7e-aae8-90e63f70fea7';
insert into res select '3 taken skipped', coalesce((select email from "roster-test".participants where phone = '+972501130001'), 'null');
select * from res;
rollback;
