-- ==========================================================================
-- DRAFT, NOT RUN, needs owner approval. Checks for apps/biodanza/relay-notify.sql, AFTER it ran.
-- ==========================================================================
-- node scripts/sql.mjs --table < apps/biodanza/relay-notify.check.sql
-- Everything is rolled back. pg_net sends only committed queue rows, so the requests queued here are never sent.
-- When the real Vault secret is not there yet, a throwaway one is created inside the transaction (rolled back with it).
-- Expected: every row's ok = true. (net.http_request_queue.body is bytea in pg_net, hence convert_from.)
begin;
create temp table res(t text, v text, ok boolean) on commit drop;

-- 0. a secret to make the function act (the real one when it exists; otherwise a throwaway, rolled back)
do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'live_notify_secret') then
    perform vault.create_secret('check-only', 'live_notify_secret', 'relay-notify.check.sql, rolled back');
  end if;
end $$;

-- 1. the triggers: 3 per table, statement level, on exactly the eight tables
insert into res select '1 triggers', count(*)::text, count(*) = 24
  from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
 where c.relnamespace = 'biodanza'::regnamespace and tg.tgname in ('live_notify_i', 'live_notify_u', 'live_notify_d')
   and (tg.tgtype & 1) = 0   -- not FOR EACH ROW
   and c.relname in ('vivencias', 'vivencia_owners', 'vivencia_shares', 'vivencia_items', 'vivencia_item_facilitators',
                     'item_music_options', 'vivencia_opening', 'vivencia_reception_music');
insert into res select '1 no trigger elsewhere', count(*)::text, count(*) = 0
  from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
 where tg.tgname like 'live_notify_%' and c.relnamespace <> 'biodanza'::regnamespace;

-- 2. one statement touching one item: exactly one queued request, ids and rev only
do $$
declare k uuid; v uuid; before bigint; after bigint; b jsonb;
begin
  select id, vivencia_id into k, v from biodanza.vivencia_items limit 1;
  select count(*) into before from net.http_request_queue;
  update biodanza.vivencia_items set notes = notes where id = k;
  select count(*) into after from net.http_request_queue;
  select convert_from(body, 'utf8')::jsonb into b from net.http_request_queue order by id desc limit 1;
  insert into res values ('2 one request per statement', (after - before)::text, after - before = 1);
  insert into res values ('2 body shape', b::text,
    b->>'a' = 'biodanza' and b->>'t' = 'vivencia_items' and b->>'o' = 'u' and b->>'kc' = 'id'
    and (b->'r'->(v::text)->0->>0) = k::text and (b->'r'->(v::text)->0->>1) is not null and not (b ? 'x'));
  insert into res values ('2 no content in body', length(b::text)::text, b::text not like '%notes%' and b::text not like '%@%' and length(b::text) < 400);
end $$;

-- 2b. a statement touching several rows of one vivencia: still one request
do $$
declare v uuid; n int; before bigint; after bigint;
begin
  select vivencia_id, count(*) into v, n from biodanza.vivencia_items group by vivencia_id having count(*) > 1 limit 1;
  select count(*) into before from net.http_request_queue;
  update biodanza.vivencia_items set notes = notes where vivencia_id = v;
  select count(*) into after from net.http_request_queue;
  insert into res values ('2b ' || n || ' rows, one request', (after - before)::text, after - before = 1);
end $$;

-- 3. the request goes to the Worker with the secret header
insert into res select '3 url and header', url || ' ' || (headers ? 'x-live-secret')::text,
  url = 'https://api.floa.co.il/live/notify' and headers ? 'x-live-secret' and method = 'POST'
  from net.http_request_queue order by id desc limit 1;

-- 4. home-level tables go to the vivencia's room and to 'home'; shares never carry the email
do $$
declare v uuid; e text; before bigint; b jsonb;
begin
  select vivencia_id, email into v, e from biodanza.vivencia_shares limit 1;
  if v is null then insert into res values ('4 shares', 'no share rows to try', false); return; end if;
  update biodanza.vivencia_shares set role = role where vivencia_id = v and email = e;
  select convert_from(body, 'utf8')::jsonb into b from net.http_request_queue order by id desc limit 1;
  insert into res values ('4 shares: room + home, no email', b::text,
    b->'r' ? v::text and b->'r' ? 'home' and b->>'kc' = 'vivencia_id' and b::text not like '%@%');
  -- an UPDATE of a share row can change its email: access may be gone, so x is set (not only on delete)
  insert into res values ('4b shares update: x', coalesce(b->>'x', 'null'), b->>'o' = 'u' and coalesce((b->>'x')::boolean, false));
end $$;

-- 5. opening: whole-source sign ('*'), never the who (an email)
do $$
declare v uuid; w text; b jsonb;
begin
  select vivencia_id, who into v, w from biodanza.vivencia_opening limit 1;
  if v is null then insert into res values ('5 opening', 'no rows to try', false); return; end if;
  update biodanza.vivencia_opening set body = body where vivencia_id = v and who = w;
  select convert_from(body, 'utf8')::jsonb into b from net.http_request_queue order by id desc limit 1;
  insert into res values ('5 opening: star, no who', b::text, b->'r'->>(v::text) = '*' and b::text not like '%@%' and not (b ? 'kc'));
end $$;

