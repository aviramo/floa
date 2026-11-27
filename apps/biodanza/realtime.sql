-- Live updates between the people who share a vivencia, like a shared document: Supabase Realtime sends a change of these tables to
-- everyone allowed to read the row (the tables' own RLS decides, as for any read). The page then reloads what it shows.
-- A delete carries no readable row, so it reaches every listener with only the key, as in roster.
--
-- 2026-11-26 (owner: "מאשר sql"), the server side of the kit's realtime (ui/SKILL.md, "נתונים בזמן אמת", "צד השרת"):
--   1. vivencia_reception_music and item_music_options join the publication (the earlier tables stay; the block only adds what is missing).
--   2. rev on the co-edited rows (vivencias: the title; vivencia_items; vivencia_opening): a column and a BEFORE UPDATE trigger that raises it by one,
--      for the kit's conditional save (PATCH ...&rev=eq.<n>). The old client never sends or reads rev: it writes explicit columns, so it is unaffected.
--   3. Private channels for carets: RLS on realtime.messages for topics 'biodanza:vivencia:<uuid>', the same question as reading the vivencia (can_view).
--      Public channels never consult these policies, so the old client's 'biodanza' and 'biodanza-cur:<id>' topics and roster's public pings are untouched.
-- No replica identity change (vivencia_opening stays full, the rest default).
-- Undo: apps/biodanza/realtime.rollback.sql. Checks: apps/biodanza/realtime.check.sql.
begin;

-- 1. publication
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

-- 2. rev: the row's version; every update raises it by one, whatever the writer sent
alter table biodanza.vivencias        add column rev bigint not null default 0;
alter table biodanza.vivencia_items   add column rev bigint not null default 0;
alter table biodanza.vivencia_opening add column rev bigint not null default 0;

create function biodanza.rev_bump() returns trigger language plpgsql as
$$ begin new.rev := old.rev + 1; return new; end $$;
revoke all on function biodanza.rev_bump() from public, anon, authenticated;

-- independent of the other BEFORE triggers on these tables (item_no_catalog_link only nulls exercise_id, vivencia_public_guard only raises), so their order does not matter
create trigger rev_bump before update on biodanza.vivencias        for each row execute function biodanza.rev_bump();
create trigger rev_bump before update on biodanza.vivencia_items   for each row execute function biodanza.rev_bump();
create trigger rev_bump before update on biodanza.vivencia_opening for each row execute function biodanza.rev_bump();

-- 3. private channels 'biodanza:vivencia:<uuid>': hear and send only who may read the vivencia.
-- The CASE checks the shape before the cast, so any other topic is simply false, never an error.
create policy "biodanza vivencia channel: receive" on realtime.messages for select to authenticated
  using (case when realtime.topic() ~ '^biodanza:vivencia:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              then biodanza.can_view(split_part(realtime.topic(), ':', 3)::uuid) else false end);
create policy "biodanza vivencia channel: send" on realtime.messages for insert to authenticated
  with check (case when realtime.topic() ~ '^biodanza:vivencia:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                   then biodanza.can_view(split_part(realtime.topic(), ':', 3)::uuid) else false end);

commit;
