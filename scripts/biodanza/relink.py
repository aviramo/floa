"""Rebuild the dance to music links of the 2014 catalog from its SECOND part (music, then the dances under it), which is clean, and drop the links of the first part that it contradicts (that parser lost dance headings that did not follow a blank line, so songs landed on the wrong dance).
   Needs: the text of catalog-2014-en.pdf (pdftotext -layout) as c2014.txt, and links.raw / ex.raw / mus2.raw (json_agg dumps of exercise_music, exercises, music) in one folder; writes relink.json.
   usage: python scripts/biodanza/relink.py <folder>      Back up exercise_music first. The output is catalog material: never commit it."""
import re,json,collections,unicodedata,difflib,sys
SP=sys.argv[1]
def rd(f):
    r=open(SP+"/"+f,encoding="utf8").read(); return json.loads(r[:r.rfind("]")+1])[0]["coalesce"]
links,exs,mus=rd("links.raw"),rd("ex.raw"),rd("mus2.raw")
t=open(SP+"/c2014.txt",encoding="latin-1").read().split("\n")
CODE=re.compile(r"([A-Z]{2,5}C?\d{1,2}-\d{1,3})\s*$")
songs=[];cur=None
for l in t[5566:]:
    s=l.strip().lstrip("!").strip()
    if not s: continue
    if "...." in s:
        m=CODE.search(s); cur={"code":m.group(1).upper() if m else "","dances":[]}; songs.append(cur)
    elif cur is not None and not re.match(r"^[\d! ]+$",s): cur["dances"].append(s)
STOP={"of","the","in","and","with","a","to","for","by","on","at"}
def stem(v):
    v=re.sub(r"(isation|ization)$","iz",v); v=re.sub(r"ies$","y",v)
    if len(v)>3 and v.endswith("s") and not v.endswith("ss"): v=v[:-1]
    if len(v)>3 and v.endswith("e"): v=v[:-1]
    if len(v)>5 and v.endswith("ing"): v=v[:-3]
    return v.replace("rhyt","rhyth").replace("sinc","sync")
GENERIC={"circle","dance","walk","game","encounter","rhythmic","rhythm","expressive","creative","pair","group","caress","contact","free","activation","synchroniz","synchronis","music","movement"}
def tok(x):
    x=unicodedata.normalize("NFKD",x.lower()); x=re.sub(r"[\u0300-\u036f]","",x); x=re.sub(r"\(.*?\)"," ",x)
    x=re.sub(r"in (2|two'?s?|twos)|two'?s|in pairs|pairs|pair"," pair ",x); x=re.sub(r"in (3|three'?s?)"," trio ",x)
    return frozenset(stem(w) for w in re.findall(r"[a-z0-9]+",x) if w not in STOP)
def sim(a,b):
    if not a or not b: return 0
    j=len(a&b)/len(a|b); c=len(a&b)/min(len(a),len(b))
    inter=a&b
    if min(len(a),len(b))>=2: return max(j,0.85*c)
    return max(j,0.85*c if inter and not inter<=GENERIC else 0)
extok={e["id"]:tok(e["title_en"]) for e in exs}
bycode=collections.defaultdict(list)
for s in songs:
    if s["code"]: bycode[s["code"]].append(s)
# 1) contradicted catalog2014 links (lenient matching)
drop=[];keep=0
for l in links:
    if l["lsrc"]!="catalog2014" or not l["code"] or l["code"] not in bycode: continue
    dances=[d for s in bycode[l["code"]] for d in s["dances"]]
    if not dances: continue
    et=extok[l["eid"]]
    if any(sim(et,tok(d))>=0.5 or difflib.SequenceMatcher(None," ".join(sorted(et))," ".join(sorted(tok(d)))).ratio()>=0.75 for d in dances): keep+=1
    else: drop.append(l)
print("catalog2014 links checked and kept",keep,"| contradicted (to drop)",len(drop))
# 2) links to add from part 2
byname=collections.defaultdict(list)
for e in exs:
    if extok[e["id"]]: byname[extok[e["id"]]].append(e["id"])
existing={(l["eid"],l["mid"]) for l in links}
musbycode=collections.defaultdict(list)
for m in mus:
    if m["code"]: musbycode[m["code"]].append(m)
add=set();unmapped=collections.Counter();mapped=0
for s in songs:
    if not s["code"] or s["code"] not in musbycode: continue
    ms=sorted(musbycode[s["code"]],key=lambda m:(not m["in_catalog"],not m["f"]))
    m=ms[0]
    for d in s["dances"]:
        dt=tok(d)
        if not dt: continue
        hit=byname.get(dt)
        if not hit:
            sc=sorted(((sim(dt,k),k) for k in byname),reverse=True)[:2]
            if sc and sc[0][0]>=0.8 and (len(sc)<2 or sc[0][0]-sc[1][0]>=0.1): hit=byname[sc[0][1]]
        if hit:
            mapped+=1
            for eid in hit:
                if (eid,m["id"]) not in existing: add.add((eid,m["id"]))
        else: unmapped[d]+=1
print("part 2 dance mentions mapped to exercises",mapped,"| not mapped",sum(unmapped.values()),"distinct",len(unmapped))
print("links to add",len(add))
json.dump({"drop":[[l["eid"],l["mid"]] for l in drop],"add":[list(a) for a in add]},open(SP+"/relink.json","w"))
exn={e["id"]:e["title_en"] for e in exs}; mn={m["id"]:m["name"] for m in mus}
import random; random.seed(2)
print("--- sample of links to DROP:")
for l in random.sample(drop,10): print("  ",l["title_en"][:42],"|",l["name"][:40],l["code"],"| part2:",[d[:25] for s in bycode[l["code"]] for d in s["dances"]][:3])
print("--- sample of links to ADD:")
for a in random.sample(sorted(add),10): print("  ",exn[a[0]][:42],"|",mn[a[1]][:45])
print("--- unmapped part 2 dances (top):",unmapped.most_common(8))
