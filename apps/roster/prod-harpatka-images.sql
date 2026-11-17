-- Harpatka gap file 3 (data, business harpatka ONLY): the pictures of the 3 meetings and of the meeting type, as roster-media URLs.
-- Run after prod-harpatka-gaps.sql. The files are already in the bucket roster-media under the business folder (copied by the import).
-- Every statement is limited to the harpatka business by id AND slug; no other business is touched. Safe to re-run.
do $$
declare b uuid := (select id from roster.businesses where slug = 'harpatka');
        base text;
begin
  if b is null then raise exception 'business harpatka not found'; end if;
  base := 'https://aexmnaxvahblveejsbup.supabase.co/storage/v1/object/public/roster-media/' || b::text || '/';
  update roster.meetings set image_url = base || 'meeting-images-m-1794682954698-b5uzez.jpg' where business_id = b and id = '2be21376-0301-4b2f-82e6-d3883488a4fd';
  update roster.meetings set image_url = base || 'meeting-images-m-1794682969684-tm0v4b.jpg' where business_id = b and id = '5ddd33f4-45fa-4593-965e-1bdfc5de4a5a';
  update roster.meetings set image_url = base || 'meeting-images-m-1794576677233-lv8ki3.jpg' where business_id = b and id = '5bdda240-db58-4d6d-a519-e277308fd6f5';
  update roster.meeting_types set image_url = base || 'meeting-images-m-1793140002581-z92p5t.jpg' where business_id = b and id = 'ba1aeeed-4fd8-4c56-924b-f88fd5a66bed';
  if not exists (select 1 from storage.objects where bucket_id = 'roster-media' and name = b::text || '/meeting-images-m-1793140002581-z92p5t.jpg') then raise exception 'picture file missing in roster-media'; end if;
end $$;
