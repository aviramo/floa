import { html } from "../../lib/html.js";

/* A hairline with a word centred in it. { label } */
export const divider = ({ label }) => html`<div class="or-divider" aria-hidden="true">${label}</div>`;
