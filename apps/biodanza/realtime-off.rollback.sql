-- ==========================================================================
-- DRAFT, NOT RUN, needs owner approval. ROLLBACK for apps/biodanza/realtime-off.sql.
-- ==========================================================================
-- node scripts/sql.mjs --table < apps/biodanza/realtime-off.rollback.sql
-- Puts the eight biodanza tables back into supabase_realtime, exactly the set apps/biodanza/realtime.sql left (replica identity was
-- never changed, so nothing else to restore). Safe to run at any time and more than once.
-- ORDER when going back: run THIS first, and only then take 'biodanza' out of SUPABASE.relayData (or remove SUPABASE.relay) in
-- /supabase.js. The other way round leaves a window in which kit clients listen to Supabase for tables that send nothing.
begin;

do $$
declare t text;
begin
  foreach t in array array['vivencias', 'vivencia_items', 'vivencia_owners', 'vivencia_shares', 'vivencia_item_facilitators', 'vivencia_opening',
                           'vivencia_reception_music', 'item_music_options'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'biodanza' and tablename = t) then
      execute format('alter publication supabase_realtime add table biodanza.%I', t);
    end if;
  end loop;
end $$;

select schemaname, count(*) from pg_publication_tables where pubname = 'supabase_realtime' group by schemaname order by schemaname;

commit;
