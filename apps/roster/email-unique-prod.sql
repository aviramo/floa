-- PRODUCTION VERSION of email-unique.sql (narrowed). Needs prod-columns.sql first.
-- The guard trigger returns the row untouched, first thing, for a business whose business_settings.email_link is off (AUM): no normalisation, no check, nothing.
-- For a business with the switch on: one email per participant inside that business (never across businesses). A write from the public API / personal area
-- (roster.source = 'api' or 'me') does not store a taken email and succeeds; any other write fails with 'email_taken' (23505). An advisory lock per business+email
-- makes two simultaneous writes of the same email take turns.
-- DELIBERATELY NO UNIQUE INDEX here: an index would also reject a duplicate email written for a business with the switch off (AUM's signup would start failing).
-- The index (business_id, email) can be added later, per owner decision, once no business needs to write duplicates:
--   create unique index if not exists roster_participants_email_uq on roster.participants (business_id, email) where email is not null and btrim(email) <> '';
create or replace function roster.participants_email_guard()
returns trigger language plpgsql set search_path = roster, public as $fn$
declare src text := coalesce(current_setting('roster.source', true), '');
begin
  if not coalesce((select s.email_link from roster.business_settings s where s.business_id = new.business_id), false) then return new; end if;
  if new.email is null or btrim(new.email) = '' then new.email := null; return new; end if;
  if tg_op = 'UPDATE' and new.email is not distinct from old.email then return new; end if;
  perform pg_advisory_xact_lock(hashtext('roster_email:' || new.business_id::text || ':' || lower(btrim(new.email))));
  if exists (select 1 from roster.participants x where x.business_id = new.business_id and x.id <> new.id and lower(btrim(x.email)) = lower(btrim(new.email))) then
    if src in ('api', 'me') then
      new.email := case when tg_op = 'UPDATE' then old.email else null end;
      return new;
    end if;
    raise exception 'email_taken' using errcode = '23505', detail = 'another participant of this business has this email';
  end if;
  return new;
end $fn$;
drop trigger if exists roster_participants_email_guard on roster.participants;
create trigger roster_participants_email_guard before insert or update of email on roster.participants
  for each row execute function roster.participants_email_guard();
