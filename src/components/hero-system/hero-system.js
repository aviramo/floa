import { attrs, html } from "../../lib/html.js";

/* The system, animated: each solution lights up in turn and sends its data down
   the wire into the FLOA hub. Drawn as SVG rather than shipped as a video — it
   stays crisp at any size and costs no download.

   The five nodes and five wires are the shape of the business, not content, so
   they live here in the component. { caption, feature } pin one node lit. */
export const heroSystem = ({ caption, feature } = {}) => html`
        <div class="hero-system" id="heroSystem"${attrs({ "data-feature": feature, "data-caption": caption })}>
          <p class="system-caption" id="systemCaption" aria-live="off">
            <span class="system-caption-text">${caption ?? ""}</span>
          </p>

          <svg class="system-svg" viewBox="0 0 820 470" role="img"
               aria-label="תרשים מערכת: אתר, אפליקציה, WhatsApp, תשלומים ונתונים מתחברים כולם למערכת אחת של FLOA">
            <defs>
              <linearGradient id="wire" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#7FC5E4"/>
                <stop offset="1" stop-color="#0E8C7E"/>
              </linearGradient>
              <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="150%">
                <feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="#0F2A33" flood-opacity=".10"/>
              </filter>
              <filter id="hubGlow" x="-60%" y="-60%" width="220%" height="220%">
                <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0E8C7E" flood-opacity=".38"/>
              </filter>
            </defs>

            <!-- wires: every solution runs into the hub -->
            <g class="wires" fill="none" stroke="url(#wire)" stroke-width="2" stroke-linecap="round">
              <path d="M284 150 C 320 176, 344 200, 370 224"/>
              <path d="M592 122 C 545 158, 500 192, 458 222"/>
              <path d="M644 286 C 590 274, 510 258, 460 250"/>
              <path d="M430 384 C 424 342, 420 306, 416 280"/>
              <path d="M236 352 C 288 322, 332 288, 366 262"/>
            </g>

            <!-- 01 — website / landing page -->
            <g class="node" data-node="0">
              <rect class="plate" x="96" y="52" width="188" height="118" rx="16" filter="url(#cardShadow)"/>
              <circle class="dot" cx="118" cy="74" r="4"/><circle class="dot" cx="132" cy="74" r="4"/><circle class="dot" cx="146" cy="74" r="4"/>
              <rect class="bar bar-teal" x="116" y="94" width="86" height="10" rx="5"/>
              <rect class="bar" x="116" y="114" width="148" height="8" rx="4"/>
              <rect class="bar" x="116" y="132" width="120" height="8" rx="4"/>
              <rect class="bar bar-blue" x="116" y="150" width="60" height="8" rx="4"/>
            </g>

            <!-- 02 — app -->
            <g class="node" data-node="1">
              <rect class="plate" x="592" y="36" width="86" height="150" rx="16" filter="url(#cardShadow)"/>
              <rect class="bar bar-teal" x="606" y="56" width="58" height="30" rx="8"/>
              <rect class="bar" x="606" y="96" width="58" height="8" rx="4"/>
              <rect class="bar" x="606" y="112" width="44" height="8" rx="4"/>
              <rect class="bar bar-blue" x="606" y="140" width="58" height="22" rx="8"/>
            </g>

            <!-- 03 — WhatsApp / leads -->
            <g class="node" data-node="2">
              <path class="plate" d="M660 250 h84 a16 16 0 0 1 16 16 v34 a16 16 0 0 1 -16 16 h-56 l-22 20 v-20 h-6 a16 16 0 0 1 -16 -16 v-34 a16 16 0 0 1 16 -16 z" filter="url(#cardShadow)"/>
              <rect class="bar" x="676" y="272" width="52" height="8" rx="4"/>
              <rect class="bar bar-teal" x="676" y="288" width="34" height="8" rx="4"/>
            </g>

            <!-- 04 — payments -->
            <g class="node" data-node="3">
              <rect class="plate" x="352" y="384" width="160" height="60" rx="12" filter="url(#cardShadow)"/>
              <rect class="bar bar-teal" x="368" y="398" width="128" height="12" rx="6"/>
              <rect class="bar" x="368" y="420" width="70" height="8" rx="4"/>
              <rect class="bar bar-blue" x="452" y="420" width="44" height="8" rx="4"/>
            </g>

            <!-- 05 — data / automations -->
            <g class="node" data-node="4">
              <rect class="plate" x="86" y="330" width="150" height="72" rx="14" filter="url(#cardShadow)"/>
              <circle class="dot dot-teal" cx="106" cy="350" r="5"/>
              <rect class="bar" x="120" y="346" width="98" height="8" rx="4"/>
              <circle class="dot dot-blue" cx="106" cy="372" r="5"/>
              <rect class="bar" x="120" y="368" width="76" height="8" rx="4"/>
              <circle class="dot" cx="106" cy="392" r="5"/>
              <rect class="bar" x="120" y="388" width="56" height="8" rx="4"/>
            </g>

            <!-- the hub: everything resolves here -->
            <g class="hub">
              <rect x="368" y="212" width="90" height="66" rx="20" fill="#0E8C7E" filter="url(#hubGlow)"/>
              <g stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none">
                <path d="M386 245 h16"/>
                <path d="M402 245 L 418 231"/>
                <path d="M402 245 L 418 259"/>
                <circle cx="422" cy="231" r="3.4" fill="#fff" stroke="none"/>
                <circle cx="422" cy="259" r="3.4" fill="#fff" stroke="none"/>
                <circle cx="402" cy="245" r="4.4" fill="#fff" stroke="none"/>
              </g>
            </g>

            <!-- the pulses: data travelling down each wire into the hub -->
            <g class="pulses">
              <circle class="pulse" r="4.5"/>
              <circle class="pulse" r="4.5"/>
              <circle class="pulse" r="4.5"/>
              <circle class="pulse" r="4.5"/>
              <circle class="pulse" r="4.5"/>
            </g>
          </svg>
        </div>`;
