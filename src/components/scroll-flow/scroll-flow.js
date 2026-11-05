import { html, raw } from "../../lib/html.js";
import { icon } from "../icon/icon.js";

/* A passage of the page that is told by scrolling.

   The section is tall and holds one screen still: the stage sticks while you scroll,
   and what is on it moves with how far you have gone. Scattered things drift (a
   business whose work is spread everywhere), they are drawn into one current (it is
   connected), and the current carries them on (it flows). Three sentences say the
   same, in turn, and two counters say it in numbers that are the stage's own: how
   many of the things on it are still falling between the chairs, and how many are
   flowing where they belong. Nothing here is a claim about the business.

   NO SCRIPT DRIVES IT. It is CSS scroll-driven animation (animation-timeline), which
   the browser runs itself, off the main thread, in step with the scroll: that is why
   it does not stutter when you scroll slowly and does not lose frames when you flick.
   A browser without it, or a visitor who asked for less motion, gets the ending,
   standing still, in a section of normal height. The counters are CSS counters on an
   animated number, so there is not a line of JavaScript in this component.

   The things are drawn twice: the second set waits off-screen to the right and slides
   in as the first slides out to the left, so the current never runs empty.

   { lines: [{ title, text }, x3], counters: { lost, flowing }, icons: [name x12], label } */

/* where each thing starts (scattered) and where it joins the current, in % of the stage.
   `m` is the same on a phone, where fewer things are shown, further apart. */
const PLACES = [
  { x0: 78, y0: 46, r: -9, d: 38, x1: 90, m: 86 },
  { x0: 52, y0: 58, r: 7, d: 62, x1: 82.5, m: 73 },
  { x0: 24, y0: 49, r: -5, d: 30, x1: 75, m: 60 },
  { x0: 88, y0: 74, r: 11, d: 54, x1: 67.5, m: 47 },
  { x0: 63, y0: 82, r: -12, d: 44, x1: 60, m: 34 },
  { x0: 36, y0: 71, r: 6, d: 70, x1: 52.5, m: 21 },
  { x0: 12, y0: 62, r: -7, d: 34, x1: 45, m: 8 },
  { x0: 44, y0: 47, r: 10, d: 58, x1: 37.5, m: 0, h: true },
  { x0: 70, y0: 66, r: -4, d: 48, x1: 30, m: 0, h: true },
  { x0: 18, y0: 83, r: 8, d: 66, x1: 22.5, m: 0, h: true },
  { x0: 92, y0: 55, r: -10, d: 40, x1: 15, m: 0, h: true },
  { x0: 6, y0: 44, r: 5, d: 52, x1: 7.5, m: 0, h: true },
];

const tile = (p, i, icons, clone) =>
  html`<li${raw(` class="${[p.h ? "fs-hide-sm" : "", clone ? "fs-clone" : ""].filter(Boolean).join(" ")}" style="--i:${i};--x0:${p.x0};--y0:${p.y0};--r0:${p.r}deg;--d:${p.d};--x1:${p.x1};--x1m:${p.m}"`)}>${icon(icons[i % icons.length])}</li>`;

export const scrollFlow = (ctx, { lines, counters, icons, label }) => html`
  <section class="flow-story" id="flow-story" aria-label="${label}">
    <div class="fs-stage">
      <svg class="fs-wind" viewBox="0 0 1200 800" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-100 150 C 150 60, 350 250, 600 150 S 1050 60, 1300 150"/>
        <path d="M-100 330 C 200 240, 400 430, 650 330 S 1000 250, 1300 340"/>
        <path d="M-100 690 C 180 610, 420 780, 700 690 S 1050 620, 1300 700"/>
      </svg>

      <div class="fs-lines">
        ${lines.map((l, i) => html`
        <div class="fs-line fs-l${i + 1}">
          ${i === 2 ? html`<h2>${l.title}</h2>` : html`<p class="fs-title">${l.title}</p>`}
          <p class="fs-text">${l.text}</p>
        </div>`)}
      </div>

      <svg class="fs-river" viewBox="0 0 1200 800" preserveAspectRatio="none" aria-hidden="true">
        <path class="fs-band" d="M-40 480 C 200 458, 360 504, 600 480 S 1000 456, 1240 480"/>
        <path class="fs-core" d="M-40 480 C 200 458, 360 504, 600 480 S 1000 456, 1240 480"/>
        <path class="fs-flow" d="M-40 480 C 200 458, 360 504, 600 480 S 1000 456, 1240 480"/>
      </svg>

      <ul class="fs-tiles" aria-hidden="true">
        ${PLACES.map((p, i) => tile(p, i, icons, false))}
        ${PLACES.map((p, i) => tile(p, i, icons, true))}
      </ul>

      <div class="fs-counters">
        <p><b class="fs-n-lost"></b><span>${counters.lost}</span></p>
        <p><b class="fs-n-flow"></b><span>${counters.flowing}</span></p>
      </div>
    </div>
  </section>`;
