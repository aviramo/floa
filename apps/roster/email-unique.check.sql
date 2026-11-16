-- Checks for email-unique.sql on the TEST schema (node scripts/sql.mjs --table < apps/roster/email-unique.check.sql). Rolled back.
-- Expected: api insert with a taken email -> stored without it; api update to a taken email -> keeps the old one; admin-style insert -> email_taken.
begin;
create temp table res(t text, v text) on commit drop;
insert into "roster-test".participants (business_id, first_name, last_name, phone, email) select id, 'א', 'אחד', '+972501120001', 'same@example.com' from "roster-test".businesses where slug = 'harpatka';
select set_config('roster.source', 'api', true);
insert into "roster-test".participants (business_id, first_name, last_name, phone, email) select id, 'ב', 'שניים', '+972501120002', 'same@example.com' from "roster-test".businesses where slug = 'harpatka';
insert into res select 'api insert keeps no email', coalesce((select email from "roster-test".participants where phone = '+972501120002'), 'null');
update "roster-test".participants set email = 'mine@example.com' where phone = '+972501120002';
update "roster-test".participants set email = 'same@example.com' where phone = '+972501120002';
insert into res select 'api update keeps the old one', (select email from "roster-test".participants where phone = '+972501120002');
select set_config('roster.source', '', true);
do $$ begin
  begin
    insert into "roster-test".participants (business_id, first_name, last_name, phone, email) select id, 'ג', 'שלושה', '+972501120003', 'same@example.com' from "roster-test".businesses where slug = 'harpatka';
    insert into res values ('admin insert', 'ALLOWED (wrong)');
  exception when unique_violation then insert into res values ('admin insert', 'email_taken: ' || sqlerrm);
  end;
end $$;
select * from res;
rollback;
