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

## טופס יצירת קשר — WhatsApp + Firestore

בשליחת הטופס קורים שני דברים:

1. **שמירה ב-Cloud Firestore** (אוסף `leads`) — ישירות מהדפדפן דרך `js/firebase.js`.
   השמירה לא חוסמת ולא זורקת: אם Firestore לא זמין, הטופס ממשיך לעבוד.
2. **פתיחת WhatsApp** אל מספר העסק עם פרטי הפנייה כהודעה מוכנה.

מספר ה-WhatsApp מוגדר ב-`js/main.js` (`WHATSAPP_NUMBER`), וכל קישורי ה-WhatsApp
בעמוד נבנים ממנו.

### Firestore Security Rule

הכלל שמוגדר ב-Firebase Console (Firestore → Rules) — יצירה בלבד, ללא קריאה:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /leads/{leadId} {
      allow read, update, delete: if false;
      allow create: if
        request.resource.data.name is string &&
        request.resource.data.name.size() > 0 &&
        request.resource.data.name.size() <= 100 &&
        request.resource.data.phone is string &&
        request.resource.data.phone.size() > 0 &&
        request.resource.data.phone.size() <= 40 &&
        request.resource.data.business is string &&
        request.resource.data.business.size() <= 120 &&
        request.resource.data.improve is string &&
        request.resource.data.improve.size() <= 2000 &&
        request.resource.data.source == "floa-landing";
    }
  }
}
```

הפניות נצפות ב-Firebase Console → Firestore → Data → אוסף `leads`.

## נקודות שדורשות השלמה בהמשך

- **קישורי פוטר** — מדיניות פרטיות והצהרת נגישות מפנים כרגע ל-`#`.
- **דומיין** — לחיבור `floa.co.il` יש להוסיף קובץ `CNAME` ולהגדיר DNS.

## נגישות ו-SEO

- RTL מלא, `lang="he"`.
- כותרת `H1` אחת בלבד, היררכיית כותרות תקינה.
- `alt` לכל תמונה, ניווט מקלדת, `:focus-visible`, כיבוד `prefers-reduced-motion`.
- Meta title/description, Open Graph ו-JSON-LD (`ProfessionalService`).
- תמונות WebP עם `loading="lazy"` (למעט ה-Hero) ו-`width`/`height` למניעת קפיצות פריסה.
