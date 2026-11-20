"""Rebuild the catalog-2014 side tables straight from catalog-2014-en.pdf (via parse.py's output), so every row is a dance the PDF really has.
   usage: python scripts/biodanza/c14-rebuild.py <parsed.json> <out dir>
   Writes <out>/c14-rebuild.sql (backup of the old side tables, then the new rows). Never touches biodanza.exercises."""
import json, sys, uuid, os
sys.stdout.reconfigure(encoding='utf8')
P, OUT = sys.argv[1], sys.argv[2]
d = json.load(open(P, encoding='utf8'))['c2014']
old = {}
oc = os.path.join(OUT, 'c14.json')
if os.path.exists(oc):
    s = open(oc, encoding='utf8').read()
    for r in json.loads(s[s.find('['):s.rfind(']') + 1]):
        old[r['title_en'].strip().lower()] = r
import re
# not dances: a cross reference ("See: ...") and the lines of the PDF's title page and list of collections, which the parse reads as headings
NOT_DANCE = re.compile(r'^See:|^\W*(Selected musics|Single songs|Correct titles)|Catalogue of Musics|^[A-Z]{2,5}C?\s\W\s')
rows = []
for name, songs in d.items():
    if NOT_DANCE.search(name.strip()): continue
    t = name.strip().title() if name.isupper() else name.strip()
    o = old.get(t.lower(), {})
    rows.append(dict(id=str(uuid.uuid4()), title_en=t, title_he=o.get('title_he') or '', category=o.get('category') or '',
                     music=[dict(name=m[0], coll=m[2] or '') for m in songs]))
json.dump(rows, open(os.path.join(OUT, 'new_rows.json'), 'w', encoding='utf8'), ensure_ascii=False)
sql = """begin;
create table biodanza.c14_old_exercises as select * from biodanza.c14_exercises;
create table biodanza.c14_old_music as select * from biodanza.c14_music;
create table biodanza.c14_old_matches as select * from biodanza.c14_matches;
alter table biodanza.c14_old_exercises enable row level security; alter table biodanza.c14_old_music enable row level security; alter table biodanza.c14_old_matches enable row level security;
delete from biodanza.c14_matches; delete from biodanza.c14_music; delete from biodanza.c14_exercises;
create temp table _n on commit drop as select $j$%s$j$::jsonb as j;
insert into biodanza.c14_exercises (id, title_en, title_he, category, raw_sources)
select (e->>'id')::uuid, e->>'title_en', e->>'title_he', e->>'category', '[]'::jsonb from _n, jsonb_array_elements(j) e;
insert into biodanza.c14_music (c14_id, music_id)
select distinct (e->>'id')::uuid, mu.id from _n, jsonb_array_elements(j) e
cross join lateral jsonb_array_elements(e->'music') m
join biodanza.music mu on lower(mu.name) = lower(m->>'name') and mu.collection = m->>'coll' and mu.owner_id is null
on conflict do nothing;
commit;
""" % json.dumps([dict(id=r['id'], title_en=r['title_en'], title_he=r['title_he'], category=r['category'], music=r['music']) for r in rows], ensure_ascii=False)
open(os.path.join(OUT, 'c14-rebuild.sql'), 'w', encoding='utf8', newline='\n').write(sql)
print(len(rows), 'dances', sum(len(r['music']) for r in rows), 'song lines', 'with old Hebrew:', sum(1 for r in rows if r['title_he']))
