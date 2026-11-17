-- Realtime ping per business (2026-11-17, owner's decision, test first). A public Realtime broadcast channel per business, topic '<schema>:<slug>'
-- ('roster-test:harpatka' in tests, 'roster:harpatka' in production). The message carries NO data: only the kind of change,
-- {"t":"meeting"|"attendance"|"payment"|"participant"}. The client re-reads through the normal API. Sent once per kind per transaction.
create or replace function roster.rt_ping() returns trigger language plpgsql security definer set search_path = roster, public as $fn$
declare bid uuid; slug text; kind text := tg_argv[0]; topic text; flag text;
begin
  bid := case when tg_op = 'DELETE' then old.business_id else new.business_id end;
  select b.slug into slug from roster.businesses b where b.id = bid;
  if slug is null then return null; end if;
  topic := tg_table_schema || ':' || slug;
  flag := 'rt.k' || md5(topic || '|' || kind);
  if coalesce(current_setting(flag, true), '') = '1' then return null; end if;
  perform set_config(flag, '1', true);
  begin
    perform realtime.send(jsonb_build_object('t', kind), 'change', topic, false);
  exception when others then null;   -- a ping must never fail a save
  end;
  return null;
end $fn$;
revoke all on function roster.rt_ping() from public, anon, authenticated;

do $$
declare t record;
begin
  for t in select * from (values ('meetings', 'meeting'), ('meeting_types', 'meeting'), ('attendance', 'attendance'), ('payments', 'payment'), ('participants', 'participant')) v(tbl, kind) loop
    execute format('drop trigger if exists rt_ping on roster.%I', t.tbl);
    execute format('create trigger rt_ping after insert or update or delete on roster.%I for each row execute function roster.rt_ping(%L)', t.tbl, t.kind);
  end loop;
end $$;
