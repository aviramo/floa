-- first-source-only.sql (owner-approved 2026-11-19, TEST FIRST)
-- The way a participant arrived (source_promoter_id on a registration) belongs to the participant's FIRST registration only.
-- Until now the insert trigger gave it to the first registration, but nothing stopped a later registration from carrying one
-- (two such rows existed, both harpatka). Now: a registration that is not the participant's first never keeps a source,
-- on insert or on update; and the two stray rows are cleared. Written with the schema name `roster`; for roster-test replace it
-- (never copy a test definition to production). AUM is not touched: no row of it is affected.
create or replace function roster.att_source() returns trigger
language plpgsql security definer set search_path = roster, public as $$
begin
  if tg_op = 'INSERT' and new.source_promoter_id is null
     and not exists (select 1 from roster.attendance a where a.participant_id = new.participant_id) then
    select p.promoter_id into new.source_promoter_id
      from roster.participants p where p.id = new.participant_id and p.business_id = new.business_id;
  end if;
  if new.source_promoter_id is not null and exists (
       select 1 from roster.attendance a
        where a.participant_id = new.participant_id and a.meeting_id <> new.meeting_id
          and (a.created_at, a.meeting_id) < (new.created_at, new.meeting_id)) then
    new.source_promoter_id := null;   -- not the first registration: no arrival source
  end if;
  return new;
end $$;
drop trigger if exists att_source on roster.attendance;
create trigger att_source before insert or update of source_promoter_id on roster.attendance
  for each row execute function roster.att_source();

-- the stray rows: a source on a registration that is not the participant's first
update roster.attendance a set source_promoter_id = null
 where a.source_promoter_id is not null
   and exists (select 1 from roster.attendance f where f.participant_id = a.participant_id and f.meeting_id <> a.meeting_id
                and (f.created_at, f.meeting_id) < (a.created_at, a.meeting_id));
