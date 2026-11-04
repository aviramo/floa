import { attrs, html } from "../../lib/html.js";

/* The hero's picture, when the picture is a short silent film: a loop that
   plays by itself, muted, and holds its first frame (the poster) until it does.

   It is the opening's art slot and nothing else: the copy, the ask and the note
   stay real text above it. The film carries no words that the page needs, so a
   visitor who never plays it (data saver, reduced motion) loses only the picture.

   hero-motion.client.js starts it, pauses it when it is off screen, and tells the
   hero when it is playing, so the copy can arrive with the film and not before it.

   { src, poster, width, height, label }  src and poster are asset paths. */
export const heroMotion = (ctx, { src, poster, width, height, label }) => html`
        <div class="hero-motion">
          <video class="hero-motion-video"${attrs({ width, height, poster: ctx.url(poster), "aria-label": label })} autoplay muted loop playsinline preload="auto" disablepictureinpicture>
            <source${attrs({ src: ctx.url(src), type: "video/mp4" })}>
          </video>
        </div>`;
