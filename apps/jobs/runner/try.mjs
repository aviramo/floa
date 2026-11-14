/* A dry run with no database: scan and score for a made-up agent, and print.
     node try.mjs "מפתח/ת Full Stack" "תל אביב" 25                          */
import { open } from "./browser.mjs";
import { score } from "./score.mjs";
import { SITES } from "./sites.mjs";

const [role = "מפתח/ת Full Stack", city = "תל אביב", radius = "25"] = process.argv.slice(2);
const agent = { roles: [role], city, radius_km: Number(radius), profile: { skills: ["javascript", "react", "node", "sql", "python"] } };
const context = await open();
try {
  const page = context.pages()[0] || (await context.newPage());
  for (const site of Object.values(SITES)) {
    const jobs = await site.search(page, agent.roles, 12).catch((e) => { console.log(site.name, "נכשל:", e.message); return []; });
    for (const j of jobs) Object.assign(j, score(agent, j));
    jobs.sort((a, b) => b.score - a.score);
    console.log(`\n== ${site.name}: ${jobs.length}`);
    for (const j of jobs.slice(0, 6)) console.log(`${String(j.score).padStart(3)}  ${j.title} | ${j.company} | ${j.location} | ${j.reason}\n     ${j.url}`);
  }
} finally {
  await context.close();
}
