-- NAMES (owner decisions 2026-11-26): every place shows the person's name from the full-name field (biodanza.allowed.note);
-- with no full name, the Google name, then the part of the email before the @. One helper on the server (person_name), one on the client.
-- The database is SHARED with the published app (the old client), so everything here is backward-compatible:
--   * new functions only add; me() only gains a field; the three lists keep their shape and only fill a name that was '' (or the bare email) before;
--   * vivencia_opening only gains a nullable column (who stays the key and the text the old client shows);
--   * allowed_guard only lets through more: an UPDATE that changes nothing but the name.
-- Run as one transaction: node scripts/sql.mjs < apps/biodanza/names.sql     Checks: node scripts/sql.mjs --table < apps/biodanza/names.check.sql
-- Undo: apps/biodanza/names.rollback.sql (the live definitions from before this file).
begin;

-- 1. person_name(email): the one server helper. The full-name field (whitespace collapsed), else the Google name of the account, else the email's
--    local part. Internal: called only from the definer functions below, never from the browser (it could read any account's Google name).
create or replace function biodanza.person_name(e text) returns text
  language sql stable security definer set search_path = biodanza, public as $$
  select coalesce(
    nullif(btrim(regexp_replace((select a.note from biodanza.allowed a where a.email = lower(btrim(e))), '\s+', ' ', 'g')), ''),
    nullif(btrim(regexp_replace((select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.raw_user_meta_data ->> 'name')
                                   from auth.users u where lower(u.email) = lower(btrim(e)) limit 1), '\s+', ' ', 'g')), ''),
    split_part(lower(btrim(coalesce(e, ''))), '@', 1)) $$;
revoke all on function biodanza.person_name(text) from public, anon, authenticated;

-- 2. set_my_name(n): a person changes ONLY their own full name (matched by the signed-in email). Whitespace collapsed; empty or over 80 characters is refused.
--    Returns the name as saved.
create or replace function biodanza.set_my_name(n text) returns text
  language plpgsql volatile security definer set search_path = biodanza, public as $$
declare v text := btrim(regexp_replace(coalesce(n, ''), '\s+', ' ', 'g'));
begin
  if not biodanza.is_allowed() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v = '' then raise exception 'name_empty' using errcode = '22023'; end if;
  if char_length(v) > 80 then raise exception 'name_too_long' using errcode = '22001'; end if;
  update biodanza.allowed set note = v where email = biodanza.jwt_email();
  return v;
end $$;
revoke all on function biodanza.set_my_name(text) from public, anon;
grant execute on function biodanza.set_my_name(text) to authenticated;

-- 3. me(): the same object plus 'name' (additive; the old client ignores it).
create or replace function biodanza.me() returns jsonb
  language sql stable security definer set search_path = biodanza, public as
  $$ select jsonb_build_object('email', biodanza.jwt_email(), 'allowed', biodanza.is_allowed(), 'admin', biodanza.is_admin(), 'super', biodanza.is_super(),
                               'name', case when biodanza.is_allowed() then biodanza.person_name(biodanza.jwt_email()) else '' end) $$;

-- 4. the three lists: the same columns, the name from person_name (filled where it was '' or the bare email before).
create or replace function biodanza.vivencia_partners() returns table (vivencia_id uuid, names text[])
  language sql stable security definer set search_path = biodanza, public as $$
  with p as (
    select o.vivencia_id, biodanza.person_name(lower(u.email)) as name, 0 as k
      from biodanza.vivencia_owners o join auth.users u on u.id = o.user_id
    union all
    select s.vivencia_id, biodanza.person_name(s.email), 1
      from biodanza.vivencia_shares s
     where s.role = 'edit')
  select p.vivencia_id, array_agg(p.name order by p.k, p.name)
    from p where biodanza.can_view(p.vivencia_id)
   group by p.vivencia_id $$;

create or replace function biodanza.vivencia_members(v uuid) returns table (email text, note text, role text)
  language sql stable security definer set search_path = biodanza, public as $$
  select lower(u.email)::text, biodanza.person_name(lower(u.email))::text, 'owner'::text
    from biodanza.vivencia_owners o join auth.users u on u.id = o.user_id
   where o.vivencia_id = v and biodanza.can_view(v)
  union all
  select s.email, biodanza.person_name(s.email)::text, 'edit'::text
    from biodanza.vivencia_shares s
   where s.vivencia_id = v and s.role = 'edit' and biodanza.can_view(v) $$;

