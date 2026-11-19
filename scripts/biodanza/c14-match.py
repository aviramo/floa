import json,re,unicodedata,difflib,collections,sys
sys.stdout.reconfigure(encoding='utf8')
D=sys.argv[1]
def L(n):
    s=open(D+n,encoding='utf8').read(); return json.loads(s[s.find('['):s.rfind(']')+1])
c=L('c14.json'); cl=L('c14links.json'); now=L('now.json'); nl=L('nowlinks.json')
STOP=set('a an the of in on with and to for by at from or as is'.split())|set('של עם את על ב ל ו ה'.split())
def stem(w):
    for suf in ('ing','es','s','ed'):
        if len(w)>4 and w.endswith(suf): return w[:-len(suf)]
    return w
def toks(t):
    t=unicodedata.normalize('NFD',(t or '').lower()); t=''.join(ch for ch in t if not unicodedata.combining(ch))
    t=re.sub(r'[^0-9a-z\u0590-\u05ff]+',' ',t)
    out=[]
    for w in t.split():
        if w in STOP: continue
        w=re.sub(r'^[והבלמש](?=[\u05d0-\u05ea]{3,})','',w) if re.match(r'^[\u05d0-\u05ea]+$',w) and len(w)>4 else w
        out.append(stem(w))
    return out
def tscore(a,b):
    ta,tb=toks(a),toks(b)
    if not ta or not tb: return 0
    if ta==tb: return 1.0
    sa,sb=sorted(ta),sorted(tb)
    if sa==sb: return 0.97
    j=len(set(ta)&set(tb))/len(set(ta)|set(tb))
    r=difflib.SequenceMatcher(None,' '.join(sa),' '.join(sb)).ratio()
    return max(j,0.5*j+0.5*r) if j>0 else r*0.6
cm=collections.defaultdict(set)
for x in cl: cm[x['c14_id']].add(x['music_id'])
nm=collections.defaultdict(set)
for x in nl: nm[x['exercise_id']].add(x['music_id'])
res=[]
for e in c:
    cands=[]
    for n in now:
        ts=max(tscore(e['title_en'],n['title_en']),tscore(e['title_he'],n['title_he']))
        a,b=cm.get(e['id'],set()),nm.get(n['id'],set())
        sh=len(a&b); jm=sh/len(a|b) if a|b else 0
        if ts<0.3 and sh<2: continue
        cands.append((ts,sh,jm,n['id']))
    cands.sort(key=lambda t:(-(t[0]+0.3*t[2]),-t[1]))
    res.append((e,cands[:3]))
def strength(c):
    if not c: return 'none'
    ts,sh,jm,_=c[0]
    if ts>=0.95: return 'exact'
    if ts>=0.75 or (ts>=0.5 and sh>=2 and jm>=0.4): return 'strong'
    if ts>=0.55 or (sh>=2 and jm>=0.4): return 'possible'
    return 'none'
cnt=collections.Counter(strength(c) for e,c in res); print(cnt)
byid={n['id']:n for n in now}
import random; random.seed(3)
for s in ('exact','strong','possible'):
    print('==',s)
    for e,c in random.sample([r for r in res if strength(r[1])==s],7):
        t=c[0]; print(' ',e['title_en'],'|',e['title_he'],'=>',byid[t[3]]['title_en'],'|',byid[t[3]]['title_he'],round(t[0],2),t[1],round(t[2],2))
json.dump([{'c14':e['id'],'cands':[{'ex':t[3],'title':round(t[0],3),'shared':t[1],'jac':round(t[2],3)} for t in c],'strength':strength(c)} for e,c in res],open(D+'matches.json','w',encoding='utf8'),ensure_ascii=False)
