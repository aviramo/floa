-- Checks for first-source-only.sql on the TEST schema (run: node scripts/sql.mjs --table < apps/roster/first-source-only.check.sql). Rolled back.
-- Expected: the first registration keeps the participant's source; a later one gets none, even when one is given on insert or by update.
begin;
create temp table res(t text, v text) on commit drop;
do $$ declare b uuid; pid uuid; m1 uuid; m2 uuid; pr uuid := '4781bace-7072-4a6c-ab9f-f63a98f55881'; begin
  select id into b from "roster-test".businesses where slug = 'harpatka';
  insert into "roster-test".participants (business_id, first_name, last_name, phone, promoter_id, source, age, gender) values (b, 'Src', 'Check', '+972501110099', pr, 'site-ad', 40, 'male') returning id into pid;
  select id into m1 from "roster-test".meetings where business_id = b order by meeting_date limit 1;
  select id into m2 from "roster-test".meetings where business_id = b order by meeting_date desc limit 1;
  insert into "roster-test".attendance (business_id, participant_id, meeting_id) values (b, pid, m1);
  insert into "roster-test".attendance (business_id, participant_id, meeting_id, source_promoter_id) values (b, pid, m2, pr);
  insert into res select 'first keeps', (source_promoter_id = pr)::text from "roster-test".attendance where participant_id = pid and meeting_id = m1;
  insert into res select 'later given on insert', coalesce(source_promoter_id::text, '(none)') from "roster-test".attendance where participant_id = pid and meeting_id = m2;
  update "roster-test".attendance set source_promoter_id = pr where participant_id = pid and meeting_id = m2;
  insert into res select 'later given by update', coalesce(source_promoter_id::text, '(none)') from "roster-test".attendance where participant_id = pid and meeting_id = m2;
end $$;
select * from res order by t;
rollback;
