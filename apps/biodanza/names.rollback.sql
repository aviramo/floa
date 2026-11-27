-- ROLLBACK for apps/biodanza/names.sql (the live definitions, read with pg_get_functiondef on 2026-11-26, before names.sql ran).
-- Run only to undo names.sql: node scripts/sql.mjs < apps/biodanza/names.rollback.sql
-- The trigger allowed_guard itself is unchanged by names.sql (only its function), so only the function is restored here.
-- The column vivencia_opening.who_email and the Ora email fix are data: the column is dropped at the end (commented out; drop it only if no client writes it),
-- the email fix is not undone (the invisible character was a mistake).
begin;

CREATE OR REPLACE FUNCTION biodanza.me()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biodanza', 'public'
AS $function$ select jsonb_build_object('email', biodanza.jwt_email(), 'allowed', biodanza.is_allowed(), 'admin', biodanza.is_admin(), 'super', biodanza.is_super()) $function$;

CREATE OR REPLACE FUNCTION biodanza.vivencia_partners()
 RETURNS TABLE(vivencia_id uuid, names text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biodanza', 'public'
AS $function$
  with p as (
    select o.vivencia_id, coalesce(nullif(a.note, ''), lower(u.email)) as name, 0 as k, lower(u.email) as em
      from biodanza.vivencia_owners o join auth.users u on u.id = o.user_id left join biodanza.allowed a on a.email = lower(u.email)
    union all
    select s.vivencia_id, coalesce(nullif(a.note, ''), s.email), 1, s.email
      from biodanza.vivencia_shares s left join biodanza.allowed a on a.email = s.email
     where s.role = 'edit')
  select p.vivencia_id, array_agg(p.name order by p.k, p.name)
    from p where biodanza.can_view(p.vivencia_id)
   group by p.vivencia_id $function$;

CREATE OR REPLACE FUNCTION biodanza.vivencia_members(v uuid)
 RETURNS TABLE(email text, note text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biodanza', 'public'
AS $function$
  select lower(u.email)::text, coalesce(a.note, '')::text, 'owner'::text
    from biodanza.vivencia_owners o join auth.users u on u.id = o.user_id left join biodanza.allowed a on a.email = lower(u.email)
   where o.vivencia_id = v and biodanza.can_view(v)
  union all
  select s.email, coalesce(a.note, '')::text, 'edit'::text
    from biodanza.vivencia_shares s left join biodanza.allowed a on a.email = s.email
   where s.vivencia_id = v and s.role = 'edit' and biodanza.can_view(v) $function$;

CREATE OR REPLACE FUNCTION biodanza.share_candidates()
 RETURNS TABLE(email text, note text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biodanza', 'public'
AS $function$
  select a.email, a.note from biodanza.allowed a where biodanza.is_allowed() and a.email <> biodanza.jwt_email() order by a.note, a.email $function$;

CREATE OR REPLACE FUNCTION biodanza.allowed_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biodanza', 'public'
AS $function$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
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
end $function$;

-- create or replace keeps every grant as it is, so none is restated here

drop function if exists biodanza.set_my_name(text);
drop function if exists biodanza.person_name(text);
-- alter table biodanza.vivencia_opening drop column if exists who_email;
commit;
