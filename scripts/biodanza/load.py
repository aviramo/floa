"""Turn the parsed catalog JSON (parse.py) into SQL for the biodanza schema, one file per source.
   usage: python scripts/biodanza/load.py <catalog.json> <out dir>
   then:  node scripts/sql.mjs < <out dir>/ibf2012.sql   (and cimeb2018.sql, then c2014.sql)
   Safe to run again: exercises and music are keyed, links are skipped when present.
   The output is catalog material: never commit it."""
import sys, os, json, re, difflib

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
J = json.load(open(SRC, encoding='utf-8'))


def pick(he, en):
    return he if he else en


def rows(items):
    out = []
    for e in items:
        out.append(dict(
            source=e['source'], category='' if e['source'] == 'cimeb2018' else e.get('category', ''),   # a 2018 dance's section is its LINE (kept in exercise_lines), not a category
            
            title_he=e.get('title_he', ''), title_en=e['title_en'],
            summary=pick(e.get('summary_he', ''), e.get('summary_en', '')),
            poetics=pick(e.get('poetics_he', ''), e.get('poetics_en', '')),
            guidance=pick(e.get('description_he', ''), e.get('description_en', '')),
            objective=pick(e.get('objective_he', ''), e.get('objective_en', '')),
            emphasis=pick(e.get('emphasis_he', ''), e.get('emphasis_en', '')),
            semantic_field=pick(e.get('semantic_he', ''), e.get('semantic_en', '')),
            level=pick(e.get('level_he', ''), e.get('level_en', '')),
            authors=pick(e.get('authors_he', ''), e.get('authors', '')),
            phase=e.get('phase'), lines=e.get('lines', []),
            music=[dict(name=m[0], sec=m[1], coll=m[2], title=m[3], artist=m[4]) for m in e.get('music', [])]))
    return out


def sql_for(data):
    body = json.dumps(data, ensure_ascii=False)
    assert '$j$' not in body
    return f"""
create temp table _j on commit drop as select $j${body}$j$::jsonb as j;
insert into biodanza.exercises (source, category, title_he, title_en, summary, poetics, guidance, objective, emphasis, semantic_field, level, authors, phase_hint)
select e->>'source', e->>'category', e->>'title_he', e->>'title_en', e->>'summary', e->>'poetics', e->>'guidance', e->>'objective', e->>'emphasis',
       e->>'semantic_field', e->>'level', e->>'authors', nullif(e->>'phase', '')
from _j, jsonb_array_elements(j) e
on conflict (source, title_en) where owner_id is null and source <> '' do update set
  category = excluded.category, title_he = excluded.title_he, summary = excluded.summary, poetics = excluded.poetics, guidance = excluded.guidance,
  objective = excluded.objective, emphasis = excluded.emphasis, semantic_field = excluded.semantic_field, level = excluded.level,
  authors = excluded.authors, phase_hint = excluded.phase_hint, updated_at = now();
insert into biodanza.exercise_lines (exercise_id, line_key, main)
select x.id, l.key, l.ord = 1
from _j, jsonb_array_elements(j) e
join biodanza.exercises x on x.source = e->>'source' and x.title_en = e->>'title_en' and x.owner_id is null
cross join lateral jsonb_array_elements_text(e->'lines') with ordinality as l(key, ord)
on conflict do nothing;
insert into biodanza.music (name, duration_sec, collection, title, artist)
select distinct on (lower(m->>'name'), m->>'coll') m->>'name', (m->>'sec')::int, coalesce(m->>'coll', ''), m->>'title', m->>'artist'
from _j, jsonb_array_elements(j) e, jsonb_array_elements(e->'music') m
on conflict (lower(name), collection) where owner_id is null do update set title = excluded.title, artist = excluded.artist;
insert into biodanza.exercise_music (exercise_id, music_id, phase_hint, source)
select distinct x.id, mu.id, nullif(e->>'phase', ''), e->>'source'
from _j, jsonb_array_elements(j) e
join biodanza.exercises x on x.source = e->>'source' and x.title_en = e->>'title_en' and x.owner_id is null
cross join lateral jsonb_array_elements(e->'music') m
join biodanza.music mu on lower(mu.name) = lower(m->>'name') and mu.collection = coalesce(m->>'coll', '') and mu.owner_id is null
on conflict do nothing;
"""


def norm(s):
    return re.sub(r'[^a-z0-9]+', ' ', re.sub(r'\(.*?\)', ' ', s.lower().replace('`', "'"))).strip()


for key in ('ibf2012', 'cimeb2018'):
    open(os.path.join(OUT, key + '.sql'), 'w', encoding='utf-8').write(sql_for(rows(J[key])))

# 2014: music by dance name, attached to the exercises it clearly names
ex = [(norm(e['title_en']), e) for e in J['ibf2012'] + J['cimeb2018']]
keys = [k for k, _ in ex]
attach, miss = [], []
for dance, music in J['c2014'].items():
    k = norm(dance)
    hit = None
    for kk, e in ex:
        if kk == k:
            hit = e
            break
    if not hit:
        m = difflib.get_close_matches(k, keys, n=1, cutoff=0.9)
        hit = next((e for kk, e in ex if kk == m[0]), None) if m else None
    if hit and music:
        attach.append(dict(source=hit['source'], title_en=hit['title_en'].title() if hit['title_en'].isupper() else hit['title_en'],
                           music=[dict(name=m[0], sec=m[1], coll=m[2], title=m[3], artist=m[4]) for m in music]))
    elif music:
        miss.append(dance)
sql14 = f"""
create temp table _j on commit drop as select $j${json.dumps(attach, ensure_ascii=False)}$j$::jsonb as j;
insert into biodanza.music (name, duration_sec, collection, title, artist)
select distinct on (lower(m->>'name'), m->>'coll') m->>'name', (m->>'sec')::int, coalesce(m->>'coll', ''), m->>'title', m->>'artist'
from _j, jsonb_array_elements(j) e, jsonb_array_elements(e->'music') m
on conflict (lower(name), collection) where owner_id is null do update set title = excluded.title, artist = excluded.artist;
insert into biodanza.exercise_music (exercise_id, music_id, source)
select distinct x.id, mu.id, 'catalog2014'
from _j, jsonb_array_elements(j) e
join biodanza.exercises x on x.source = e->>'source' and lower(x.title_en) = lower(e->>'title_en') and x.owner_id is null
cross join lateral jsonb_array_elements(e->'music') m
join biodanza.music mu on lower(mu.name) = lower(m->>'name') and mu.collection = coalesce(m->>'coll', '') and mu.owner_id is null
on conflict do nothing;
"""
open(os.path.join(OUT, 'c2014.sql'), 'w', encoding='utf-8').write(sql14)
print(json.dumps(dict(exercises2012=len(J['ibf2012']), exercises2018=len(J['cimeb2018']), dances2014_attached=len(attach), dances2014_unmatched=len(miss)), ensure_ascii=False))
