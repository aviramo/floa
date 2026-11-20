-- A song that is only the start or end music of a vivencia, or only an option of one of its exercises, was
-- invisible to the people it is shared with (music_read covered the catalog, the reader's own uploads, uploads
-- tied to the vivencia and a song chosen for an exercise). Now whoever can view the vivencia sees all of them.
begin;
drop policy if exists music_read on biodanza.music;
create policy music_read on biodanza.music for select to authenticated using (
  biodanza.is_allowed() and (
    owner_id is null
    or owner_id = auth.uid()
    or (vivencia_id is not null and biodanza.can_view(vivencia_id))
    or exists (select 1 from biodanza.vivencia_items i where i.music_id = music.id and biodanza.can_view(i.vivencia_id))
    or exists (select 1 from biodanza.vivencia_reception_music r where r.music_id = music.id and biodanza.can_view(r.vivencia_id))
    or exists (select 1 from biodanza.item_music_options o join biodanza.vivencia_items i on i.id = o.item_id where o.music_id = music.id and biodanza.can_view(i.vivencia_id))
  ));
commit;
