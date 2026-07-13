import { cx, html } from "../../lib/html.js";

/* One emphasised line in a tinted panel. Calm by design: no red, no warning
   mark, no motion beyond the shared reveal.

   `accent` says WHO is speaking, per the palette in tokens.css:
     clay (default) — the cost of waiting, right after the pains. It belongs to
                      them, so it wears their hue.
     teal           — FLOA speaking in its own voice, before the ask.

   { text, accent } */
export const urgency = ({ text, accent = "clay" }) => html`
  <aside class="${cx("urgency reveal", accent !== "clay" && `urgency-${accent}`)}" role="note">
    <div class="container">
      <p class="urgency-line">${text}</p>
    </div>
  </aside>`;
