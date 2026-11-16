-- The verified Google email of a linked account becomes the participant's email, when the participant has none (never overwritten).
-- A trigger on roster.members, so it covers every way an account gets linked (me_phone, me_link_email, an admin approving) without touching
-- their code or answers. Verified = auth.users says the account's email is confirmed and equals the members row's email. The one-email-per-participant
-- rule (email-unique.sql) is respected: if the email already belongs to another participant of the business, nothing is saved and nothing fails.
create or replace function roster.members_save_email()
returns trigger language plpgsql security definer set search_path = roster, public as $fn$
declare em text := lower(btrim(coalesce(new.email, ''))); n int;
begin
  if new.participant_id is null or new.status <> 'approved' or em = '' then return new; end if;
  if not exists (select 1 from auth.users u where u.id = new.user_id and u.email_confirmed_at is not null and lower(u.email) = em) then return new; end if;
  begin
    update roster.participants set email = em where id = new.participant_id and business_id = new.business_id and (email is null or btrim(email) = '');
    get diagnostics n = row_count;
    if n > 0 then perform roster.sys_note(new.business_id, new.participant_id, 'האימייל נשמר מחשבון הגוגל: ' || em, 'google_email'); end if;
  exception when unique_violation or check_violation then null;   -- taken by another participant, or not a valid address: skipped silently
  end;
  return new;
end $fn$;
revoke all on function roster.members_save_email() from public, anon, authenticated;
drop trigger if exists roster_members_save_email on roster.members;
create trigger roster_members_save_email after insert or update of participant_id, status, email on roster.members
  for each row execute function roster.members_save_email();

-- backfill: participants that are linked but have no email get the (verified) email of their account, where the one-email rule allows
update roster.participants p set email = m.email
  from roster.members m
 where m.business_id = p.business_id and m.participant_id = p.id and m.status = 'approved'
   and (p.email is null or btrim(p.email) = '') and m.email <> '' and m.email = lower(btrim(m.email))
   and exists (select 1 from auth.users u where u.id = m.user_id and u.email_confirmed_at is not null and lower(u.email) = m.email)
   and not exists (select 1 from roster.participants x where x.business_id = p.business_id and x.id <> p.id and x.email = m.email)
   and (select count(*) from roster.members m2 where m2.business_id = m.business_id and m2.status = 'approved' and m2.email = m.email and m2.participant_id is not null) = 1;
