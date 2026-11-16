-- A business may forbid its participants to cancel a registration from the personal area (owner's decision for harpatka, 2026-11-17).
-- business_settings.allow_self_cancel, default true: every existing business behaves exactly as before. When it is false, roster.me_unregister
-- answers 'forbidden' before it touches anything. An admin removing a registration from the admin page is not affected. The reply of roster.me
-- does not change (the page that hides the button gets the fact from its own side).
-- For one business (here harpatka):  update roster.business_settings set allow_self_cancel = false where business_id = (select id from roster.businesses where slug = 'harpatka');
alter table roster.business_settings add column if not exists allow_self_cancel boolean not null default true;

create or replace function roster.me_unregister(p_slug text, p_meeting uuid)
returns text language plpgsql security definer set search_path = roster, public as $fn$
declare r jsonb := roster.me_resolve(p_slug, true); st text := r->>'status'; b uuid := nullif(r->>'business_id', '')::uuid; pid uuid := nullif(r->>'participant_id', '')::uuid;
        mt roster.meetings; a roster.attendance;
begin
  if st <> 'ok' then return roster.me_text(st); end if;
  if not coalesce((select s.allow_self_cancel from roster.business_settings s where s.business_id = b), true) then return 'forbidden'; end if;
  select * into mt from roster.meetings where id = p_meeting and business_id = b;
  if not found or mt.meeting_date < roster.today() then return 'past'; end if;
  select * into a from roster.attendance where business_id = b and participant_id = pid and meeting_id = p_meeting;
  if not found then return 'not_registered'; end if;
  if coalesce(a.attended, false) then return 'attended'; end if;
  perform set_config('roster.source', 'me', true);
  delete from roster.attendance where business_id = b and participant_id = pid and meeting_id = p_meeting;
  return 'cancelled';
end $fn$;
