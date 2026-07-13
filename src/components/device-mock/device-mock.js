import { html } from "../../lib/html.js";

/* A clean, abstract mockup: a browser window beside a phone, both showing the
   same generic landing page, no product or client faked. Drawn with the same
   plate/bar/dot primitives and the same palette as hero-art and hero-system, so
   it reads as part of the same illustration family. Static on purpose: this
   page uses entrance reveals only, no ambient motion.

   The bare <svg> is exported on its own too — scripts/gen_og.mjs renders this
   page's share card from the same markup, inside its own frame, not this one's
   .hero-art wrapper. { label } */
export const deviceMockSvg = ({ label }) => html`
          <svg class="hero-illust" viewBox="0 0 700 420" role="img" aria-label="${label}">
            <!-- the browser window: a generic landing page -->
            <rect class="plate lift-lg" x="16" y="26" width="470" height="330" rx="16"/>
            <circle class="dot" cx="44" cy="52" r="4"/>
            <circle class="dot" cx="60" cy="52" r="4"/>
            <circle class="dot" cx="76" cy="52" r="4"/>
            <rect class="plate-sunk" x="150" y="42" width="300" height="20" rx="10"/>

            <rect class="bar bar-teal" x="44" y="96" width="72" height="14" rx="7"/>
            <rect class="bar" x="360" y="98" width="42" height="10" rx="5"/>
            <rect class="bar" x="412" y="98" width="42" height="10" rx="5"/>

            <rect class="bar bar-teal" x="44" y="150" width="220" height="20" rx="10"/>
            <rect class="bar" x="44" y="180" width="260" height="12" rx="6"/>
            <rect class="bar" x="44" y="202" width="200" height="12" rx="6"/>

            <rect class="fill-teal" x="44" y="240" width="132" height="34" rx="17"/>
            <rect class="fill-white" x="62" y="253" width="70" height="8" rx="4"/>

            <rect class="bar-tint" x="308" y="150" width="150" height="164" rx="12"/>

            <!-- the phone: the same page, responsive -->
            <rect class="plate lift-lg" x="536" y="56" width="150" height="308" rx="28"/>
            <rect class="dot" x="592" y="72" width="38" height="6" rx="3"/>

            <rect class="bar bar-teal" x="554" y="102" width="54" height="10" rx="5"/>
            <rect class="bar bar-teal" x="554" y="128" width="112" height="16" rx="8"/>
            <rect class="bar" x="554" y="150" width="90" height="10" rx="5"/>
            <rect class="bar" x="554" y="166" width="70" height="10" rx="5"/>

            <rect class="bar-tint" x="554" y="188" width="114" height="82" rx="10"/>

            <rect class="fill-teal" x="554" y="284" width="114" height="30" rx="15"/>
            <rect class="fill-white" x="568" y="295" width="58" height="8" rx="4"/>
          </svg>`;

export const deviceMock = ({ label }) => html`
        <div class="hero-art reveal">
${deviceMockSvg({ label })}
        </div>`;
