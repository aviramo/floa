/* =====================================================================
   Roster API documentation: the small amount of script this page has.
   Everything here is an extra. With no JavaScript the page is complete: the
   same base URL is written into the HTML, the table of contents is a list of
   plain links, and the code blocks are plain text.
   ===================================================================== */
(function () {
  "use strict";

  /* THE ONE CONSTANT. Every example on the page takes its base URL from here:
     each <span data-api-base> in the HTML (inside the code blocks too) is
     filled in with this value. The text already inside those spans is the same
     address, so the page reads correctly before, and without, this script.
     When the API moves, change this line and the text in the spans. */
  const API_BASE = "https://floa-lead.floa-il.workers.dev";

  document.documentElement.classList.add("js");
  document.querySelectorAll("[data-api-base]").forEach((el) => { el.textContent = API_BASE; });

  /* ---------- copy buttons on every code block ---------- */
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }
  document.querySelectorAll("figure.code").forEach((fig) => {
    const pre = fig.querySelector("pre");
    if (!pre) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy";
    btn.textContent = "העתקה";
    btn.setAttribute("aria-label", "העתקת הקוד");
    let timer = 0;
    btn.addEventListener("click", async () => {
      const ok = await copyText(pre.textContent.replace(/\n$/, ""));
      btn.textContent = ok ? "הועתק" : "לא הצלחנו";
      btn.classList.toggle("done", ok);
      clearTimeout(timer);
      timer = setTimeout(() => { btn.textContent = "העתקה"; btn.classList.remove("done"); }, 1800);
    });
    fig.appendChild(btn);
  });

  /* ---------- the table of contents ---------- */
  const toc = document.getElementById("toc");
  const wide = window.matchMedia("(min-width: 960px)");
  /* open and always visible on a wide screen (a sticky column); folded on a phone, so it does not push the text down */
  const syncToc = () => { toc.open = wide.matches; };
  syncToc();
  if (wide.addEventListener) wide.addEventListener("change", syncToc);

  const links = Array.from(toc.querySelectorAll("a[href^='#']"));
  const targets = links.map((a) => document.getElementById(a.getAttribute("href").slice(1))).filter(Boolean);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Clicking a link scrolls smoothly and leaves the address clean: no #fragment is written. */
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href^='#']");
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    const el = document.getElementById(decodeURIComponent(a.getAttribute("href").slice(1)));
    if (!el) return;
    e.preventDefault();
    if (!wide.matches && toc.contains(a)) toc.open = false;   /* fold first: it sits above the text, and folding after would shift the target */
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  });

  /* The link of the section being read is marked. */
  let ticking = false;
  function mark() {
    ticking = false;
    let current = targets[0];
    for (const t of targets) { if (t.getBoundingClientRect().top <= 120) current = t; else break; }
    links.forEach((a) => {
      const on = current && a.getAttribute("href") === "#" + current.id;
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
    /* a section stays "current" while one of its sub-sections is being read */
    toc.querySelectorAll("li").forEach((li) => li.classList.toggle("current", !!li.querySelector("a[aria-current='true']")));
  }
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(mark); } }, { passive: true });
  window.addEventListener("resize", mark);
  mark();
})();
