-- Checks for apps/biodanza/realtime.sql, AFTER it ran (node scripts/sql.mjs --table < apps/biodanza/realtime.check.sql). Everything is rolled back.
-- Rolled-back writes are never decoded, so nothing here reaches a Realtime listener.
-- The signed-in person is faked through request.jwt.claims and SET ROLE authenticated, so the realtime.messages policies are the real RLS check.
-- Results under the authenticated role go through set_config (the temp table belongs to postgres). Expected: every row's ok = true.
begin;
create temp table res(t text, v text, ok boolean) on commit drop;
create or replace function pg_temp.as_user(e text, uid uuid) returns void language sql as
  $$ select set_config('request.jwt.claims', json_build_object('email', e, 'sub', uid, 'role', 'authenticated')::text, true) $$;

-- the people: V is a private vivencia, its owner is the viewer; "other" is an allowed person with no owner or share row on V; the stranger is not allowed at all
do $$
declare v uuid; ue text; uid uuid; oe text;
begin
  select o.vivencia_id, lower(u.email), u.id into v, ue, uid
    from biodanza.vivencia_owners o join biodanza.vivencias x on x.id = o.vivencia_id and not x.is_public join auth.users u on u.id = o.user_id
   where exists (select 1 from biodanza.allowed a where a.email = lower(u.email)) limit 1;
  select a.email into oe from biodanza.allowed a
   where a.email <> ue and not exists (select 1 from biodanza.vivencia_shares s where s.vivencia_id = v and s.email = a.email)
     and not exists (select 1 from biodanza.vivencia_owners o join auth.users u on u.id = o.user_id where o.vivencia_id = v and lower(u.email) = a.email) limit 1;
  perform set_config('chk.v', v::text, true); perform set_config('chk.ue', ue, true); perform set_config('chk.uid', uid::text, true); perform set_config('chk.oe', coalesce(oe, ''), true);
end $$;
insert into res select '0 test people', current_setting('chk.v') || ' / other=' || current_setting('chk.oe'), current_setting('chk.v') <> '' and current_setting('chk.oe') <> '';

-- 1. publication: the six earlier tables and the two new ones
insert into res select '1 pub ' || t, '', exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'biodanza' and tablename = t)
  from unnest(array['vivencias', 'vivencia_items', 'vivencia_owners', 'vivencia_shares', 'vivencia_item_facilitators', 'vivencia_opening', 'vivencia_reception_music', 'item_music_options']) t;
insert into res select '1 roster pub untouched', count(*)::text, count(*) = 34 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname in ('roster', 'roster-test');

-- 2. rev: the column, and each update raises it by one, also when a writer sends its own rev
insert into res select '2 rev column ' || c.table_name, c.data_type || ' ' || c.is_nullable || ' ' || c.column_default, c.data_type = 'bigint' and c.is_nullable = 'NO' and c.column_default = '0'
  from information_schema.columns c where c.table_schema = 'biodanza' and c.column_name = 'rev' and c.table_name in ('vivencias', 'vivencia_items', 'vivencia_opening');
do $$
declare a bigint; b bigint; c bigint; k uuid; w text;
begin
  select id, rev into k, a from biodanza.vivencia_items limit 1;
  update biodanza.vivencia_items set notes = notes where id = k;           select rev into b from biodanza.vivencia_items where id = k;
  update biodanza.vivencia_items set rev = 999 where id = k;               select rev into c from biodanza.vivencia_items where id = k;
  insert into res values ('2 bump vivencia_items', a || '->' || b || '->' || c, b = a + 1 and c = a + 2);
  select id, rev into k, a from biodanza.vivencias limit 1;
  update biodanza.vivencias set title = title where id = k;                select rev into b from biodanza.vivencias where id = k;
  update biodanza.vivencias set rev = 999 where id = k;                    select rev into c from biodanza.vivencias where id = k;
  insert into res values ('2 bump vivencias', a || '->' || b || '->' || c, b = a + 1 and c = a + 2);
  select vivencia_id, who, rev into k, w, a from biodanza.vivencia_opening limit 1;
  if k is null then insert into res values ('2 bump vivencia_opening', 'no rows to try', false); return; end if;
  update biodanza.vivencia_opening set body = body where vivencia_id = k and who = w;     select rev into b from biodanza.vivencia_opening where vivencia_id = k and who = w;
  insert into biodanza.vivencia_opening (vivencia_id, who, body) values (k, w, 'x') on conflict (vivencia_id, who) do update set body = excluded.body;   -- the old client's upsert
  select rev into c from biodanza.vivencia_opening where vivencia_id = k and who = w;
  insert into res values ('2 bump vivencia_opening (+upsert)', a || '->' || b || '->' || c, b = a + 1 and c = a + 2);