-- 6. a kit write (x-floa-live header, as PostgREST sets it) is skipped; so is 'floa-live' in prefer
do $$
declare k uuid; before bigint; after bigint;
begin
  select id into k from biodanza.vivencia_items limit 1;
  perform set_config('request.headers', '{"x-floa-live":"1"}', true);
  select count(*) into before from net.http_request_queue;
  update biodanza.vivencia_items set notes = notes where id = k;
  perform set_config('request.headers', '{"prefer":"return=representation, floa-live"}', true);
  update biodanza.vivencia_items set notes = notes where id = k;
  select count(*) into after from net.http_request_queue;
  perform set_config('request.headers', '', true);
  insert into res values ('6 announced writes skipped', (after - before)::text, after = before);
end $$;

-- 7. a statement that touches no row sends nothing
do $$
declare before bigint; after bigint;
begin
  select count(*) into before from net.http_request_queue;
  update biodanza.vivencia_items set notes = notes where id = gen_random_uuid();
  delete from biodanza.vivencia_shares where vivencia_id = gen_random_uuid();
  select count(*) into after from net.http_request_queue;
  insert into res values ('7 empty statements: nothing', (after - before)::text, after = before);
end $$;

-- 8. deleting a vivencia: one request for the vivencia (room + home, x), none for its cascaded children
do $$
declare v uuid; before bigint; after bigint; b jsonb;
begin
  select x.id into v from biodanza.vivencias x
   where exists (select 1 from biodanza.vivencia_items i where i.vivencia_id = x.id) limit 1;
  select count(*) into before from net.http_request_queue;
  delete from biodanza.vivencias where id = v;
  select count(*) into after from net.http_request_queue;
  select convert_from(body, 'utf8')::jsonb into b from net.http_request_queue order by id desc limit 1;
  insert into res values ('8 delete vivencia: one request', (after - before)::text, after - before = 1);
  insert into res values ('8 delete vivencia: room, home, x', b::text, b->>'t' = 'vivencias' and b->>'o' = 'd' and b->'r' ? v::text and b->'r' ? 'home' and (b->>'x')::boolean);
end $$;

-- 9. public -> private sets x
do $$
declare v uuid; uid uuid; em text; b jsonb;
begin
  -- an owner who passes biodanza.owns(): is_allowed() reads the email claim (jwt_email), auth.uid() reads sub
  select x.id, o.user_id, lower(u.email) into v, uid, em
    from biodanza.vivencias x
    join biodanza.vivencia_owners o on o.vivencia_id = x.id
    join auth.users u on u.id = o.user_id
   where x.is_public and exists (select 1 from biodanza.allowed a where a.email = lower(u.email))
   limit 1;
  if v is null then insert into res values ('9 private', 'no public vivencia with an allowed owner to try', false); return; end if;
  -- vivencia_public_guard lets only an owner switch it: act as that owner (sub + email; the email is never printed)
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', em, 'role', 'authenticated')::text, true);
  update biodanza.vivencias set is_public = false where id = v;
  perform set_config('request.jwt.claims', '', true);
  select convert_from(body, 'utf8')::jsonb into b from net.http_request_queue order by id desc limit 1;
  insert into res values ('9 turned private: x', b::text, (b->>'x')::boolean and b->>'t' = 'vivencias');
end $$;

-- 10. no secret: nothing queued, the write passes
do $$
declare k uuid; before bigint; after bigint;
begin
  delete from vault.secrets where name = 'live_notify_secret';
  select id into k from biodanza.vivencia_items limit 1;
  select count(*) into before from net.http_request_queue;
  update biodanza.vivencia_items set notes = notes where id = k;
  select count(*) into after from net.http_request_queue;
  insert into res values ('10 no secret: nothing, write passes', (after - before)::text, after = before);
end $$;

-- 11. nothing else changed: the publication and the rev triggers are as realtime.sql left them
insert into res select '11 publication untouched', count(*)::text, count(*) = 8 from pg_publication_tables
 where pubname = 'supabase_realtime' and schemaname = 'biodanza';
insert into res select '11 rev_bump still there', count(*)::text, count(*) = 3 from pg_trigger where tgname = 'rev_bump';

-- 12. an error inside the notify path never rolls back the write. Kept LAST: it breaks live_body for the rest of the transaction
--     (everything here is rolled back at the end, so the real function is back untouched). The secret is put back first
--     (10 removed it), so the trigger really reaches the broken step instead of returning at "not set up".
do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'live_notify_secret') then
    perform vault.create_secret('check-only', 'live_notify_secret', 'relay-notify.check.sql, rolled back');
  end if;
end $$;
create or replace function biodanza.live_body(tab text, op text, rs jsonb, ax boolean) returns jsonb
  language plpgsql as $f$ begin raise exception 'relay-notify.check.sql: forced failure'; end $f$;
do $$
declare k uuid; before bigint; after bigint; got text; ok boolean := true;
begin
  select id into k from biodanza.vivencia_items limit 1;
  select count(*) into before from net.http_request_queue;
  begin
    update biodanza.vivencia_items set notes = 'relay-check-12' where id = k;
  exception when others then
    ok := false;   -- the error reached the writer: E1 broken
  end;
  select count(*) into after from net.http_request_queue;
  select notes::text into got from biodanza.vivencia_items where id = k;
  insert into res values ('12 forced notify error: write commits', coalesce(got, 'null') || ' / ' || ok::text,
    ok and got = 'relay-check-12');
  insert into res values ('12 forced notify error: nothing queued', (after - before)::text, after = before);
end $$;

select * from res;
rollback;
