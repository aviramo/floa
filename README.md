# FLOA — עמוד נחיתה

עמוד נחיתה יחיד, רספונסיבי ומהיר עבור המותג **FLOA** (floa.co.il).
בנוי HTML/CSS/JS סטטי בלבד — ללא תלות בבנייה (build) או פריימוורק.

## מבנה

```
index.html          # העמוד המלא (עמוד אחד, RTL, מובייל קודם)
css/styles.css       # עיצוב — טורקיז־ירקרק מוביל, רקע שמנת, ללא גרדיאנטים מוגזמים
js/main.js           # תפריט מובייל, אנימציות כניסה, טופס, קישורי WhatsApp
assets/              # תמונות WebP (מאוירות, מופשטות, ללא טקסט/אנשים)
  hero-flow.webp
  process-before-after.webp
  systems-devices.webp
scripts/gen_images.py  # הסקריפט שמייצר את קובצי ה-WebP (Pillow)
```

## הרצה מקומית

כל שרת סטטי, למשל:

```bash
npx serve .
# או
python3 -m http.server 8000
```

ופתיחת `http://localhost:8000`.

## נקודות שדורשות השלמה בהמשך

- **WhatsApp** — יש להגדיר את המספר בקובץ `js/main.js`, במשתנה `WHATSAPP_URL`.
  כל קישורי ה-WhatsApp בעמוד (הכפתור הצף, הטופס והפוטר) יתעדכנו אוטומטית.
  כל עוד ריק — הקישורים גוללים לטופס יצירת הקשר.
- **טופס יצירת קשר** — כרגע מציג אישור בצד הלקוח בלבד
  (`הפרטים התקבלו. אחזור אליכם בהקדם.`). יש לחבר לשירות טפסים / שרת ב-`wireForm()`.
- **תמונת אופיר** — כרגע Placeholder נקי. יש להחליף בתמונה אמיתית בסקשן "מי עומד מאחורי FLOA".
- **קישורי פוטר** — מדיניות פרטיות והצהרת נגישות מפנים כרגע ל-`#`.

## נגישות ו-SEO

- RTL מלא, `lang="he"`.
- כותרת `H1` אחת בלבד, היררכיית כותרות תקינה.
- `alt` לכל תמונה, ניווט מקלדת, `:focus-visible`, כיבוד `prefers-reduced-motion`.
- Meta title/description, Open Graph ו-JSON-LD (`ProfessionalService`).
- תמונות WebP עם `loading="lazy"` (למעט ה-Hero) ו-`width`/`height` למניעת קפיצות פריסה.
