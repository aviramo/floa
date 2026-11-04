import { attrs, html } from "../../lib/html.js";

/* The hero's picture, when the picture is a short silent film that says what the
   business is: it plays by itself, muted, in a loop, and holds its first frame
   (the poster, which is itself the definition) until it does.

   There are TWO films, because one shape does not serve both screens: a wide one
   (the desktop) and a tall one (the phone), each drawn for its own screen so the
   words inside it are big enough to read there. CSS shows one of them and
   hero-motion.client.js loads and plays only that one, so a phone never downloads
   the wide film. Neither has `autoplay` or a preload, for the same reason.

   It leads the opening, and the copy follows it (see `artFirst` in hero.js and
   hero-motion.css). A visitor who never plays it (data saver, reduced motion)
   still gets the poster, and loses only the motion.

   { wide, tall, label }  wide and tall are { src, poster, width, height } */
const film = (ctx, kind, { src, poster, width, height }, label) => html`
          <video class="hero-motion-video hero-motion-${kind}"${attrs({ width, height, poster: ctx.url(poster), "aria-label": label })} muted loop playsinline preload="none" disablepictureinpicture>
            <source${attrs({ src: ctx.url(src), type: "video/mp4" })}>
          </video>`;

export const heroMotion = (ctx, { wide, tall, label }) => html`
        <div class="hero-motion">${film(ctx, "wide", wide, label)}${film(ctx, "tall", tall, label)}
        </div>`;
