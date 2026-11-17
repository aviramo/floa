-- Live updates between the people who share a vivencia, like a shared document: Supabase Realtime sends a change of these tables to
-- everyone allowed to read the row (the tables' own RLS decides, as for any read). The page then reloads what it shows.
-- A delete carries no readable row, so it reaches every listener with only the key, as in roster.
do $$
declare t text;
begin
  foreach t in array array['vivencias', 'vivencia_items', 'vivencia_owners', 'vivencia_shares', 'vivencia_item_facilitators'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'biodanza' and tablename = t) then
      execute format('alter publication supabase_realtime add table biodanza.%I', t);
    end if;
  end loop;
end $$;
