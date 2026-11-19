# Generate the SQL files (and the undo record) for the IBF 2012 catalog. Uncommitted helper.
import json, os, re, uuid
OUT = r'C:\Users\ofira\AppData\Local\Temp\claude\31757639e4a3fe8c\37442aa8-1ebb-48a1-afe8-2e8fc52f7e9a\scratchpad\ibf2012'
d = json.load(open(os.path.join(OUT, 'final.json'), encoding='utf-8'))
F = d['exercises']; C = d['categories']
assert len({r['title_en'] for r in F}) == len(F), 'duplicate title_en'
idfile = os.path.join(OUT, 'ibf2012-inserted-ids.json')
if os.path.exists(idfile):
    ids = json.load(open(idfile, encoding='utf-8'))
else:
    ids = dict(categories=[c['key'] for c in C], exercises=[dict(id=str(uuid.uuid4()), title_en=r['title_en'], idx=r['idx']) for r in F])
    json.dump(ids, open(idfile, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
idof = {e['idx']: e['id'] for e in ids['exercises']}

def q(s):
    assert '$q$' not in s
    return '$q$' + s + '$q$'

os.makedirs(os.path.join(OUT, 'sql'), exist_ok=True)
# 0: categories
lines = ["alter table biodanza.categories add column if not exists name_orig text not null default '';",
         "alter table biodanza.categories add column if not exists lang_orig text not null default 'en';",
         "insert into biodanza.categories (key, name_he, name_orig, lang_orig, sort) values"]
vals = [f"  ({q(c['key'])}, {q(c['name_he'])}, {q(c['name_orig'])}, 'en', {c['sort']})" for c in C]
lines.append(',\n'.join(vals) + ';')
open(os.path.join(OUT, 'sql', '00-categories.sql'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')

import sys
REDO = [int(a) for a in sys.argv[1:]]
BATCH = 30
for b in (range(0, len(F), BATCH) if not REDO else [0]):
    out = []
    for r in (F[b:b + BATCH] if not REDO else [F[i] for i in REDO]):
        if REDO:
            out.append(f"delete from biodanza.exercises where id = '{idof[r['idx']]}' and source = 'ibf2012';")
        eid = idof[r['idx']]
        raw = [dict(source='ibf2012', lang='en', sections=r['raw_en']),
               dict(source='ibf2012', lang='he', sections=r['raw_he'], translated=r['translated'])]
        out.append(
            "insert into biodanza.exercises (id, owner_id, base_id, source, category, title_he, title_en, summary, poetics, guidance, objective, emphasis, "
            "semantic_field, level, authors, phase_hint, phase_keys, raw_sources, created_at) values "
            f"('{eid}', null, null, 'ibf2012', {q(r['category'])}, {q(r['title_he'])}, {q(r['title_en'])}, '', {q(r['he']['poetics'])}, {q(r['he']['guidance'])}, '', '', '', '', '', "
            f"'unclassified', array['unclassified'], {q(json.dumps(raw, ensure_ascii=False))}::jsonb, now() + interval '{r['idx']} seconds');")
        out.append(f"insert into biodanza.exercise_texts (exercise_id, lang, poetics, guidance, source) values ('{eid}', 'en', {q(r['en']['poetics'])}, {q(r['en']['guidance'])}, 'catalog');")
        out.append(f"insert into biodanza.exercise_texts (exercise_id, lang, poetics, guidance, source) values ('{eid}', 'he', {q(r['he']['poetics'])}, {q(r['he']['guidance'])}, '{r['he']['source']}');")
        out.append(f"insert into biodanza.exercise_lines (exercise_id, line_key, main) values ('{eid}', 'unclassified', true);")
    fn = f'{1 + b // BATCH:02d}-exercises.sql' if not REDO else 'redo.sql'
    open(os.path.join(OUT, 'sql', fn), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('files', len(os.listdir(os.path.join(OUT, 'sql'))))