end $$;

-- 2b. shapes the old client reads: the same columns as before, plus rev at the end; replica identity unchanged
insert into res select '2b columns ' || table_name, string_agg(column_name, ',' order by ordinal_position),
  string_agg(column_name, ',' order by ordinal_position) = case table_name
    when 'vivencias' then 'id,title,notes,created_by,created_at,updated_at,opening_name,opening_text,is_public,rev'
    when 'vivencia_items' then 'id,vivencia_id,position,exercise_id,music_id,notes,poetics,guidance,title,backlog,rev'
    when 'vivencia_opening' then 'vivencia_id,who,body,position,updated_at,who_email,rev' end
  from information_schema.columns where table_schema = 'biodanza' and table_name in ('vivencias', 'vivencia_items', 'vivencia_opening') group by table_name;
insert into res select '2b replica identity', string_agg(relname || '=' || relreplident::text, ',' order by relname),
  string_agg(relname || '=' || relreplident::text, ',' order by relname) = 'item_music_options=d,vivencia_items=d,vivencia_opening=f,vivencia_reception_music=d,vivencias=d'
  from pg_class where relnamespace = 'biodanza'::regnamespace and relname in ('vivencias', 'vivencia_items', 'vivencia_opening', 'vivencia_reception_music', 'item_music_options');

-- 3. the policies, and RLS still on
insert into res select '3 policies', string_agg(policyname || ':' || cmd || ':' || roles::text, ' | ' order by policyname), count(*) = 2
  from pg_policies where schemaname = 'realtime' and tablename = 'messages';
insert into res select '3 rls on realtime.messages', relrowsecurity::text, relrowsecurity from pg_class where oid = 'realtime.messages'::regclass;

-- 3a. the viewer: sends to and hears V's private channel
select pg_temp.as_user(current_setting('chk.ue'), current_setting('chk.uid')::uuid);
select set_config('realtime.topic', 'biodanza:vivencia:' || current_setting('chk.v'), true);
set local role authenticated;
do $$ begin
  insert into realtime.messages (topic, extension, payload, event, private) values (realtime.topic(), 'broadcast', '{}', 'check', true);
  perform set_config('chk.r1', 'sent', true);
exception when others then perform set_config('chk.r1', sqlstate || ' ' || sqlerrm, true); end $$;
select set_config('chk.r2', (select count(*) from realtime.messages where topic = realtime.topic())::text, true);
reset role;
insert into res values ('3a viewer sends', current_setting('chk.r1'), current_setting('chk.r1') = 'sent'),
                       ('3a viewer hears', current_setting('chk.r2'), current_setting('chk.r2') = '1');

