/* ==========================================================================
   How well a job fits.

   A score from 0 to 100 and a sentence saying why, built from three things the
   person actually told us: the roles they ticked, the skills read from their
   CV, and where they are willing to work. It is deterministic on purpose, so
   the same job always scores the same and the reason can be checked by eye.

   If ANTHROPIC_API_KEY is in .env, the best candidates are then re-read by a
   model against the whole profile (`refine`), because a title match cannot tell
   "senior backend" from "backend intern". Without a key the runner still
   works, on the first pass alone.
   ========================================================================== */
import { env } from "./db.mjs";
import { km, place } from "./cities.mjs";

/* "מפתח/ת Full Stack" -> "מפתח full stack": the gendered suffix is not part of
   how a job is titled, and case does not matter for the Latin half. */
const plain = (s) => String(s || "").toLowerCase().replace(/\s*\/\s*(ת|ה|ית|ות|ים)(?![א-ת])/g, "").replace(/[()]/g, " ").replace(/\s+/g, " ").trim();

export function score(agent, job) {
  const title = plain(job.title);
  const body = plain(job.description);
  const parts = [];
  let total = 0;

  /* 1. The role: 50 for the whole role in the title, 35 for its head word,
     20 if it only turns up in the description. */
  let role = 0;
  let which = "";
  for (const r of agent.roles) {
    const whole = plain(r);
    const head = whole.split(" ")[0];
    /* "מפתח/ת Full Stack" is "Full Stack Developer" in an English ad: the Latin
       half of a role is a title in its own right. */
    const latin = whole.replace(/[^a-z0-9+#. ]/g, " ").replace(/\s+/g, " ").trim();
    const got = title.includes(whole) ? 50 : latin.length > 3 && title.includes(latin) ? 45 : head.length > 2 && title.includes(head) ? 35 : body.includes(whole) ? 20 : 0;
    if (got > role) { role = got; which = r; }
  }
  total += role;
  parts.push(role ? `תפקיד: ${which}` : "התפקיד לא מופיע במשרה");

  /* 2. Skills from the CV, up to 30: six distinct hits is a full house. */
  const kept = agent.skills?.length ? agent.skills : agent.profile?.skills || [];
  const skills = kept.map(plain).filter((s) => s.length > 1);
  const hits = skills.filter((s) => title.includes(s) || body.includes(s));
  total += Math.min(30, hits.length * 5);
  if (hits.length) parts.push(`כישורים: ${hits.slice(0, 4).join(", ")}`);

  /* 3. Distance, up to 20. Outside the radius the whole score is capped, since
     a perfect job two hours away is not a fit. Unknown is neither: half. */
  const want = place(agent.city);
  const there = place(job.location);
  if (want && there) {
    const d = Math.round(km(want.at, there.at));
    if (d <= agent.radius_km) {
      total += 20;
      parts.push(`${d} ק״מ`);
    } else {
      total = Math.min(total, 30);
      parts.push(`רחוק: ${d} ק״מ`);
    }
  } else {
    total += 10;
    parts.push("מיקום לא ברור");
  }

  return { score: Math.max(0, Math.min(100, Math.round(total))), reason: parts.join(" · ") };
}

/* A model's second opinion on the strongest candidates. Any failure keeps the
   first-pass score: this refines a number, it is never a reason to lose one. */
export async function refine(agent, jobs) {
  const key = env().ANTHROPIC_API_KEY;
  if (!key || !jobs.length) return;
  const list = jobs.map((j, i) => `#${i} ${j.title} | ${j.company} | ${j.location}\n${j.description.slice(0, 700)}`).join("\n\n");
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        tools: [{
          name: "scores",
          description: "A fit score for each job",
          input_schema: {
            type: "object",
            properties: {
              jobs: {
                type: "array",
                items: {
                  type: "object",
                  properties: { n: { type: "integer" }, score: { type: "integer" }, reason: { type: "string" } },
                  required: ["n", "score", "reason"],
                },
              },
            },
            required: ["jobs"],
          },
        }],
        tool_choice: { type: "tool", name: "scores" },
        messages: [{
          role: "user",
          content:
            `Score 0-100 how well each job fits this candidate. Reason in one short Hebrew sentence.\n\n` +
            `Candidate: ${JSON.stringify(agent.profile)}\nLooking for: ${agent.roles.join(", ")} near ${agent.city}\n\nJobs:\n${list}`,
        }],
      }),
    });
    if (!res.ok) return;
    const out = (await res.json()).content.find((p) => p.type === "tool_use");
    for (const row of out?.input?.jobs || []) {
      const job = jobs[row.n];
      if (job) { job.score = Math.max(0, Math.min(100, row.score)); job.reason = row.reason; }
    }
  } catch {
    /* keep the first pass */
  }
}
