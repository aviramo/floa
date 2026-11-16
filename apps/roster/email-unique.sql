-- One email, one participant (per business): no two participants (phone numbers) may have the same email (owner's rule, 2026-11-16).
-- The index is the guarantee. The trigger decides what happens to a write that would break it:
--   * from the public API and the personal area (roster.source = 'api' or 'me'): the email is NOT stored (an insert gets none, an update keeps the old one),
--     and the call succeeds as before. A visitor is never told that an email already belongs to someone (no way to probe emails), and no API answer changes.
--   * from anywhere else (the admin page, direct writes): the write fails with 'email_taken' (SQLSTATE 23505), the page shows it next to the field.
create or replace function roster.participants_email_guard()
returns trigger language plpgsql set search_path = roster, public as $fn$
declare src text := coalesce(current_setting('roster.source', true), '');
begin
  if new.email is null or btrim(new.email) = '' then new.email := null; return new; end if;
  if tg_op = 'UPDATE' and new.email is not distinct from old.email then return new; end if;
  if exists (select 1 from roster.participants x where x.business_id = new.business_id and x.id <> new.id and x.email = new.email) then
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
create unique index if not exists roster_participants_email_uq on roster.participants (business_id, email) where email is not null and btrim(email) <> '';
