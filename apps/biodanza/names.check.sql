-- Checks for names.sql, AFTER it ran (node scripts/sql.mjs --table < apps/biodanza/names.check.sql). Everything is rolled back.
-- The signed-in person is faked through request.jwt.claims (auth.jwt() and auth.uid() read it), as postgres: the functions are definer, and the
-- trigger reads the claims, so what is checked is the functions and the guard, not the table's RLS.
-- Expected: every row's ok = true.
begin;
create temp table res(t text, v text, ok boolean) on commit drop;
create or replace function pg_temp.as_user(e text, uid uuid) returns void language sql as
  $$ select set_config('request.jwt.claims', json_build_object('email', e, 'sub', uid, 'role', 'authenticated')::text, true) $$;

-- test people (rolled back): two plain admins, a member with no name and no account
insert into biodanza.allowed (email, is_admin, note) values
  ('names.check.a1@example.com', true, 'בודק  ראשון'), ('names.check.a2@example.com', true, 'בודק שני'), ('names.check.m@example.com', false, '');

-- 1. person_name: the full name (whitespace collapsed); no name and no account: the email's local part; the Google name when there is no full name
insert into res select '1 full name', biodanza.person_name('names.check.a1@example.com'), biodanza.person_name('names.check.a1@example.com') = 'בודק ראשון';
insert into res select '1 local part', biodanza.person_name('names.check.m@example.com'), biodanza.person_name('names.check.m@example.com') = 'names.check.m';
update biodanza.allowed set note = '' where email = 'once.app.support@gmail.com';
insert into res select '1 google name (empty note)', biodanza.person_name('once.app.support@gmail.com'), biodanza.person_name('once.app.support@gmail.com') = 'Once';

-- 2. me() has every old field and the new name
select pg_temp.as_user('names.check.a1@example.com', gen_random_uuid());
insert into res select '2 me', biodanza.me()::text, biodanza.me() ?& array['email', 'allowed', 'admin', 'super', 'name'] and biodanza.me() ->> 'name' = 'בודק ראשון';

-- 3. set_my_name: my own name only; empty and over 80 refused
insert into res select '3 set', biodanza.set_my_name('  בודק   מתוקן '), null;   -- the update is seen only by the next statement
update res set ok = (select note from biodanza.allowed where email = 'names.check.a1@example.com') = 'בודק מתוקן' where t = '3 set';
insert into res select '3 other untouched', (select note from biodanza.allowed where email = 'names.check.a2@example.com'), (select note from biodanza.allowed where email = 'names.check.a2@example.com') = 'בודק שני';
do $$ begin perform biodanza.set_my_name('   '); insert into res values ('3 empty refused', 'passed', false);
  exception when others then insert into res values ('3 empty refused', sqlerrm, sqlerrm = 'name_empty'); end $$;
do $$ begin perform biodanza.set_my_name(repeat('א', 81)); insert into res values ('3 81 refused', 'passed', false);
  exception when others then insert into res values ('3 81 refused', sqlerrm, sqlerrm = 'name_too_long'); end $$;
insert into res select '3 80 ok', char_length(biodanza.set_my_name(repeat('א', 80)))::text, true;

-- 4. a plain admin renames another admin; changing that admin's permissions is still refused
do $$ begin update biodanza.allowed set note = 'שם חדש' where email = 'names.check.a2@example.com'; insert into res values ('4 rename admin', 'passed', true);
  exception when others then insert into res values ('4 rename admin', sqlerrm, false); end $$;
do $$ begin update biodanza.allowed set is_admin = false where email = 'names.check.a2@example.com'; insert into res values ('4 demote refused', 'passed', false);
  exception when others then insert into res values ('4 demote refused', sqlerrm, sqlerrm = 'only_super'); end $$;
do $$ begin update biodanza.allowed set note = 'x', is_admin = false where email = 'names.check.a2@example.com'; insert into res values ('4 rename+demote refused', 'passed', false);
  exception when others then insert into res values ('4 rename+demote refused', sqlerrm, sqlerrm = 'only_super'); end $$;

-- 5. the shapes the old client reads did not change
insert into res select '5 ' || p.proname, pg_get_function_result(p.oid),
  pg_get_function_result(p.oid) = case p.proname when 'vivencia_members' then 'TABLE(email text, note text, role text)'
                                                   when 'vivencia_partners' then 'TABLE(vivencia_id uuid, names text[])'
                                                   when 'share_candidates' then 'TABLE(email text, note text)' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'biodanza' and p.proname in ('vivencia_members', 'vivencia_partners', 'share_candidates');
select pg_temp.as_user('ofir.aviram@gmail.com', (select id from auth.users where lower(email) = 'ofir.aviram@gmail.com'));
insert into res select '5 candidates have names', count(*)::text, count(*) > 0 and bool_and(note <> '') from biodanza.share_candidates();
insert into res select '5 members have names', string_agg(note, ', '), bool_and(note <> '') from biodanza.vivencia_members('e230250c-4a2a-4140-bd01-f48cb8474240');

-- 6. the opening: the column is there, and every named row found its person
insert into res select '6 who_email column', count(*)::text, count(*) = 1 from information_schema.columns where table_schema = 'biodanza' and table_name = 'vivencia_opening' and column_name = 'who_email';
insert into res select '6 backfill', string_agg(who || '=' || coalesce(who_email, 'null'), ', '), bool_and(who_email is not null) from biodanza.vivencia_opening where who <> '';

-- 7. Ora's email is clean
insert into res select '7 ora clean', string_agg(encode(convert_to(email, 'UTF8'), 'hex'), ','), count(*) = 1 and bool_and(email = 'orabenishai@gmail.com') from biodanza.allowed where email like 'orabenishai%';

-- 8. person_name is not callable from the browser; set_my_name is, for a signed-in person only
insert into res select '8 person_name closed', '', not has_function_privilege('authenticated', 'biodanza.person_name(text)', 'execute') and not has_function_privilege('anon', 'biodanza.person_name(text)', 'execute');
insert into res select '8 set_my_name', '', has_function_privilege('authenticated', 'biodanza.set_my_name(text)', 'execute') and not has_function_privilege('anon', 'biodanza.set_my_name(text)', 'execute');

select * from res;
rollback;
