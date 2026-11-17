"""Load the per-language texts (poetics, guidance) into biodanza.exercise_texts. Never overwrites a 'catalog' text with anything else.
   usage: python scripts/biodanza/texts.py base <catalog.json> <out.sql>          the catalog's own English and Hebrew texts
          python scripts/biodanza/texts.py todo <catalog.json> <out dir> <n>      the English texts that have no Hebrew yet, in n files
          python scripts/biodanza/texts.py trans <catalog.json> <dir with he-*.json> <out.sql>   the translations made for them
   The output is catalog material: never commit it."""
import sys, json, os, glob

mode = sys.argv[1]
J = json.load(open(sys.argv[2], encoding='utf-8'))
ALL = J['ibf2012'] + J['cimeb2018']
FIELDS = (('guidance', 'description_en', 'description_he'), ('poetics', 'poetics_en', 'poetics_he'))


def sql(rows, source):
    body = json.dumps(rows, ensure_ascii=False)
    assert '$j$' not in body
    return f"""
create temp table _t on commit drop as select $j${body}$j$::jsonb as j;
insert into biodanza.exercise_texts (exercise_id, lang, poetics, guidance, source)
select x.id, r->>'lang', coalesce(r->>'poetics', ''), coalesce(r->>'guidance', ''), '{source}'
from _t, jsonb_array_elements(j) r
join biodanza.exercises x on x.source = r->>'src' and x.title_en = r->>'title' and x.owner_id is null
on conflict (exercise_id, lang) do update set
  poetics = case when excluded.poetics <> '' then excluded.poetics else biodanza.exercise_texts.poetics end,
  guidance = case when excluded.guidance <> '' then excluded.guidance else biodanza.exercise_texts.guidance end,
  source = excluded.source, updated_at = now()
where biodanza.exercise_texts.source <> 'catalog' or excluded.source = 'catalog';
"""


if mode == 'base':
    rows = []
    for e in ALL:
        for lang, suf in (('en', 'en'), ('he', 'he')):
            r = dict(src=e['source'], title=e['title_en'], lang=lang)
            for f, en, he in FIELDS:
                v = e.get(en if suf == 'en' else he, '')
                if v: r[f] = v
            if len(r) > 3: rows.append(r)
    open(sys.argv[3], 'w', encoding='utf-8').write(sql(rows, 'catalog'))
    print(len(rows), 'rows')
elif mode == 'todo':
    items = []
    for e in ALL:
        for f, en, he in FIELDS:
            if e.get(en) and not e.get(he):
                items.append(dict(id=e['source'] + '|' + e['title_en'] + '|' + f, text=e[en]))
    n = int(sys.argv[4]); os.makedirs(sys.argv[3], exist_ok=True)
    size = -(-len(items) // n)
    for i in range(n):
        json.dump(items[i * size:(i + 1) * size], open(os.path.join(sys.argv[3], f'todo-{i + 1}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(len(items), 'texts in', n, 'files')
elif mode == 'trans':
    by = {}
    for fn in sorted(glob.glob(os.path.join(sys.argv[3], 'he-*.json'))):
        for it in json.load(open(fn, encoding='utf-8')):
            src, title, f = it['id'].split('|')
            by.setdefault((src, title), {})[f] = it['he']
    rows = [dict(src=k[0], title=k[1], lang='he', **v) for k, v in by.items()]
    open(sys.argv[4], 'w', encoding='utf-8').write(sql(rows, 'translation'))
    print(len(rows), 'exercises translated')
