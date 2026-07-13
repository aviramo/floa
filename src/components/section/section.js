import { cx, html } from "../../lib/html.js";

/* The band every section sits in: vertical rhythm + the centred container.
   A section never sets its own padding or width — it only fills this. */
export const section = ({ id, className, children }) => html`
  <section class="${cx("section", className)}" id="${id}">
    <div class="container">
      ${children}
    </div>
  </section>`;
