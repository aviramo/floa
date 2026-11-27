// The kit showcase (/kit/, ui/demo/) for the kit's layout audit (ui/audit/layout.mjs): how to open its page, every window and every menu. Only openers here.
// Run: node build.mjs --only=floa (the showcase is built when not in CI), npm run dev, then
//   node ui/audit/layout.mjs ui/demo/openers.mjs 430     (and 1300)
// The data is the page's own fake data: nothing is read from or written to a database.
export const app = "kit";
export const path = "/kit/";
export const init = "try{localStorage.clear();sessionStorage.clear()}catch(e){}";
const w = (k) => async (ev, sleep) => { if (!(await ev(`__clk('[data-w="${k}"]')`))) return false; await sleep(900); return true; };
const wide = (ev) => ev("innerWidth >= 760");
export const screens = [
  ["the page", async () => true],
  ["short window: a message", w("msg")],
  ["short window: confirm", w("confirm")],
  ["short window: a field", w("field")],
  ["short window: a field, its error", async (ev, sleep) => { if (!(await w("field")(ev, sleep))) return false; await ev(`(function(){var i=document.querySelector("dialog[open] input"); i.value="x"; i.dispatchEvent(new Event("input",{bubbles:true})); i.form.requestSubmit(); return true;})()`); await sleep(1200); return true; }],
  ["popup, end side", w("popEnd")],
  ["popup, start side", w("popStart")],
  ["popup, loading", async (ev, sleep) => { if (!(await ev(`__clk('[data-w="popLoad"]')`))) return false; await sleep(300); return true; }],
  ["popup, loaded", async (ev, sleep) => { if (!(await ev(`__clk('[data-w="popLoad"]')`))) return false; await sleep(2200); return true; }],
  ["popup from a popup", async (ev, sleep) => { if (!(await w("popFrom")(ev, sleep))) return false; if (!(await ev(`__clk(".rrow__main", true)`))) return false; await sleep(900); return true; }],
  ["panel (computer)", async (ev, sleep) => { if (!(await wide(ev))) return false; return w("panel")(ev, sleep); }],
];
/* the allowlist of ui/audit/layout.mjs: what legitimately does not exist at a width (any other SKIP fails the run) */
export const absent = { "panel (computer)": (w) => w < 760, "menu: a header's more": (w) => w >= 1300 /* nothing folds at that width, so the header hides its more */ };
export const menus = [
  ["menu: the app menu", async (ev) => ev(`__appMenu()`)],
  ["menu: the index", async (ev) => ev(`__clk("[data-index]")`)],
  ["menu: actions, groups, destructive last", async (ev) => ev(`__clk('[data-m="plain"]')`)],
  ["menu: ticked items", async (ev) => ev(`__clk('[data-m="check"]')`)],
  ["menu: one of many", async (ev) => ev(`__clk('[data-m="radio"]')`)],
  ["menu: head and foot", async (ev) => ev(`__clk('[data-m="head"]')`)],
  ["menu: upward", async (ev) => ev(`__clk('[data-m="up"]')`)],
  ["menu: a header's more", async (ev) => ev(`__clk("[data-hmore]")`)],
  ["menu: a chip's values", async (ev) => ev(`__clk("[data-chipmenu]")`)],
  ["menu: a card's menu", async (ev) => ev(`__clk('[data-rkey="m"] [data-rlist-more]')`)],
  ["menu: a select's list", async (ev) => ev(`(function(){ var s=[].filter.call(document.querySelectorAll("[data-ff] select"),function(x){return x.getClientRects().length})[0]; if(!s) return false; s.scrollIntoView({block:"center"}); var f=s.closest(".rfield"); f.click(); s.dispatchEvent(new MouseEvent("mousedown",{bubbles:true})); return true; })()`)],
];
