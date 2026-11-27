-- ==========================================================================
-- DRAFT, NOT RUN, needs owner approval. Checks for apps/roster/relay-notify.sql. Writes NOTHING (the whole file rolls back).
-- ==========================================================================
-- Same target rule as relay-notify.sql: roster-test by default; production with the set_config line in front:
--   node scripts/sql.mjs --table < apps/roster/relay-notify.check.sql
--   (echo "select set_config('floa.live_target', 'roster', false);"; cat apps/roster/relay-notify.check.sql) | node scripts/sql.mjs --table
-- A failed check raises an exception that names it. Every check passed: the last select prints one row per check with ok = true.
-- Run it BEFORE relay-notify.sql too: then 'installed' is false and the 'untouched' rows are the baseline to compare with after.
begin;

select set_config('floa.live_target', coalesce(nullif(current_setting('floa.live_target', true), ''), 'roster-test'), false);

create temp table live_check (n int, what text, ok boolean, detail text) on commit drop;

do $do$
declare
  sc   text := current_setting('floa.live_target', true);
  s    text := quote_ident(current_setting('floa.live_target', true));
  inst boolean;
  n    int;
  b    uuid;
  slug text;
  body jsonb;
  tabs text[] := array[
    'participants', 'meetings', 'attendance', 'notes', 'promoters', 'promoter_payments', 'payments', 'statuses', 'admin_prefs', 'pay_methods',
    'finance', 'finance_recurring', 'finance_log', 'finance_transfers', 'meeting_types', 'msg_templates', 'msg_sent',
    'business_users', 'businesses', 'members', 'business_settings', 'pass_requests'];
