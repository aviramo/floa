-- ==========================================================================
-- DRAFT, NOT RUN, needs owner approval. Do not run without the owner's explicit yes for THIS file AND THIS schema.
-- ==========================================================================
-- Roster's own realtime moves to the relay (owner, 2026-11-26: all realtime off Supabase onto our Worker, roster included).
-- Definition: ui/docs/realtime.md, "רוסטר ואתרים חיצוניים"; worker/LIVE.md, "Roster". The same pattern as apps/biodanza/relay-notify.sql.
--
-- ONE SCHEMA PER RUN. roster-test first; roster only after roster-test passed, with the owner's direct yes and the AUM checks before and after.
--   roster-test (the default):  node scripts/sql.mjs < apps/roster/relay-notify.sql
--   roster (production):        (echo "select set_config('floa.live_target', 'roster', false);"; cat apps/roster/relay-notify.sql) | node scripts/sql.mjs
--
-- What it adds, in that one schema:
--   * <schema>.live_member(s text) -> boolean: may the signed-in account open the members' room of business slug s (an approved member
--     linked to a participant). The relay asks it with the person's own token, for the room /live/<schema>/m-<slug>.
--     The admin room (/live/<schema>/<business uuid>) asks the EXISTING <schema>.can(b uuid). Nothing new for it.
--   * <schema>.live_body(...) and <schema>.live_notify(): after every INSERT, UPDATE or DELETE STATEMENT (not per row) on the tables below,
--     ONE request to the Worker OF THAT SCHEMA (schemaOfHost semantics, worker/src/roster/db.js):
--       roster       -> POST https://api.floa.co.il/live/notify        secret: Vault 'live_notify_secret'      = Worker floa-lead      LIVE_NOTIFY_SECRET
--       roster-test  -> POST https://api-test.floa.co.il/live/notify   secret: Vault 'live_notify_secret_test' = Worker floa-lead-test LIVE_NOTIFY_SECRET
--     The sign carries ids only (uuids), never content, never an email, never a phone, never a name. Clients reload through their own RLS.
--
-- What it does NOT touch (the external contract, ui/docs/realtime.md, "(ב) מה נשאר ב-Supabase"):
--   * the supabase_realtime publication: all 17 roster tables stay in it, in both schemas (34 rows on 2026-11-26);
--   * roster.rt_ping() / "roster-test".rt_ping() and their row triggers on meetings, meeting_types, attendance, payments, participants;
--   * business_settings.realtime, the public topics '<schema>:<slug>', any policy, any table, any column, any function of the API, any answer.
--   There is NO realtime-off file for roster. Do not write one without a separate owner decision.
--
-- Safe by construction (the roster API is FROZEN, CLAUDE.md: a write through it must behave exactly as before):
--   * The whole trigger body is wrapped: any error is swallowed, the write goes on as if this file did not exist.
--   * No Vault secret for the schema: the function returns at once.
--   * pg_net only QUEUES the request; it is sent after COMMIT. A rolled back write sends nothing; a slow or dead Worker never slows or fails a write.
--   * A session that sets floa.live = 'off' (bulk maintenance scripts) sends nothing. The clients' catch-up and poll cover it.
--   * A write that a kit client announced itself (header x-floa-live, or 'floa-live' in prefer) is skipped. Roster clients do not set it in
--     this step (the admin and me pages write through their own fetch), so today every write is announced here. The check is kept so a later
--     kit migration of the admin needs no SQL change. The Worker's own calls (the /roster/v1/ API) never carry it.
--   * A room that already got "*" for a table in this transaction does not get it again (one save, several statements, one sign).
--
-- THE SECRETS ARE NOT IN THIS FILE and must never be: the repo is public. Once, in the SQL editor (owner):
--   select vault.create_secret('<random 32+ bytes, hex>', 'live_notify_secret_test', 'roster-test relay signs; = floa-lead-test LIVE_NOTIFY_SECRET');
--   (production reuses 'live_notify_secret' from apps/biodanza/relay-notify.sql; create it there if it does not exist yet)
-- The same values go to the Workers:  cd worker && npx wrangler secret put LIVE_NOTIFY_SECRET --config wrangler.test.toml   (and without --config for production)
--
-- Room mapping (the Worker's registry decides who may JOIN a room; this decides where a sign GOES):
--   admin room  '<business uuid>'  the 17 tables the admin page reads (admin.js TABLES), business_users, businesses
--       kc 'id' and the row ids for tables whose primary key is an id uuid; "*" for attendance, statuses (keys are not a single uuid),
--       business_users (its key holds an email), businesses
--   members room 'm-<slug>'        participants, attendance, payments, meetings, meeting_types, pay_methods, business_settings, pass_requests,
--       members, businesses. ALWAYS "*" with no keys: a member never learns another participant's id. The me page reloads its one me() call.
--   A row whose business is already gone (the cascade of deleting the business) is skipped: the business's own delete told both rooms.
--   More than 50 keys for one room: "*". More than 20 rooms in one statement: the first 20 (bulk SQL; the clients' catch-up covers the rest).
-- Access taken away ("x": true, the Worker sends reauth to the room and whoever lost access is closed 4003 within seconds):
--   any update or delete of business_users or members (the same rule as biodanza's owners and shares: an email, a user, a status or a
--   participant changed is as much a loss of access as a delete); delete of businesses; businesses update of the slug (the old members' room).
--   A slug the Worker cannot name as a room (not ^[a-z][a-z0-9-]{1,39}$) gets no members' room: one bad room id would make it refuse the whole sign.
--   More than 20 rooms: ordered by business, so a business keeps both of its rooms.
--
-- Payload examples (typical 120 to 220 bytes):
--   {"a":"roster","t":"payments","o":"i","kc":"id","r":{"<business uuid>":[["<payment uuid>"]],"m-harpatka":"*"}}
--   {"a":"roster-test","t":"members","o":"u","x":true,"r":{"m-harpatka":"*"}}
--
-- Checks: apps/roster/relay-notify.check.sql (the same target rule). Undo: apps/roster/relay-notify.rollback.sql (client switch first, see there).
begin;

create extension if not exists pg_net;   -- already there (chords uses it); a no-op then

select set_config('floa.live_target', coalesce(nullif(current_setting('floa.live_target', true), ''), 'roster-test'), false);

do $do$
declare
  sc  text := current_setting('floa.live_target', true);
  s   text;
  a   text;
  t   text;
  def text;
begin
  if sc is null or sc not in ('roster-test', 'roster') then
    raise exception 'relay-notify: target must be roster-test or roster, got %', sc;
  end if;
  s := quote_ident(sc);
  a := quote_literal(sc);

  -- 1. the members' room question (the Worker asks it with the person's own token)
  def := $def$
create or replace function __S__.live_member(s text) returns boolean
  language sql stable security definer set search_path = '' as
$fn$
  select auth.uid() is not null and exists (
    select 1 from __S__.businesses b join __S__.members m on m.business_id = b.id
     where b.slug = s and m.user_id = auth.uid() and m.status = 'approved' and m.participant_id is not null)
$fn$;
revoke all on function __S__.live_member(text) from public, anon;
grant execute on function __S__.live_member(text) to authenticated;
$def$;
  execute replace(def, '__S__', s);

  -- 2. one statement's rows (as jsonb) -> the notify body, or null when nothing needs to go out
  def := $def$
create or replace function __S__.live_body(tab text, op text, rs jsonb, ax boolean) returns jsonb
  language sql stable security definer set search_path = '' as
$fn$
  with r as (select j from jsonb_array_elements(coalesce(rs, '[]'::jsonb)) j),
  e as (
    select case when tab = 'businesses' then r.j->>'id' else r.j->>'business_id' end as bid,
           case when tab = 'businesses' then r.j->>'slug' end as own_slug,
           case when tab in ('participants', 'meetings', 'notes', 'promoters', 'promoter_payments', 'payments', 'admin_prefs', 'pay_methods',
                             'finance', 'finance_recurring', 'finance_transfers', 'finance_log', 'meeting_types', 'msg_templates', 'msg_sent')
                then r.j->>'id' end as k,
           (r.j->>'rev')::bigint as rev
      from r),
  b as (
    select e.k, e.rev, e.bid, coalesce(e.own_slug, x.slug) as slug
      from e left join __S__.businesses x on x.id = e.bid::uuid
     where e.bid is not null and (tab = 'businesses' or x.id is not null)),
  tgt as (
    select bid, bid as room, k, rev from b
     where tab in ('participants', 'meetings', 'attendance', 'notes', 'promoters', 'promoter_payments', 'payments', 'statuses', 'admin_prefs',
                   'pay_methods', 'finance', 'finance_recurring', 'finance_log', 'finance_transfers', 'meeting_types', 'msg_templates', 'msg_sent',
                   'business_users', 'businesses')
    union all
    -- only a slug the Worker accepts as a room id (^m-[a-z][a-z0-9-]{1,39}$): one bad room id makes it refuse the WHOLE notify (400),
    -- so a slug it cannot name simply has no members' room (the me page of such a business polls, me.js)
    select distinct bid, 'm-' || slug, null::text, null::bigint from b
     where slug ~ '^[a-z][a-z0-9-]{1,39}$'
       and tab in ('participants', 'attendance', 'payments', 'meetings', 'meeting_types', 'pay_methods', 'business_settings', 'pass_requests',
                   'members', 'businesses')),
  g as (
    -- ordered by business, then room: when a bulk statement touches more than 20 rooms, a business keeps its admin room AND its members' room
    select room,
           case when count(*) > 50 or bool_or(k is null) then to_jsonb('*'::text)
                else jsonb_agg(distinct case when rev is null then jsonb_build_array(k) else jsonb_build_array(k, rev) end) end as c
      from tgt group by bid, room order by bid, room limit 20)
  select case when count(*) = 0 then null else
           jsonb_strip_nulls(jsonb_build_object(
             'a', __A__, 't', tab, 'o', op,
             'kc', case when tab in ('participants', 'meetings', 'notes', 'promoters', 'promoter_payments', 'payments', 'admin_prefs', 'pay_methods',
                                     'finance', 'finance_recurring', 'finance_transfers', 'finance_log', 'meeting_types', 'msg_templates', 'msg_sent')
                        then 'id' end,
             -- any update or delete of a membership row (business_users, members) can take access away (an email, a user, a status,
             -- a participant changed): as much a loss of access as a delete, the same rule as biodanza's owners and shares
             'x', case when ax or (op = 'd' and tab = 'businesses')
                            or (op in ('u', 'd') and tab in ('business_users', 'members')) then true end,
             'r', jsonb_object_agg(room, c)))
         end
    from g
$fn$;
revoke all on function __S__.live_body(text, text, jsonb, boolean) from public, anon, authenticated;
$def$;
  execute replace(replace(def, '__S__', s), '__A__', a);

  -- 3. the statement trigger: collects the touched rows, builds one body, queues one request. Never fails a write.
  def := $def$
create or replace function __S__.live_notify() returns trigger
  language plpgsql security definer set search_path = '' as
$fn$
declare
  h      json;
  secret text;
  url    text;
  sname  text;
  rs     jsonb;
  ax     boolean := false;
  body   jsonb;
  rr     jsonb := '{}'::jsonb;
  e      record;
  flag   text;
begin
  begin
    -- 0. bulk maintenance: set floa.live = 'off' in the session
    if coalesce(current_setting('floa.live', true), '') = 'off' then return null; end if;

    -- 1. a kit client announced this write on its own socket: nothing to do (roster clients do not set it yet)
    begin
      h := nullif(current_setting('request.headers', true), '')::json;
    exception when others then
      h := null;
    end;
    if h is not null and ((h->>'x-floa-live') is not null or coalesce(h->>'prefer', '') like '%floa-live%') then
      return null;
    end if;

    -- 2. the Worker of this schema (schemaOfHost: roster-test is the test Worker), and its secret; not set up: exactly as before this file
    if TG_TABLE_SCHEMA = 'roster-test' then
      url := 'https://api-test.floa.co.il/live/notify'; sname := 'live_notify_secret_test';
    else
      url := 'https://api.floa.co.il/live/notify';      sname := 'live_notify_secret';
    end if;
    select decrypted_secret into secret from vault.decrypted_secrets where name = sname;
    if secret is null or secret = '' then
      return null;
    end if;

    -- 3. the rows of this statement (a statement that touched no row sends nothing). A renamed business: old and new rows (both rooms)
    if TG_OP = 'DELETE' then
      select jsonb_agg(to_jsonb(t)) into rs from o t;
    elsif TG_OP = 'UPDATE' and TG_TABLE_NAME = 'businesses' then
      select jsonb_agg(q.x) into rs from (select to_jsonb(t) as x from o t union all select to_jsonb(t) from n t) q;
    else
      select jsonb_agg(to_jsonb(t)) into rs from n t;
    end if;
    if rs is null then
      return null;
    end if;

    -- access taken away by an update
    if TG_OP = 'UPDATE' then
      if TG_TABLE_NAME = 'members' then
        select coalesce(bool_or((to_jsonb(a)->>'status') = 'approved'
                                and ((to_jsonb(b)->>'status') is distinct from 'approved'
                                     or (to_jsonb(b)->>'participant_id') is distinct from (to_jsonb(a)->>'participant_id'))), false)
          into ax
          from o a join n b on (to_jsonb(a)->>'business_id') = (to_jsonb(b)->>'business_id') and (to_jsonb(a)->>'user_id') = (to_jsonb(b)->>'user_id');
      elsif TG_TABLE_NAME = 'business_users' then
        ax := true;
      elsif TG_TABLE_NAME = 'businesses' then
        select coalesce(bool_or((to_jsonb(a)->>'slug') is distinct from (to_jsonb(b)->>'slug')), false)
          into ax
          from o a join n b on (to_jsonb(a)->>'id') = (to_jsonb(b)->>'id');
      end if;
    end if;

    body := __S__.live_body(TG_TABLE_NAME, lower(left(TG_OP, 1)), rs, ax);
    if body is null then
      return null;
    end if;

    -- one "*" per room and table per transaction (the sign goes after commit anyway, so the first one covers the rest)
    if body->>'x' is null then
      for e in select key, value from jsonb_each(body->'r') loop
        if jsonb_typeof(e.value) = 'string' then
          flag := 'floa.lv' || md5(TG_TABLE_SCHEMA || '|' || TG_TABLE_NAME || '|' || e.key);
          if coalesce(current_setting(flag, true), '') = '1' then
            continue;
          end if;
          perform set_config(flag, '1', true);
        end if;
        rr := rr || jsonb_build_object(e.key, e.value);
      end loop;
      if rr = '{}'::jsonb then
        return null;
      end if;
      body := jsonb_set(body, '{r}', rr);
    end if;

    -- the Worker takes at most 16 KB (worker/LIVE.md): then every room reloads whole
    if octet_length(body::text) > 15000 then
      body := jsonb_set(body, '{r}', (select jsonb_object_agg(k, to_jsonb('*'::text)) from jsonb_object_keys(body->'r') k));
    end if;

    -- 4. queued, sent after commit, never waited on
    perform net.http_post(
      url := url,
      body := body,
      headers := jsonb_build_object('content-type', 'application/json', 'x-live-secret', secret),
      timeout_milliseconds := 2000);
  exception when others then
    raise log 'roster.live_notify: notify skipped';   -- no content, no row, no error text
    return null;   -- a sign must never fail, delay or change a write: the roster API is frozen
  end;
  return null;
end
$fn$;
revoke all on function __S__.live_notify() from public, anon, authenticated;
$def$;
  execute replace(def, '__S__', s);

  -- 4. three statement triggers per table (one per event, each with its own transition tables)
  foreach t in array array[
    'participants', 'meetings', 'attendance', 'notes', 'promoters', 'promoter_payments', 'payments', 'statuses', 'admin_prefs', 'pay_methods',
    'finance', 'finance_recurring', 'finance_log', 'finance_transfers', 'meeting_types', 'msg_templates', 'msg_sent',
    'business_users', 'businesses', 'members', 'business_settings', 'pass_requests'] loop
    execute format('drop trigger if exists live_notify_i on %s.%I', s, t);
    execute format('drop trigger if exists live_notify_u on %s.%I', s, t);
    execute format('drop trigger if exists live_notify_d on %s.%I', s, t);
    execute format('create trigger live_notify_i after insert on %s.%I referencing new table as n for each statement execute function %s.live_notify()', s, t, s);
    execute format('create trigger live_notify_u after update on %s.%I referencing old table as o new table as n for each statement execute function %s.live_notify()', s, t, s);
    execute format('create trigger live_notify_d after delete on %s.%I referencing old table as o for each statement execute function %s.live_notify()', s, t, s);
  end loop;
end $do$;

-- the result, in the same transaction: the publication is unchanged (17 per roster schema), and the new triggers are there
select schemaname, count(*) as published from pg_publication_tables where pubname = 'supabase_realtime' and schemaname in ('roster', 'roster-test') group by schemaname order by schemaname;
select event_object_schema as schema, count(*) as live_triggers from information_schema.triggers
 where trigger_name like 'live_notify_%' and event_object_schema in ('roster', 'roster-test') group by event_object_schema;

commit;
