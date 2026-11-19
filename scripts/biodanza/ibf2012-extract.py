# Extract the IBF 2012 catalog (en + he) into typed line streams. Uncommitted helper.
import fitz, json, re, sys, os, warnings
warnings.filterwarnings('ignore')
SRC = r'C:\Users\ofira\Desktop\floa\apps\biodanza\catalog-source'
OUT = r'C:\Users\ofira\AppData\Local\Temp\claude\31757639e4a3fe8c\37442aa8-1ebb-48a1-afe8-2e8fc52f7e9a\scratchpad\ibf2012'
CODE = re.compile(r'^\d\d-\d\d$')

def page_items(page, lang):
    """Return list of dicts {y,x,kind,text,size,font} in reading order for the page body."""
    d = page.get_text('dict')
    lines = []
    for b in d['blocks']:
        for l in b.get('lines', []):
            sp = l['spans']
            text = ''.join(s['text'] for s in sp)
            if not text.strip():
                continue
            x0, y0, x1, y1 = l['bbox']
            if y0 > 785 or y0 < 8:
                continue  # footer
            lines.append(dict(x0=x0, x1=x1, y=y0, spans=[(s['font'], round(s['size'], 1), s['color'], s['text']) for s in sp]))
    return lines

if __name__ == '__main__':
    for lang, fn in (('en', 'ibf-2012-en.pdf'), ('he', 'ibf-2012-he.pdf')):
        doc = fitz.open(os.path.join(SRC, fn))
        pages = []
        for i, p in enumerate(doc):
            items = page_items(p, lang)
            # yellow heading rects (he)
            heads = []
            for dr in p.get_drawings():
                if dr.get('fill') == (1.0, 1.0, 0.0):
                    r = dr['rect']
                    heads.append([r.x0, r.y0, r.x1, r.y1])
            pages.append(dict(page=i + 1, lines=items, heads=heads))
        json.dump(pages, open(os.path.join(OUT, f'raw_{lang}.json'), 'w', encoding='utf-8'), ensure_ascii=False)
        print(lang, len(pages))
