-- PRODUCTION VERSION of member-email.sql (narrowed; NO backfill). Needs prod-columns.sql first. The trigger on roster.members returns at once for a business whose
-- business_settings.email_link is off (AUM), writing nothing. For a business with the switch on: the verified Google email of a linked account is saved on the participant
-- when it has none (never overwritten).
create or replace function roster.members_save_email()
returns trigger language plpgsql security definer set search_path = roster, public as $fn$
declare em text := lower(btrim(coalesce(new.email, ''))); n int;
begin
  if not coalesce((select s.email_link from roster.business_settings s where s.business_id = new.business_id), false) then return new; end if;   -- switch off: nothing
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
