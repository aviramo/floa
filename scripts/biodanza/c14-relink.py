"""Link the 2014 dances' songs to our music by the collection CODE (BA35-15), not by name: we renamed songs in the catalog, so the PDF's name often differs.
   A code names one song (1823 codes, 5 shared). Order: exact name+code, then the code (when several songs share it, the best by duration and words).
   usage: python scripts/biodanza/c14-relink.py <parsed.json> <music.json> <new_rows.json> <out.sql>"""
import json, sys, re, collections
sys.stdout.reconfigure(encoding='utf8')
P, M, R, OUT = sys.argv[1:5]
s = open(M, encoding='utf8').read(); mu = json.loads(s[s.find('['):s.rfind(']') + 1])
pdf = json.load(open(P, encoding='utf8'))['c2014']
rows = json.load(open(R, encoding='utf8'))
bycoll, byname = collections.defaultdict(list), {}
for m in mu:
    if m['collection']: bycoll[m['collection']].append(m)
    byname[(m['name'] or '').lower(), m['collection'] or ''] = m


def tk(x): return set(re.findall(r'[a-z0-9]{3,}', re.sub(r'[^\x00-\x7f]', ' ', (x or '').lower())))


idof = {r['title_en'].lower(): r['id'] for r in rows}
links, how = set(), collections.Counter()
for dance, songs in pdf.items():
    t = (dance.strip().title() if dance.isupper() else dance.strip()).lower()
    cid = idof.get(t)
    if not cid: continue
    for sg in songs:
        name, sec, code = sg[0], sg[1], sg[2]
        m = byname.get((name.lower(), code or ''))
        if m: how['name+code'] += 1
        elif code and bycoll.get(code):
            best = None
            for c in bycoll[code]:
                a, b = tk(name), tk(c['name'] + ' ' + (c['title'] or '') + ' ' + (c['artist'] or ''))
                ov = len(a & b) / max(1, len(a)); dd = abs((c['duration_sec'] or 0) - sec)
                sc = (dd <= 3) + ov
                if best is None or sc > best[0]: best = (sc, c)
            m = best[1]; how['code'] += 1
        else:
            how['not in our music'] += 1
        if m: links.add((cid, m['id']))
print(dict(how), 'links', len(links))
sql = "begin;\ndelete from biodanza.c14_matches;\ndelete from biodanza.c14_music;\ninsert into biodanza.c14_music (c14_id, music_id) values\n" + ",\n".join("('%s','%s')" % l for l in sorted(links)) + ";\ncommit;\n"
open(OUT, 'w', encoding='utf8', newline='\n').write(sql)
