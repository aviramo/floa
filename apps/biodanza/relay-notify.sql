-- ==========================================================================
-- RUN on production 2026-11-26 (owner-approved).
-- ==========================================================================
-- Phase 2 of "all realtime through our server" (owner, 2026-11-26: "בסוף אני רוצה שזה יעבוד משם לא בסופה בייס").
-- Definition: ui/docs/realtime.md, "שינויים בנתונים דרך הממסר"; worker/LIVE.md, "Data changes through the relay".
--
-- What it does: after every INSERT, UPDATE or DELETE statement on the eight live tables of biodanza, ONE request per statement
-- (not per row) goes from the database to the Worker: POST https://api.floa.co.il/live/notify, with a shared secret header.
-- The Worker maps it to rooms and sends a 'chg' sign to the sockets there. The sign carries ids and rev only, never content,
-- never an email: the clients reload the row themselves, through their own RLS.
--
-- What it does NOT do: it changes no table, no column, no policy, no publication. Supabase Realtime keeps working exactly as before
-- (the old published app still needs it). Removing the tables from the publication is phase 3: apps/biodanza/realtime-off.sql.
--
-- Safe by construction:
--   * No secret in Vault ('live_notify_secret'): the function returns at once and the write goes through as before.
--   * pg_net only QUEUES the request (net.http_request_queue) and returns; it is sent after COMMIT by pg_net's worker.
--     A rolled back write sends nothing. A slow or failed Worker never slows or fails a write. There is no retry:
--     a lost sign is covered by the next change or by the clients' catch-up.
--   * A write that the kit announces itself (header x-floa-live, or 'floa-live' in prefer) is skipped: the client already sent the
--     same 'chg' on its socket. Only PostgREST sets request.headers, so SQL, the old app and every other writer are always notified.
--     The kit (ui/live.js, announce) sets the header only when every live source of that table in the tab is in the socket's room, so in
--     biodanza only for the open vivencia's tables (items, facilitators, music options, opening, reception music). Writes to vivencias,
--     vivencia_owners and vivencia_shares never carry it: they belong to two rooms (<id> and 'home'), which only this trigger reaches.
--
-- THE SECRET IS NOT IN THIS FILE and must never be: the repo is public. Once, in the SQL editor (owner):
--   select vault.create_secret('<random 32+ bytes, hex>', 'live_notify_secret', 'shared with the Worker secret LIVE_NOTIFY_SECRET (worker/LIVE.md)');
-- The same value goes to the Worker: cd worker && npx wrangler secret put LIVE_NOTIFY_SECRET
-- To rotate: vault.update_secret under the same name, then the Worker secret (a few seconds of rejected notifies in between, harmless).
--
-- Room mapping (the Worker's registry decides who may join a room; this decides where a sign goes):
--   table                        room(s)                 key sent (kc)       rev
--   vivencias                    <id> and 'home'         id                  rev
--   vivencia_owners              <vivencia_id>, 'home'   vivencia_id         -
--   vivencia_shares              <vivencia_id>, 'home'   vivencia_id         -     (the email is never sent)
--   vivencia_items               <vivencia_id>           id                  rev
--   vivencia_item_facilitators   <its item's vivencia>   item_id             -     (the email is never sent)
--   item_music_options           <its item's vivencia>   item_id             -
--   vivencia_opening             <vivencia_id>           none: '*'           -     (who is an email: the room's small source reloads whole)
--   vivencia_reception_music     <vivencia_id>           none: '*'           -     (compound key: the room's small source reloads whole)
-- A child row whose vivencia is already gone (a cascade of deleting the vivencia) is skipped: the vivencia's own delete told its room.
-- More than 50 keys for one room: '*'. More than 20 rooms in one statement: 'home' (when it is a target) and then the first 19 others
-- (bulk SQL; the clients' catch-up covers the rest).
-- Access taken away (delete of a vivencia, ANY update or delete of an owner or a share row, since an update can change the email or
-- the user, or a vivencia turned private): "x": true, and the Worker asks every socket in that vivencia's room to re-authenticate
-- (worker/LIVE.md, "reauth").
-- A notify never blocks or fails a write: steps 2 to 4 of live_notify() sit in their own exception block, any error there
-- (Vault, live_body, pg_net) is swallowed and the write commits as if this file did not exist.
--
-- Payload (one statement, typical size 120 to 200 bytes):
--   {"a":"biodanza","t":"vivencia_items","o":"u","kc":"id","r":{"<vivencia uuid>":[["<item uuid>",7]]}}
--   {"a":"biodanza","t":"vivencia_shares","o":"d","kc":"vivencia_id","x":true,"r":{"<v>":[["<v>"]],"home":[["<v>"]]}}
--
-- Run: node scripts/sql.mjs < apps/biodanza/relay-notify.sql   (owner approval first)
-- Checks: apps/biodanza/relay-notify.check.sql. Undo: apps/biodanza/relay-notify.rollback.sql.
-- Order of operations (Worker deploy, secrets, this file, publish): ui/docs/realtime.md, "ניתוק מ-Supabase Realtime".
begin;

create extension if not exists pg_net;   -- already there (chords uses it); a no-op then

-- one statement's rows (as jsonb) -> the notify body, or null when nothing needs to go out
create or replace function biodanza.live_body(tab text, op text, rs jsonb, ax boolean) returns jsonb
  language sql stable security definer set search_path = '' as
$$
  with r as (select j from jsonb_array_elements(coalesce(rs, '[]'::jsonb)) j),
  e as (
    select case tab
             when 'vivencias' then r.j->>'id'
             when 'vivencia_item_facilitators' then (select i.vivencia_id::text from biodanza.vivencia_items i where i.id = (r.j->>'item_id')::uuid)
             when 'item_music_options'         then (select i.vivencia_id::text from biodanza.vivencia_items i where i.id = (r.j->>'item_id')::uuid)
             else r.j->>'vivencia_id' end as room,
           case tab
             when 'vivencias' then r.j->>'id'
             when 'vivencia_items' then r.j->>'id'
             when 'vivencia_owners' then r.j->>'vivencia_id'
             when 'vivencia_shares' then r.j->>'vivencia_id'
             when 'vivencia_item_facilitators' then r.j->>'item_id'
             when 'item_music_options' then r.j->>'item_id'
             else null end as k,
           (r.j->>'rev')::bigint as rev,
           tab in ('vivencias', 'vivencia_owners', 'vivencia_shares') as home
      from r),
  live as (
    select * from e
     where e.room is not null
       and (tab = 'vivencias' or exists (select 1 from biodanza.vivencias v where v.id = e.room::uuid))),
  tgt as (
    select room, k, rev from live
    union all
    select 'home', k, rev from live where home),
  g as (
    select room,
           case when count(*) > 50 or bool_or(k is null) then to_jsonb('*'::text)
                else jsonb_agg(distinct case when rev is null then jsonb_build_array(k) else jsonb_build_array(k, rev) end) end as c
      from tgt group by room order by (room <> 'home'), room limit 20)   -- 'home' first: never the one dropped
  select case when count(*) = 0 then null else
           jsonb_strip_nulls(jsonb_build_object(
             'a', 'biodanza', 't', tab, 'o', op,
             'kc', case tab when 'vivencias' then 'id' when 'vivencia_items' then 'id'
                            when 'vivencia_owners' then 'vivencia_id' when 'vivencia_shares' then 'vivencia_id'
                            when 'vivencia_item_facilitators' then 'item_id' when 'item_music_options' then 'item_id' end,
             -- an update of an owner or share row can change its email or user: as much a loss of access as a delete
             'x', case when ax or (op = 'd' and tab = 'vivencias')
                            or (op in ('u', 'd') and tab in ('vivencia_owners', 'vivencia_shares')) then true end,
             'r', jsonb_object_agg(room, c)))
         end
    from g
$$;
revoke all on function biodanza.live_body(text, text, jsonb, boolean) from public, anon, authenticated;

-- the statement trigger: collects the touched rows, builds one body, queues one request
create or replace function biodanza.live_notify() returns trigger
  language plpgsql security definer set search_path = '' as
$$
declare
  h      json;
  secret text;
  rs     jsonb;
  ax     boolean := false;
  body   jsonb;
begin
  -- 1. the kit announced this write on its own socket: nothing to do
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    h := null;
  end;
  if h is not null and ((h->>'x-floa-live') is not null or coalesce(h->>'prefer', '') like '%floa-live%') then
    return null;
  end if;

  -- steps 2 to 4 in their own block: ANY error in them (Vault, live_body, pg_net) is swallowed, so a notify never fails a write.
  -- The block is a subtransaction: on error only its own work (at most a queued request) is undone, never the user's write.
  begin
  -- 2. not set up: behave exactly as before this file
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'live_notify_secret';
  if secret is null or secret = '' then
    return null;
  end if;

  -- 3. the rows of this statement (a statement that touched no row sends nothing)
  if TG_OP = 'DELETE' then
    select jsonb_agg(to_jsonb(t)) into rs from o t;
  else
    select jsonb_agg(to_jsonb(t)) into rs from n t;
  end if;
  if rs is null then
    return null;
  end if;

  -- a vivencia turned private takes access away from whoever saw it only because it was public
  if TG_OP = 'UPDATE' and TG_TABLE_NAME = 'vivencias' then
    select coalesce(bool_or(coalesce((to_jsonb(a)->>'is_public')::boolean, false) and not coalesce((to_jsonb(b)->>'is_public')::boolean, false)), false)
      into ax
      from o a join n b on (to_jsonb(a)->>'id') = (to_jsonb(b)->>'id');
  end if;

  body := biodanza.live_body(TG_TABLE_NAME, lower(left(TG_OP, 1)), rs, ax);
  if body is null then
    return null;
  end if;
  -- the Worker takes at most 16 KB (worker/LIVE.md); 20 rooms x 50 keys could pass that: then every room reloads whole ('*')
  if octet_length(body::text) > 15000 then
    body := jsonb_set(body, '{r}', (select jsonb_object_agg(k, to_jsonb('*'::text)) from jsonb_object_keys(body->'r') k));
  end if;

  -- 4. queued, sent after commit, never waited on
  perform net.http_post(
    url := 'https://api.floa.co.il/live/notify',
    body := body,
    headers := jsonb_build_object('content-type', 'application/json', 'x-live-secret', secret),
    timeout_milliseconds := 2000);
  exception when others then
    raise log 'biodanza.live_notify: notify skipped';   -- no content, no row, no error text: the write goes on
    return null;
  end;
  return null;
end
$$;
revoke all on function biodanza.live_notify() from public, anon, authenticated;

-- three statement triggers per table (one per event, each with its own transition tables)
do $$
declare t text;
begin
  foreach t in array array['vivencias', 'vivencia_owners', 'vivencia_shares', 'vivencia_items', 'vivencia_item_facilitators',
                           'item_music_options', 'vivencia_opening', 'vivencia_reception_music'] loop
    execute format('drop trigger if exists live_notify_i on biodanza.%I', t);
    execute format('drop trigger if exists live_notify_u on biodanza.%I', t);
    execute format('drop trigger if exists live_notify_d on biodanza.%I', t);
    execute format('create trigger live_notify_i after insert on biodanza.%I referencing new table as n for each statement execute function biodanza.live_notify()', t);
    execute format('create trigger live_notify_u after update on biodanza.%I referencing old table as o new table as n for each statement execute function biodanza.live_notify()', t);
    execute format('create trigger live_notify_d after delete on biodanza.%I referencing old table as o for each statement execute function biodanza.live_notify()', t);
  end loop;
end $$;

commit;