begin
  if sc is null or sc not in ('roster-test', 'roster') then raise exception 'check: target must be roster-test or roster, got %', sc; end if;

  -- UNTOUCHED (the external contract): these must read the same before and after relay-notify.sql
  select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = sc;
  insert into live_check values (1, 'untouched: tables of this schema in supabase_realtime (17 expected)', n = 17, n::text);

  select count(*) into n from information_schema.triggers
   where event_object_schema = sc and trigger_name = 'rt_ping'
     and event_object_table in ('meetings', 'meeting_types', 'attendance', 'payments', 'participants');
  insert into live_check values (2, 'untouched: rt_ping triggers (5 tables x 3 events = 15 rows expected)', n = 15, n::text);

  insert into live_check values (3, 'untouched: rt_ping() exists',
    to_regprocedure(s || '.rt_ping()') is not null, null);

  select count(*) into n from information_schema.columns where table_schema = sc and table_name = 'business_settings' and column_name = 'realtime';
  insert into live_check values (4, 'untouched: business_settings.realtime column', n = 1, null);

  -- the admin room's question exists and a signed-in account may ask it
  insert into live_check values (5, 'admin room: can(uuid) exists, executable by authenticated, not by anon',
    to_regprocedure(s || '.can(uuid)') is not null
      and has_function_privilege('authenticated', s || '.can(uuid)', 'execute')
      and not has_function_privilege('anon', s || '.can(uuid)', 'execute'), null);

  inst := to_regprocedure(s || '.live_notify()') is not null;
  insert into live_check values (6, 'installed (false before relay-notify.sql runs; the checks below are skipped then)', true, inst::text);
  if not inst then return; end if;

  insert into live_check values (7, 'live_member(text): authenticated yes, anon no',
    has_function_privilege('authenticated', s || '.live_member(text)', 'execute')
      and not has_function_privilege('anon', s || '.live_member(text)', 'execute'), null);
  insert into live_check values (8, 'live_body and live_notify: nobody but the owner',
    not has_function_privilege('authenticated', s || '.live_body(text,text,jsonb,boolean)', 'execute')
      and not has_function_privilege('anon', s || '.live_body(text,text,jsonb,boolean)', 'execute')
      and not has_function_privilege('authenticated', s || '.live_notify()', 'execute'), null);

  select count(*) into n from information_schema.triggers
   where event_object_schema = sc and trigger_name like 'live_notify_%' and action_orientation = 'STATEMENT' and event_object_table = any (tabs);
  insert into live_check values (9, 'statement triggers: 22 tables x 3 = 66', n = 66, n::text);

  select count(*) into n from information_schema.triggers
   where event_object_schema = sc and trigger_name like 'live_notify_%' and action_orientation = 'ROW';
  insert into live_check values (10, 'no row-level live trigger', n = 0, n::text);

  select count(*) into n from vault.secrets where name = case sc when 'roster-test' then 'live_notify_secret_test' else 'live_notify_secret' end;
  insert into live_check values (11, 'the Vault secret of this schema exists (name only, never decrypted here)', n = 1, n::text);

  -- dry runs of the body: a real business, made-up ids. No write, no request.
  -- a business whose slug the Worker can name as a members' room (relay-notify.sql gives other slugs no members' room)
  execute format('select id, slug from %s.businesses where slug ~ ''^[a-z][a-z0-9-]{1,39}$'' order by created_at limit 1', s) into b, slug;
  if b is null then
    insert into live_check values (12, 'dry runs: no business in this schema', true, 'skipped');
    return;
  end if;

  execute format('select %s.live_body($1, $2, $3, $4)', s) into body
    using 'payments', 'i', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'business_id', b, 'participant_id', gen_random_uuid())), false;
  insert into live_check values (12, 'payments insert: admin room keyed by id, members room "*", kc id, no x',
    body->>'a' = sc and body->>'kc' = 'id' and jsonb_typeof(body->'r'->(b::text)) = 'array'
      and body->'r'->>('m-' || slug) = '*' and body->'x' is null, body::text);

  execute format('select %s.live_body($1, $2, $3, $4)', s) into body
    using 'members', 'u', jsonb_build_array(jsonb_build_object('business_id', b, 'user_id', gen_random_uuid(), 'participant_id', gen_random_uuid(),
                                                               'email', 'check.only@example.com', 'status', 'removed')), true;
  insert into live_check values (13, 'members update with x: members room only, "*", x true, NO email and NO @ anywhere',
    body->'r' = jsonb_build_object('m-' || slug, '*') and body->>'x' = 'true' and position('@' in body::text) = 0, body::text);

  execute format('select %s.live_body($1, $2, $3, $4)', s) into body
    using 'finance', 'u', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'business_id', b)), false;
  insert into live_check values (14, 'finance: admin room only (members never hear admin-only tables)',
    body->'r' ? b::text and not (body->'r' ? ('m-' || slug)), body::text);

  execute format('select %s.live_body($1, $2, $3, $4)', s) into body
    using 'business_users', 'd', jsonb_build_array(jsonb_build_object('business_id', b, 'email', 'check.only@example.com')), false;
  insert into live_check values (15, 'business_users delete: admin room "*", x true, no email',
    body->'r'->>(b::text) = '*' and body->>'x' = 'true' and position('@' in body::text) = 0, body::text);

  execute format('select %s.live_body($1, $2, $3, $4)', s) into body
    using 'attendance', 'u', jsonb_build_array(jsonb_build_object('business_id', gen_random_uuid(), 'participant_id', gen_random_uuid(), 'meeting_id', gen_random_uuid())), false;
  insert into live_check values (16, 'a row whose business does not exist (a cascade): nothing goes out', body is null, coalesce(body::text, 'null'));

  execute format('select %s.live_body($1, $2, $3, $4)', s) into body
    using 'members', 'u', jsonb_build_array(jsonb_build_object('business_id', b, 'user_id', gen_random_uuid(), 'status', 'approved')), false;
  insert into live_check values (17, 'any members update carries x (like biodanza owners and shares), even when the trigger saw no loss',
    body->>'x' = 'true', body::text);
end $do$;

-- what went out lately (after a test write by hand; pg_net keeps responses about 6 hours). 204 = delivered; 401 = secrets differ; 404 = Worker not deployed
select status_code, count(*) from net._http_response where created > now() - interval '1 hour' group by status_code order by status_code;

select n, what, ok, detail from live_check order by n;

do $do$ begin
  if exists (select 1 from live_check where not ok) then
    raise exception 'relay-notify check FAILED: %', (select string_agg(n || ' ' || what, '; ' order by n) from live_check where not ok);
  end if;
end $do$;

rollback;
