-- duplicating a vivencia: a new one with its own topic, with the exercises (their texts, their place and the "others" group), the music of each exercise
-- (the chosen one and the options) and the start and end music. Not the shares, and not who guides which exercise: the copy is the caller's own.
-- It runs as the caller: the row security that lets him see the first one and write the new one is the one that decides.
create or replace function biodanza.duplicate_vivencia(src uuid, p_id uuid, p_title text) returns uuid
language plpgsql security invoker set search_path = biodanza, public as $$
declare it biodanza.vivencia_items; nid uuid;
begin
  if not biodanza.can_view(src) then raise exception 'no access'; end if;
  insert into biodanza.vivencias (id, title, notes, created_by)
    select p_id, coalesce(nullif(trim(p_title), ''), v.title), v.notes, auth.uid() from biodanza.vivencias v where v.id = src;
  for it in select * from biodanza.vivencia_items where vivencia_id = src order by position loop   -- one by one: the options' row security looks at the item, which must already be there
    nid := gen_random_uuid();
    insert into biodanza.vivencia_items (id, vivencia_id, position, exercise_id, music_id, notes, poetics, guidance, title, backlog)
      values (nid, p_id, it.position, it.exercise_id, it.music_id, it.notes, it.poetics, it.guidance, it.title, it.backlog);
    insert into biodanza.item_music_options (item_id, music_id, created_at)
      select nid, o.music_id, o.created_at from biodanza.item_music_options o where o.item_id = it.id;
  end loop;
  insert into biodanza.vivencia_reception_music (vivencia_id, music_id, kind, created_at, position)
    select p_id, r.music_id, r.kind, r.created_at, r.position from biodanza.vivencia_reception_music r where r.vivencia_id = src;
  return p_id;
end $$;
revoke all on function biodanza.duplicate_vivencia(uuid, uuid, text) from public, anon;
grant execute on function biodanza.duplicate_vivencia(uuid, uuid, text) to authenticated;
