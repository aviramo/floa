/* ==========================================================================
   Measuring a page.

   One request to Google's Vision API, which reads a picture and returns every
   glyph it found WITH THE RECTANGLE IT OCCUPIES, in pixels. That last part is
   the entire reason this file exists. A model can read a chord sheet and tell
   a symbol from a word; what it cannot do is say that one Hebrew letter starts
   at x=1240 and the next at x=1231, and that is the fact the whole reader turns
   on. See geometry.js, which does the arithmetic on what comes back.

   DOCUMENT_TEXT_DETECTION rather than TEXT_DETECTION, because only the first
   one goes down to the symbol. Word boxes would work and letter boxes are the
   difference between assuming how a word is spaced inside itself and knowing.

   THE KEY IS A SECRET LIKE ANY OTHER and never reaches a browser:

       npx wrangler secret put GOOGLE_VISION_KEY

   and without it this route is simply not taken. That is the switch: set the
   secret and pages are measured, remove it and they go back to being read by
   the model alone. Nothing else changes on either side.
   ========================================================================== */

const ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

/* What it costs, in US cents, so that a read priced in fractions of a cent can
   still say so rather than saying nothing. Google bills text detection by the
   page, at about a dollar fifty per thousand, which is a fifth of a cent. THIS
   IS A COPY OF A PRICE LIST AND WILL GO STALE, and it is small enough that
   being a little wrong about it costs nobody anything. */
const CENTS_PER_PAGE = 0.15;

/* A photograph is a photograph. A PDF goes to Vision through a different and
   much heavier door, asynchronous and by way of cloud storage, which is not
   worth building for a file that is already text: those keep going to the
   model. */
export function canMeasure(files) {
  return files.length > 0 && files.every((file) => file.media_type !== "application/pdf");
}

/* Google gives a box as four corners, which is right for a page photographed
   at an angle and is more than anything here needs. Flattened to the upright
   rectangle that contains it, because every question asked of it afterwards is
   about horizontal middles and vertical middles. */
function boxOf(bounding) {
  const points = bounding?.vertices || bounding?.normalizedVertices || [];
  if (points.length < 2) return null;

  const xs = points.map((point) => Number(point.x || 0));
  const ys = points.map((point) => Number(point.y || 0));
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(...xs) - x;
  const h = Math.max(...ys) - y;
  if (!(w > 0) || !(h > 0)) return null;
  return { x, y, w, h };
}

/* Every symbol on the page, flat, in no particular order. Order is not thrown
   away by accident: geometry.js works it out from the boxes, and a list that
   claims an order is a list somebody will trust. */
export async function measure(env, files) {
  const requests = files.map((file) => ({
    image: { content: file.data },
    features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
    /* NO LANGUAGE HINT. It seemed obviously right to give one, since a Hebrew
       chord sheet is Hebrew words under Latin symbols and that is exactly the
       case a hint is for. It was wrong: hinting Hebrew on a songbook that also
       holds Portuguese and English songs made the engine find Hebrew where
       there was none, and a row of chords over "Mãe Divina" came back as a
       line of Hebrew letters. Left to itself it reads each page for what it
       is, and the Hebrew pages are no worse for it. */
  }));

  const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(env.GOOGLE_VISION_KEY)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    throw new Error(`vision ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const body = await response.json();
  const boxes = [];

  (body.responses || []).forEach((page, index) => {
    if (page.error) throw new Error(`vision: ${String(page.error.message).slice(0, 200)}`);

    /* Pages are stacked one under the next so that a two page song reads as one
       long sheet, which is what it is. The offset is generous on purpose: it
       has only to be more than any gap inside a page. */
    const offset = index * 100000;

    (page.fullTextAnnotation?.pages || []).forEach((sheet) => {
      (sheet.blocks || []).forEach((block) => {
        (block.paragraphs || []).forEach((paragraph) => {
          (paragraph.words || []).forEach((word) => {
            (word.symbols || []).forEach((symbol) => {
              const box = boxOf(symbol.boundingBox);
              const text = String(symbol.text ?? "");
              if (!box || !text.trim()) return;
              boxes.push({ text, x: box.x, y: box.y + offset, w: box.w, h: box.h });
            });
          });
        });
      });
    });
  });

  return { boxes, cost: files.length * CENTS_PER_PAGE };
}
