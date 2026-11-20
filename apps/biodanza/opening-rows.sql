-- the opening of the evening, one row per leader (who = '' is the free text): everyone with the vivencia open sees the changes live,
-- and a save sends only the row that was changed, so two people writing in different sections never overwrite each other
create table if not exists biodanza.vivencia_opening (
  vivencia_id uuid not null references biodanza.vivencias(id) on delete cascade,
  who         text not null default '',
  body        text not null default '',
  position    int  not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (vivencia_id, who)
);
alter table biodanza.vivencia_opening enable row level security;
drop policy if exists opening_read on biodanza.vivencia_opening;
drop policy if exists opening_write on biodanza.vivencia_opening;
create policy opening_read  on biodanza.vivencia_opening for select to authenticated using (biodanza.can_view(vivencia_id));
create policy opening_write on biodanza.vivencia_opening for all    to authenticated using (biodanza.can_edit(vivencia_id)) with check (biodanza.can_edit(vivencia_id));
grant select, insert, update, delete on biodanza.vivencia_opening to authenticated;
alter table biodanza.vivencia_opening replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'biodanza' and tablename = 'vivencia_opening') then
    alter publication supabase_realtime add table biodanza.vivencia_opening;
  end if;
end $$;
