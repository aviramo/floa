-- ==========================================================================
-- DRAFT, NOT RUN, needs owner approval. Undo of apps/roster/relay-notify.sql, for ONE schema (the same target rule).
-- ==========================================================================
--   roster-test (the default):  node scripts/sql.mjs < apps/roster/relay-notify.rollback.sql
--   roster:                     (echo "select set_config('floa.live_target', 'roster', false);"; cat apps/roster/relay-notify.rollback.sql) | node scripts/sql.mjs
--
-- ORDER: the client switch FIRST. Take the schema out of SUPABASE.relayData in apps/floa/domain/supabase.js and publish; the admin page goes
-- back to its own Supabase socket (startRealtime) and the me page to its 45 s poll at once, because the publication was never changed.
-- Only then this file. In the other order the relay pages stay "live" but hear nothing until the switch is published
-- (the admin still reloads on coming back to the tab, the me page still on focus).
--
-- Removes ONLY what relay-notify.sql added: the 66 live_notify_* statement triggers, live_notify(), live_body(), live_member().
-- Touches nothing else: not the publication, not rt_ping, not can(), not the Vault secret (delete it by hand if wanted:
-- delete from vault.secrets where name = 'live_notify_secret_test'), not the Worker.
-- Without live_member() the Worker answers 4003 for a members' room (/live/<schema>/m-<slug>): the kit goes to "none" and polls.
begin;

select set_config('floa.live_target', coalesce(nullif(current_setting('floa.live_target', true), ''), 'roster-test'), false);

do $do$
declare
  sc text := current_setting('floa.live_target', true);
  s  text;
  t  text;
begin
  if sc is null or sc not in ('roster-test', 'roster') then
    raise exception 'relay-notify rollback: target must be roster-test or roster, got %', sc;
  end if;
  s := quote_ident(sc);
  foreach t in array array[
    'participants', 'meetings', 'attendance', 'notes', 'promoters', 'promoter_payments', 'payments', 'statuses', 'admin_prefs', 'pay_methods',
    'finance', 'finance_recurring', 'finance_log', 'finance_transfers', 'meeting_types', 'msg_templates', 'msg_sent',
    'business_users', 'businesses', 'members', 'business_settings', 'pass_requests'] loop
    execute format('drop trigger if exists live_notify_i on %s.%I', s, t);
    execute format('drop trigger if exists live_notify_u on %s.%I', s, t);
    execute format('drop trigger if exists live_notify_d on %s.%I', s, t);
  end loop;
  execute format('drop function if exists %s.live_notify()', s);
  execute format('drop function if exists %s.live_body(text, text, jsonb, boolean)', s);
  execute format('drop function if exists %s.live_member(text)', s);
end $do$;

-- the result: no live trigger left in the target, and the publication still 17 per roster schema
select event_object_schema as schema, count(*) as live_triggers_left from information_schema.triggers
 where trigger_name like 'live_notify_%' and event_object_schema in ('roster', 'roster-test') group by event_object_schema;
select schemaname, count(*) as published from pg_publication_tables where pubname = 'supabase_realtime' and schemaname in ('roster', 'roster-test') group by schemaname order by schemaname;

commit;
