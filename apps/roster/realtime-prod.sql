-- PRODUCTION VERSION of realtime.sql (narrowed). Needs prod-columns.sql first. A public Realtime broadcast channel per business, topic '<schema>:<slug>', message {"t": kind}, no data.
-- The trigger function returns before doing anything when business_settings.realtime is off (the default, AUM), and the whole body is wrapped so it can never fail or delay a write.
-- The trigger itself still exists on the tables of every business (a trigger cannot look at another table), so each write runs one small select and returns.
create or replace function roster.rt_ping() returns trigger language plpgsql security definer set search_path = roster, public as $fn$
declare bid uuid; slug text; kind text := tg_argv[0]; topic text; flag text;
begin
  begin
    bid := case when tg_op = 'DELETE' then old.business_id else new.business_id end;
    if not coalesce((select s.realtime from roster.business_settings s where s.business_id = bid), false) then return null; end if;
    select b.slug into slug from roster.businesses b where b.id = bid;
    if slug is null then return null; end if;
    topic := tg_table_schema || ':' || slug;
    flag := 'rt.k' || md5(topic || '|' || kind);
    if coalesce(current_setting(flag, true), '') = '1' then return null; end if;
    perform set_config(flag, '1', true);
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
