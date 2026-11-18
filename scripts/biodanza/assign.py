"""Load the curve positions and group levels assigned to the catalog exercises (agents' out-NN.json, ids of biodanza.exercises).
   usage: python scripts/biodanza/assign.py <dir with out-*.json> <out.sql>      then: node scripts/sql.mjs < <out.sql>
   Never overwrites a value the catalog states (basis 'catalog'); fills the empty ones, with their basis, and the phase_hint of the exercise."""
import sys, os, json, glob
rows = []
for fn in sorted(glob.glob(os.path.join(sys.argv[1], 'out-*.json'))):
    rows += json.load(open(fn, encoding='utf-8'))
body = json.dumps([r for r in rows if r.get('curve') or r.get('level')], ensure_ascii=False)
assert '$j$' not in body
sql = """
create temp table _a on commit drop as select $j${body}$j$::jsonb as j;
insert into biodanza.exercise_texts (exercise_id, lang, source)
select (r->>'id')::uuid, 'he', 'draft' from _a, jsonb_array_elements(j) r on conflict do nothing;
update biodanza.exercise_texts t set level = r->>'level', level_basis = r->>'level_basis'
from _a, jsonb_array_elements(j) r where t.exercise_id = (r->>'id')::uuid and t.lang = 'he' and t.level = '' and coalesce(r->>'level', '') <> '' and r->>'level_basis' <> 'catalog';
update biodanza.exercise_texts t set curve = r->>'curve', curve_basis = r->>'curve_basis'
from _a, jsonb_array_elements(j) r where t.exercise_id = (r->>'id')::uuid and t.lang = 'he' and t.curve = '' and coalesce(r->>'curve', '') <> '' and r->>'curve_basis' <> 'catalog';
update biodanza.exercises x set phase_hint = r->>'phase'
from _a, jsonb_array_elements(j) r where x.id = (r->>'id')::uuid and x.phase_hint is null and coalesce(r->>'phase', '') <> '';
""".replace('{body}', body)
open(sys.argv[2], 'w', encoding='utf-8').write(sql)
print(len(rows), 'items,', sum(1 for r in rows if r.get('curve')), 'with a curve,', sum(1 for r in rows if r.get('level')), 'with a level')
