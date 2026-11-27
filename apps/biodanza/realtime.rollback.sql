-- ROLLBACK for the 2026-11-26 part of apps/biodanza/realtime.sql. Run only to undo it: node scripts/sql.mjs < apps/biodanza/realtime.rollback.sql
-- State before it ran (read 2026-11-26): the publication held biodanza.vivencias, vivencia_items, vivencia_opening, vivencia_owners, vivencia_shares,
-- vivencia_item_facilitators (plus roster and roster-test tables, untouched); no rev column on any of the three tables; no policies at all on realtime.messages
-- (RLS enabled, not forced); triggers then: item_no_catalog_link on vivencia_items, vivencia_new and vivencia_public_guard on vivencias, none on vivencia_opening.
-- Replica identity was not changed (vivencia_opening full, the rest default). The six earlier publication tables stay: only the two added on 2026-11-26 leave.
-- Dropping rev loses nothing the old client reads; a new client that sends rev=eq.<n> would then fail its conditional saves.
begin;

drop policy if exists "biodanza vivencia channel: receive" on realtime.messages;
drop policy if exists "biodanza vivencia channel: send" on realtime.messages;

drop trigger if exists rev_bump on biodanza.vivencias;
drop trigger if exists rev_bump on biodanza.vivencia_items;
drop trigger if exists rev_bump on biodanza.vivencia_opening;
drop function if exists biodanza.rev_bump();

alter table biodanza.vivencias        drop column if exists rev;
alter table biodanza.vivencia_items   drop column if exists rev;
alter table biodanza.vivencia_opening drop column if exists rev;

do $$
declare t text;
begin
  foreach t in array array['vivencia_reception_music', 'item_music_options'] loop
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'biodanza' and tablename = t) then
      execute format('alter publication supabase_realtime drop table biodanza.%I', t);
    end if;
  end loop;
end $$;

commit;