-- 3b. an allowed person with no access to the private V: neither sends nor hears (the viewer's message is in the table)
select pg_temp.as_user(current_setting('chk.oe'), gen_random_uuid());
set local role authenticated;
do $$ begin
  insert into realtime.messages (topic, extension, payload, event, private) values (realtime.topic(), 'broadcast', '{}', 'check', true);
  perform set_config('chk.r1', 'sent', true);
exception when others then perform set_config('chk.r1', sqlstate, true); end $$;
select set_config('chk.r2', (select count(*) from realtime.messages where topic = realtime.topic())::text, true);
reset role;
insert into res values ('3b other allowed: send refused', current_setting('chk.r1'), current_setting('chk.r1') = '42501'),
                       ('3b other allowed: hears nothing', current_setting('chk.r2'), current_setting('chk.r2') = '0');

-- 3c. a stranger (not allowed): neither
select pg_temp.as_user('realtime.check.stranger@example.com', gen_random_uuid());
set local role authenticated;
do $$ begin
  insert into realtime.messages (topic, extension, payload, event, private) values (realtime.topic(), 'broadcast', '{}', 'check', true);
  perform set_config('chk.r1', 'sent', true);
exception when others then perform set_config('chk.r1', sqlstate, true); end $$;
select set_config('chk.r2', (select count(*) from realtime.messages where topic = realtime.topic())::text, true);
reset role;
insert into res values ('3c stranger: send refused', current_setting('chk.r1'), current_setting('chk.r1') = '42501'),
                       ('3c stranger: hears nothing', current_setting('chk.r2'), current_setting('chk.r2') = '0');

-- 3d. the viewer on topics that are not a vivencia channel: false, not an error (bad uuid, the old public topic name)
select pg_temp.as_user(current_setting('chk.ue'), current_setting('chk.uid')::uuid);
select set_config('realtime.topic', 'biodanza:vivencia:not-a-uuid', true);
set local role authenticated;
do $$ begin
  insert into realtime.messages (topic, extension, payload, event, private) values (realtime.topic(), 'broadcast', '{}', 'check', true);
  perform set_config('chk.r1', 'sent', true);
exception when others then perform set_config('chk.r1', sqlstate, true); end $$;
select set_config('chk.r2', (select count(*) from realtime.messages)::text, true);
select set_config('realtime.topic', 'biodanza-cur:' || current_setting('chk.v'), true);
select set_config('chk.r3', (select count(*) from realtime.messages)::text, true);
reset role;
insert into res values ('3d bad uuid: refused, no error', current_setting('chk.r1'), current_setting('chk.r1') = '42501'),
                       ('3d bad uuid: hears nothing', current_setting('chk.r2'), current_setting('chk.r2') = '0'),
                       ('3d old cur topic: no private access', current_setting('chk.r3'), current_setting('chk.r3') = '0');

-- 3e. anon: no policy, nothing
select set_config('realtime.topic', 'biodanza:vivencia:' || current_setting('chk.v'), true);
set local role anon;
select set_config('chk.r1', (select count(*) from realtime.messages)::text, true);
reset role;
insert into res values ('3e anon hears nothing', current_setting('chk.r1'), current_setting('chk.r1') = '0');

-- 4. smoke: the old client's reads, as the viewer under RLS, with its exact column lists
select pg_temp.as_user(current_setting('chk.ue'), current_setting('chk.uid')::uuid);
set local role authenticated;
select set_config('chk.s1', (select count(*) from biodanza.vivencias x where x.id = current_setting('chk.v')::uuid and x.title is not null and x.created_at is not null)::text, true);
select set_config('chk.s2', (select count(*) from (select id, position, exercise_id, music_id, backlog, notes, title, poetics, guidance from biodanza.vivencia_items where vivencia_id = current_setting('chk.v')::uuid) q)::text, true);
select set_config('chk.s3', (select count(*) from (select vivencia_id, who, body, position, who_email from biodanza.vivencia_opening where vivencia_id = current_setting('chk.v')::uuid) q)::text, true);
select set_config('chk.s4', (select count(*) from (select kind, music_id, created_at, position from biodanza.vivencia_reception_music where vivencia_id = current_setting('chk.v')::uuid) q)::text, true);
reset role;
insert into res values ('4 old read vivencias', current_setting('chk.s1'), current_setting('chk.s1') = '1'),
                       ('4 old read vivencia_items', current_setting('chk.s2'), current_setting('chk.s2') = (select count(*)::text from biodanza.vivencia_items where vivencia_id = current_setting('chk.v')::uuid)),
                       ('4 old read vivencia_opening', current_setting('chk.s3'), current_setting('chk.s3') = (select count(*)::text from biodanza.vivencia_opening where vivencia_id = current_setting('chk.v')::uuid)),
                       ('4 old read reception_music', current_setting('chk.s4'), current_setting('chk.s4') = (select count(*)::text from biodanza.vivencia_reception_music where vivencia_id = current_setting('chk.v')::uuid));

select * from res;
rollback;
