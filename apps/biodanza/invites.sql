-- One-time invite links for a PRIVATE vivencia (owner 2026-11-25).
-- An owner makes a link; the first allowed facilitator who opens it becomes a VIEWER of the vivencia, and the link is
-- deleted in the same step, so it cannot be passed on. Somebody who is not on the allowlist cannot use it (the link stays).
-- A public vivencia needs no invite: its own address is the link.
create table if not exists biodanza.vivencia_invites (
  token       text primary key default encode(gen_random_bytes(18), 'hex'),
  vivencia_id uuid not null references biodanza.vivencias(id) on delete cascade,
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
alter table biodanza.vivencia_invites enable row level security;
drop policy if exists invites_owner on biodanza.vivencia_invites;
create policy invites_owner on biodanza.vivencia_invites for all to authenticated
  using (biodanza.owns(vivencia_id)) with check (biodanza.owns(vivencia_id));
grant select, insert, delete on biodanza.vivencia_invites to authenticated;

-- Redeeming: allowed only; the token is gone after this, whatever happens next.
-- Returns the vivencia id. Errors: 'not_allowed' (not on the allowlist), 'invalid' (used, deleted or never made).
create or replace function biodanza.redeem_invite(t text) returns uuid
  language plpgsql security definer set search_path = biodanza, public as $$
declare v uuid; em text := biodanza.jwt_email();
begin
  if not biodanza.is_allowed() or em is null or em = '' then raise exception 'not_allowed' using errcode = '42501'; end if;
  delete from biodanza.vivencia_invites where token = t returning vivencia_id into v;
  if v is null then raise exception 'invalid' using errcode = 'P0002'; end if;
  if not exists (select 1 from biodanza.vivencia_owners o join auth.users u on u.id = o.user_id where o.vivencia_id = v and lower(u.email) = em) then
    insert into biodanza.vivencia_shares (vivencia_id, email, role) values (v, em, 'view') on conflict (vivencia_id, email) do nothing;   -- already a partner: stays a partner
  end if;
  return v;
end $$;
revoke all on function biodanza.redeem_invite(text) from public, anon;
grant execute on function biodanza.redeem_invite(text) to authenticated;
