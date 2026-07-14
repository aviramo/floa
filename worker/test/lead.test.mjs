/* Drives the real Worker in-process. Resend is stubbed, so nothing is sent and
   we can read exactly which inbox each lead was addressed to. */
globalThis.caches = { default: { match: async () => null, put: async () => {} } };

const { BUSINESSES } = await import("../src/businesses.js");
const worker = (await import("../src/index.js")).default;

/* a second business, added the way build.mjs would: its own inbox, its own page */
BUSINESSES.demo = {
  brand: "מספרת דנה",
  to: "LEAD_TO_DEMO",
  origins: ["https://floa.co.il"],
  pages: ["דף נחיתה"],
};

const env = {
  RESEND_API_KEY: "test",
  LEAD_FROM: "FLOA <no-reply@floa.co.il>",
  LEAD_TO: "ofir.aviram@gmail.com",
  LEAD_TO_DEMO: "dana@example.com",
};

let sent = null;
globalThis.fetch = async (url, init) => {
  sent = JSON.parse(init.body);
  return new Response("{}", { status: 200 });
};

const post = async (body, origin = "https://floa.co.il") => {
  sent = null;
  const res = await worker.fetch(new Request("https://x/lead", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  }), env);
  return { status: res.status, body: await res.json(), sent };
};

const lead = { name: "אופיר", phone: "0501234567" };
let failed = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${ok ? "" : `\n       ${detail}`}`);
  if (!ok) failed++;
};

/* 1. a FLOA lead reaches FLOA */
let r = await post({ ...lead, business: "floa", page: "דף הבית" });
check("FLOA lead -> FLOA's inbox", r.sent?.to[0] === env.LEAD_TO, JSON.stringify(r));
check("FLOA subject carries FLOA", r.sent?.subject.includes("מאתר FLOA"), r.sent?.subject);

/* 2. a client's lead reaches the CLIENT, never us */
r = await post({ ...lead, business: "demo", page: "דף נחיתה" });
check("client lead -> client's inbox", r.sent?.to[0] === env.LEAD_TO_DEMO, JSON.stringify(r));
check("client lead never reaches FLOA", !JSON.stringify(r.sent?.to).includes("ofir"), JSON.stringify(r.sent?.to));
check("client subject carries the client's brand", r.sent?.subject.includes("מאתר מספרת דנה"), r.sent?.subject);

/* 3. a business cannot send on another's page */
r = await post({ ...lead, business: "demo", page: "דף הבית" });
check("client cannot claim FLOA's page", r.status === 400 && r.body.error === "page", JSON.stringify(r));

/* 4. an unknown business is refused, not silently defaulted to ours */
r = await post({ ...lead, business: "nobody", page: "דף הבית" });
check("unknown business refused", r.status === 400 && r.body.error === "business", JSON.stringify(r));

/* 5. a lead from a page built before this change still works */
r = await post({ ...lead, page: "דף הבית" });
check("no business field -> FLOA (old page, new worker)", r.sent?.to[0] === env.LEAD_TO, JSON.stringify(r));

/* 6. the honeypot still swallows bots */
r = await post({ ...lead, business: "demo", page: "דף נחיתה", company: "bot" });
check("honeypot: nothing sent, bot told ok", r.status === 200 && r.sent === null, JSON.stringify(r));

/* 7. a missing recipient var fails loudly instead of misdelivering */
delete env.LEAD_TO_DEMO;
r = await post({ ...lead, business: "demo", page: "דף נחיתה" });
check("unset recipient -> 502, nothing sent", r.status === 502 && r.sent === null, JSON.stringify(r));

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
