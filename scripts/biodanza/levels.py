"""Load the group level assigned to every catalog exercise (agents' out-NN.json: id, level_key, basis) into the database.
   usage: python scripts/biodanza/levels.py <dir with out-*.json> <out.sql>      then: node scripts/sql.mjs < <out.sql>
   exercises.level_key is set for all. The text shown (exercise_texts.level) becomes the level's own name, except where the catalog or the
   exercise's own text words it in more detail (basis catalog or text): that wording stays."""
import sys, os, json, glob
rows = []
for fn in sorted(glob.glob(os.path.join(sys.argv[1], 'out-*.json'))):
    rows += json.load(open(fn, encoding='utf-8'))
body = json.dumps([dict(id=r['id'], level_key=r['level_key'], basis=r['basis']) for r in rows], ensure_ascii=False)
sql = """
create temp table _l on commit drop as select $j${body}$j$::jsonb as j;
update biodanza.exercises x set level_key = r->>'level_key', level_keys = array[r->>'level_key'] from _l, jsonb_array_elements(j) r where x.id = (r->>'id')::uuid;
insert into biodanza.exercise_texts (exercise_id, lang, source) select (r->>'id')::uuid, 'he', 'draft' from _l, jsonb_array_elements(j) r on conflict do nothing;
update biodanza.exercise_texts t set level = l.name_he, level_basis = r->>'basis'
from _l, jsonb_array_elements(j) r join biodanza.levels l on l.key = r->>'level_key'
where t.exercise_id = (r->>'id')::uuid and t.lang = 'he' and (t.level_basis not in ('catalog', 'text') or t.level = '');
""".replace('{body}', body)
open(sys.argv[2], 'w', encoding='utf-8').write(sql)
import collections
print(len(rows), 'items', dict(collections.Counter(r['level_key'] for r in rows)), dict(collections.Counter(r['basis'] for r in rows)))
