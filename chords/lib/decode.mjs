// Reading a chord chart out of a photo or a PDF.
//
// The model is asked for inline ChordPro ("[C]אַךְ טוֹב") rather than for
// numeric character offsets. Counting characters is exactly the kind of thing
// a language model gets almost right, and "almost right" here means a chord
// one letter off from the syllable it belongs to. A bracket sitting in front
// of a word cannot be off by one: whatever it precedes is where it lands.

export const MODEL = "claude-opus-5";

export const SONG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "artist", "key", "dir", "sections"],
  properties: {
    title: { type: "string", description: "שם השיר. מחרוזת ריקה אם אינו מופיע." },
    artist: { type: "string", description: "מבצע או מחבר. מחרוזת ריקה אם אינו מופיע." },
    key: { type: "string", description: 'סולם, למשל "Am". מחרוזת ריקה אם אינו מופיע.' },
    dir: { type: "string", enum: ["rtl", "ltr"], description: "כיוון הטקסט של השיר." },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "repeat", "lines"],
        properties: {
          label: { type: "string", description: "כותרת המקטע, או מחרוזת ריקה." },
          repeat: { type: "integer", minimum: 1, description: "מספר החזרות. 1 כברירת מחדל." },
          lines: {
            type: "array",
            items: { type: "string", description: "שורה בפורמט ChordPro עם [אקורדים] משובצים." },
          },
        },
      },
    },
  },
};

export const SYSTEM_PROMPT = `אתה מפענח דפי אקורדים ומחזיר אותם כנתונים מובנים.

הפורמט: כל שורה היא מחרוזת אחת ובה מילות השיר, ולפניהן משובצים אקורדים בסוגריים מרובעים.
האקורד נכתב **מיד לפני התו הראשון שמעליו הוא מופיע בתמונה**, בלי רווח מפריד ביניהם.

    [C]אַךְ טוֹב וָחֶסֶד [G]יִרְדְּפוּנִי [F]כָּל יְמֵי [G]חַיָּי

## מיקום האקורדים, וזה העיקר

הדבר החשוב ביותר במשימה הוא שכל אקורד ינחת על אותה מילה, ורצוי על אותה הברה, שמעליה הוא יושב בתמונה. לפני שאתה כותב שורה, עבור אקורד אחר אקורד והשווה את מיקומו האופקי בתמונה למילים שמתחתיו.

- **בשיר בעברית הקריאה היא מימין לשמאל.** האקורד הימני ביותר בתמונה הוא הראשון בשורה, והשמאלי ביותר הוא האחרון. אל תהפוך את הסדר.
- אקורד שיושב בין שתי מילים שייך למילה שמתחת למרכזו. אם הוא ממורכז מעל מילה, הוא שייך לתחילת אותה מילה.
- אקורד שיושב אחרי המילה האחרונה בשורה נכתב בסוף השורה, אחרי כל הטקסט.
- אין לוותר על אקורד ואין להמציא אקורד שאינו בתמונה.

## עוד כללים

- העתק את הטקסט **בדיוק**, כולל ניקוד, גרשיים וסימני פיסוק. אל תתקן, אל תשלים ואל תתרגם.
- שם אקורד נכתב באנגלית כפי שהוא בתמונה: C, Am, Em7, F#m, Gsus4, Bb, C/G.
- שורה שחוזרת בתמונה פעמיים עם אקורדים שונים היא שתי שורות נפרדות, לא אחת.
- ספרה שמופיעה בצד השורה, כמו 3 עם קו אנכי, היא בדרך כלל מספר החזרות על המקטע. רשום אותה ב-repeat, לא כטקסט.
- מקטע שאין לו כותרת בתמונה מקבל label ריק.
- סוגר מרובע שהוא חלק ממילות השיר עצמן נכתב \\[ .
- dir הוא "rtl" לעברית או ערבית, ו-"ltr" לאנגלית.`;

export const USER_PROMPT =
  "פענח את דף האקורדים הזה. החזר את מילות השיר ואת האקורדים במיקומם המדויק מעל הטקסט.";

// image/* becomes an image block, application/pdf a document block.
export function mediaBlock({ mediaType, data }) {
  if (mediaType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  }
  return { type: "image", source: { type: "base64", media_type: mediaType, data } };
}

export function buildRequest(media) {
  return {
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: [mediaBlock(media), { type: "text", text: USER_PROMPT }] },
    ],
    output_config: { format: { type: "json_schema", schema: SONG_SCHEMA } },
  };
}

export function extractSong(response) {
  if (response?.stop_reason === "refusal") {
    throw new Error("הבקשה נדחתה על ידי המודל. נסה קובץ אחר.");
  }
  const text = (response?.content ?? []).filter((b) => b?.type === "text").map((b) => b.text).join("");
  if (!text.trim()) throw new Error("המודל החזיר תשובה ריקה.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("תשובת המודל אינה JSON תקין.");
  }
}

export const ACCEPTED = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
