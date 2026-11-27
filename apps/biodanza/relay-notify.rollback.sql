-- ==========================================================================
-- DRAFT, NOT RUN, needs owner approval. ROLLBACK for apps/biodanza/relay-notify.sql.
-- ==========================================================================
-- node scripts/sql.mjs < apps/biodanza/relay-notify.rollback.sql
-- Removes the 24 statement triggers and the two functions. Touches no table, column, policy or publication.
-- After it, writes from outside the kit no longer reach the relay. While Supabase Realtime still carries the tables
-- (phase 3 not run, or rolled back first: realtime-off.rollback.sql), nothing is lost. If phase 3 ran, roll IT back FIRST
-- and take the schema out of SUPABASE.relayData, or clients see no outside change until their next catch-up.
-- pg_net stays (chords uses it). The Vault secret is left in place; to remove it too (owner):
--   delete from vault.secrets where name = 'live_notify_secret';
begin;

do $$
declare t text;
begin
  foreach t in array array['vivencias', 'vivencia_owners', 'vivencia_shares', 'vivencia_items', 'vivencia_item_facilitators',
                           'item_music_options', 'vivencia_opening', 'vivencia_reception_music'] loop
    execute format('drop trigger if exists live_notify_i on biodanza.%I', t);
    execute format('drop trigger if exists live_notify_u on biodanza.%I', t);
    execute format('drop trigger if exists live_notify_d on biodanza.%I', t);
  end loop;
end $$;

drop function if exists biodanza.live_notify();
drop function if exists biodanza.live_body(text, text, jsonb, boolean);

commit;