create or replace function biodanza.share_candidates() returns table (email text, note text)
  language sql stable security definer set search_path = biodanza, public as $$
  select a.email, biodanza.person_name(a.email) from biodanza.allowed a
   where biodanza.is_allowed() and a.email <> biodanza.jwt_email()
   order by biodanza.person_name(a.email), a.email $$;

-- 5. allowed_guard: an UPDATE that changes only the name passes for anyone the table's RLS lets write (an admin renaming another admin, and
--    set_my_name). Everything else is as before: permissions still change only through a super admin.
create or replace function biodanza.allowed_guard() returns trigger
  language plpgsql security definer set search_path = biodanza, public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.email is not distinct from old.email and new.is_admin is not distinct from old.is_admin
     and new.is_super is not distinct from old.is_super and new.added_at is not distinct from old.added_at then
    return new;   -- only the name (note) changed
  end if;
  if biodanza.is_super() then
    if (tg_op = 'DELETE' and old.is_super) or (tg_op = 'UPDATE' and old.is_super and not new.is_super) then
      if (select count(*) from biodanza.allowed where is_super) <= 1 then raise exception 'last_super'; end if;
    end if;
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' and (new.is_admin or new.is_super) then raise exception 'only_super'; end if;
  if tg_op = 'UPDATE' and (old.is_admin or old.is_super or new.is_admin <> old.is_admin or new.is_super <> old.is_super) then raise exception 'only_super'; end if;
  if tg_op = 'DELETE' and (old.is_admin or old.is_super) then raise exception 'only_super'; end if;
  return coalesce(new, old);
end $$;
-- (the trigger allowed_guard on biodanza.allowed is unchanged: it already calls this function)

-- 6. the opening of the evening keyed by the PERSON: who_email names whose paragraph it is, so the title follows a rename.
--    who stays the key (primary key with vivencia_id) and the text the old client shows; a row the old client adds has who_email null,
--    and the new client then shows who as before.
alter table biodanza.vivencia_opening add column if not exists who_email text;

-- 6b. backfill: each named row ("אופיר", "הדר", "אופיר#2"...) to the ONE member of its vivencia (owner or editor) whose name it is:
--     the whole name, its first word, or the first word and a prefix of the family name (the client's "אופיר א׳"). No match or two: left null.
with lab as (
  select o.vivencia_id, o.who, btrim(split_part(o.who, '#', 1)) as label
    from biodanza.vivencia_opening o where o.who <> '' and o.who_email is null),
mem as (
  select o.vivencia_id, lower(u.email) as email from biodanza.vivencia_owners o join auth.users u on u.id = o.user_id
  union
  select s.vivencia_id, s.email from biodanza.vivencia_shares s where s.role = 'edit'),
nm as (select m.vivencia_id, m.email, biodanza.person_name(m.email) as full_name from mem m),
hit as (
  select l.vivencia_id, l.who, n.email from lab l join nm n on n.vivencia_id = l.vivencia_id
   where l.label = n.full_name
      or l.label = split_part(n.full_name, ' ', 1)
      or (position(' ' in l.label) > 0 and split_part(l.label, ' ', 1) = split_part(n.full_name, ' ', 1)
          and starts_with(substr(n.full_name, char_length(split_part(n.full_name, ' ', 1)) + 2), replace(substr(l.label, position(' ' in l.label) + 1), '׳', '')))),
one as (select vivencia_id, who, min(email) as email from hit group by vivencia_id, who having count(distinct email) = 1)
update biodanza.vivencia_opening o set who_email = one.email
  from one where o.vivencia_id = one.vivencia_id and o.who = one.who and o.who_email is null;

-- 7. data fix: Ora's allowlist email carries an invisible right-to-left mark (U+200F) at its end, so her Google sign-in never matched it.
--    Only that one row (matched exactly, with the mark), and only if the clean address is not already there.
update biodanza.allowed set email = regexp_replace(email, '[^a-z0-9._%+@-]', '', 'g')
 where email = 'orabenishai@gmail.com' || chr(8207)
   and not exists (select 1 from biodanza.allowed where email = 'orabenishai@gmail.com');

commit;
