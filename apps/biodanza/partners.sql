-- The partners of every vivencia I can see, in one call, for the cards of the list (owner 2026-11-25: a card's
-- description is its partners). A partner is an owner or an account it is shared with for editing; the name is the
-- one the allowlist gives, else the email. Owners first. Same people as vivencia_members, for all vivencias at once.
create or replace function biodanza.vivencia_partners() returns table (vivencia_id uuid, names text[])
  language sql stable security definer set search_path = biodanza, public as $$
  with p as (
    select o.vivencia_id, coalesce(nullif(a.note, ''), lower(u.email)) as name, 0 as k, lower(u.email) as em
      from biodanza.vivencia_owners o join auth.users u on u.id = o.user_id left join biodanza.allowed a on a.email = lower(u.email)
    union all
    select s.vivencia_id, coalesce(nullif(a.note, ''), s.email), 1, s.email
      from biodanza.vivencia_shares s left join biodanza.allowed a on a.email = s.email
     where s.role = 'edit')
  select p.vivencia_id, array_agg(p.name order by p.k, p.name)
    from p where biodanza.can_view(p.vivencia_id)
   group by p.vivencia_id $$;
revoke all on function biodanza.vivencia_partners() from public, anon;
grant execute on function biodanza.vivencia_partners() to authenticated;
