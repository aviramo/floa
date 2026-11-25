-- Public or private vivencia, 2026-11-25, by the owner's decision.
-- Public: every allowed facilitator who is signed in can SEE it (read only), and it is in their list.
-- Private: only its owners and whoever it is shared with, as before.
-- Every vivencia, the existing ones too, starts public. Only an owner switches it.
alter table biodanza.vivencias add column if not exists is_public boolean not null default true;

create or replace function biodanza.can_view(v uuid) returns boolean
  language sql stable security definer set search_path = biodanza, public as $$
  select biodanza.is_allowed() and (
    exists (select 1 from biodanza.vivencia_owners where vivencia_id = v and user_id = auth.uid())
    or exists (select 1 from biodanza.vivencia_shares where vivencia_id = v and email = biodanza.jwt_email())
    or exists (select 1 from biodanza.vivencias where id = v and is_public)) $$;

-- somebody with edit rights may rename it, but only an owner decides who sees it
create or replace function biodanza.vivencia_public_guard() returns trigger
  language plpgsql security definer set search_path = biodanza, public as $$
begin
  if new.is_public is distinct from old.is_public and not biodanza.owns(new.id) then
    raise exception 'only an owner changes who sees a vivencia' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists vivencia_public_guard on biodanza.vivencias;
create trigger vivencia_public_guard before update of is_public on biodanza.vivencias
  for each row execute function biodanza.vivencia_public_guard();
