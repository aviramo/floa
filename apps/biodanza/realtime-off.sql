-- ==========================================================================
-- DRAFT, NOT RUN, needs owner approval. Phase 3: biodanza leaves Supabase Realtime.
-- ==========================================================================
-- Definition: ui/docs/realtime.md, "ניתוק מ-Supabase Realtime"; worker/LIVE.md, "Leaving Supabase Realtime".
-- Takes the eight biodanza tables out of the supabase_realtime publication. From then on their changes reach clients ONLY through
-- the relay (apps/biodanza/relay-notify.sql and the kit's chg). Roster and roster-test tables stay in the publication: roster is not on
-- the kit yet (the admin page opens its own Supabase socket); moving it is a later, separate migration.
--
-- RUN ONLY AFTER, in this order (ui/docs/realtime.md has the full order):
--   1. the Worker with /live/notify is deployed and the Worker secret LIVE_NOTIFY_SECRET is set;
--   2. relay-notify.sql ran, its checks passed, and the Vault secret live_notify_secret exists;
--   3. the NEW biodanza app (kit with the relay, SUPABASE.relay and 'biodanza' in SUPABASE.relayData) is PUBLISHED;
--   4. no old client is left: the guard below counts postgres_changes subscriptions on biodanza tables (the old app's, and any kit
--      without the relay). It must be 0 on several checks over a few days (old tabs, the old service worker).
-- The guard makes this file refuse while any such subscription exists, so running it early cannot cut an old app off.
--
-- Not touched here: rev and its triggers (the conditional save needs them), the private channel policies on realtime.messages
-- (they stay while the Supabase broadcast path exists in the kit as the "no relay" switch; removed together with that path, by a
-- later decision), replica identity, pg_net.
--
-- Run: node scripts/sql.mjs --table < apps/biodanza/realtime-off.sql   (owner approval first)
-- Undo: apps/biodanza/realtime-off.rollback.sql
begin;

-- the guard: old listeners still there means the old app (or a kit without the relay) is still open somewhere
do $$
declare n int;
begin
  select count(*) into n from realtime.subscription where entity::text like 'biodanza.%';
  if n > 0 then
    raise exception 'realtime-off: % postgres_changes subscription(s) on biodanza tables are still open; the old app is still in use. Nothing changed.', n;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['vivencias', 'vivencia_items', 'vivencia_owners', 'vivencia_shares', 'vivencia_item_facilitators', 'vivencia_opening',
                           'vivencia_reception_music', 'item_music_options'] loop
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'biodanza' and tablename = t) then
      execute format('alter publication supabase_realtime drop table biodanza.%I', t);
    end if;
  end loop;
end $$;

-- the result, in the same transaction: biodanza 0, roster and roster-test unchanged (34 on 2026-11-26)
select schemaname, count(*) from pg_publication_tables where pubname = 'supabase_realtime' group by schemaname order by schemaname;

commit;
