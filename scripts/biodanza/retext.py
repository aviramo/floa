"""Load the careful Hebrew texts of the catalog exercises (poetics, guidance, level, curve) and the raw material of every catalog into the database.
   usage: python scripts/biodanza/retext.py <units.json> <dir with out-*.json> <out dir>      then: node scripts/sql.mjs < <out dir>/retext-N.sql
   units.json: the exercises as one unit per real exercise (all catalogs that mention it), with `members` (rows) and `raw` (what the catalogs say).
   - exercise_texts, lang 'he', source 'translation': the new Hebrew. The catalog's own English rows (source 'catalog') are never overwritten, but get their level and curve.
   - exercises.raw_sources: all the raw material of the unit, on every member row.
   The output is catalog material: never commit it."""
import sys, os, json, glob
UNITS, DIR, OUT = sys.argv[1:4]
os.makedirs(OUT, exist_ok=True)
units = {u['unit']: u for u in json.load(open(UNITS, encoding='utf-8'))}
res = {}
for fn in sorted(glob.glob(os.path.join(DIR, 'out-*.json'))):
    for o in json.load(open(fn, encoding='utf-8')):
        res[o['unit']] = o['results']
missing = [k for k in units if k not in res]
assert not missing, missing
EN_LEVEL, EN_CURVE = ('Level',), ('Right moment in the curve-session',)
rows, en = [], []
for k, u in units.items():
    raw = json.dumps(u['raw'], ensure_ascii=False)
    for r in res[k]:
        for i in r['ids']:
            rows.append(dict(id=i, poetics=r['poetics'].strip(), guidance=r['guidance'].strip(), level=r['level'].strip(), curve=r['curve'].strip(), raw=u['raw']))
    for m in u['members']:
        if m['source'] != 'cimeb2018':
            continue
        f = next((x['fields'] for x in u['raw'] if x['catalog'] == 'cimeb2018' and x['lang'] == 'en'), {})
        lv = ' '.join(f.get(x, '') for x in EN_LEVEL).strip(); cv = ' '.join(f.get(x, '') for x in EN_CURVE).strip()
        if lv or cv:
            en.append(dict(id=m['id'], level=lv, curve=cv))
SQL = """
create temp table _t on commit drop as select $j${body}$j$::jsonb as j;
insert into biodanza.exercise_texts (exercise_id, lang, poetics, guidance, level, curve, source)
select (r->>'id')::uuid, 'he', r->>'poetics', r->>'guidance', r->>'level', r->>'curve', 'translation' from _t, jsonb_array_elements(j->'rows') r
on conflict (exercise_id, lang) do update set poetics = excluded.poetics, guidance = excluded.guidance, level = excluded.level, curve = excluded.curve, source = 'translation', updated_at = now();
update biodanza.exercises x set raw_sources = r->'raw', level = r->>'level', updated_at = now() from _t, jsonb_array_elements(j->'rows') r where x.id = (r->>'id')::uuid;
update biodanza.exercise_texts t set level = r->>'level', curve = r->>'curve' from _t, jsonb_array_elements(j->'en') r where t.exercise_id = (r->>'id')::uuid and t.lang = 'en';
"""
CH = 60
for n in range(0, len(rows), CH):
    part = rows[n:n + CH]; ids = {r['id'] for r in part}
    body = json.dumps(dict(rows=part, en=[e for e in en if e['id'] in ids]), ensure_ascii=False)
    assert '$j$' not in body
    open(os.path.join(OUT, 'retext-%d.sql' % (n // CH + 1)), 'w', encoding='utf-8').write(SQL.replace('{body}', body))
print(len(rows), 'rows,', len(en), 'english level/curve,', (len(rows) + CH - 1) // CH, 'files')
