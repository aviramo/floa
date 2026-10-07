/* ==========================================================================
   Reading a CV for the jobs app.

   A PDF or an image goes in, a short structured profile comes out. Like
   /transcribe it lives here because the Anthropic key must never reach a
   browser. Nothing is stored: the browser saves the answer on the agent's row.

   WHAT COUNTS MOST IS WHAT THE PERSON DID LAST. A CV is a history, and a job
   from twelve years ago says little about what to apply for today, so the
   reader is told to weigh the recent positions most, in the summary, in the
   order of the skills, and in which roles it recommends.
   ========================================================================== */
const CV_MODEL = "claude-sonnet-5";
export const CV_MEDIA = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

const PROFILE = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "What this person is professionally today, in Hebrew, 3 to 5 sentences. Built mostly from the most recent " +
        "positions: what they do now and did lately, and how far back that goes. Older work only in a clause.",
    },
    skills: {
      type: "array",
      description:
        "Up to 18 short skills, tools or domains (a word or two each), the ones used in the recent positions first. " +
        "Each as the CV writes it, no sentences.",
      items: { type: "string" },
    },
    languages: {
      type: "array",
      description: "Spoken languages only, the bare name in Hebrew, no level (for example: עברית, אנגלית).",
      items: { type: "string" },
    },
    city: { type: "string", description: "city of residence if the CV says, else empty" },
    roles: {
      type: "array",
      description: "Up to 10 roles from the catalog, best fit first",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "copied exactly from the catalog" },
          score: { type: "integer", description: "0-100: how well this CV fits the role" },
        },
        required: ["name", "score"],
      },
    },
  },
  required: ["summary", "skills", "languages", "city", "roles"],
};

export async function parseCv(env, { media_type, data, catalog }) {
  const block = media_type === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type, data } }
    : { type: "image", source: { type: "base64", media_type, data } };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CV_MODEL,
      max_tokens: 2500,
      tools: [{ name: "profile", description: "The profile read from the CV", input_schema: PROFILE }],
      tool_choice: { type: "tool", name: "profile" },
      messages: [{
        role: "user",
        content: [
          block,
          {
            type: "text",
            text:
              "Read this CV and fill the profile. Write in Hebrew. Give the most weight to the most recent " +
              "positions: they decide the summary, the order of the skills and which roles fit. For `roles`, rate how " +
              "well the CV fits the roles of this catalog and return up to 10 with a score of 40 or more, best first. " +
              "Each name is copied exactly:\n" + catalog.join("\n"),
          },
        ],
      }],
    }),
  });
  if (!response.ok) throw new Error(`anthropic ${response.status}: ${(await response.text()).slice(0, 300)}`);

  const out = await response.json();
  const used = (out.content || []).find((part) => part.type === "tool_use");
  if (!used) throw new Error("no profile in the answer");
  const profile = used.input;
  const clean = (list) => [...new Set((list || []).map((s) => String(s).trim()).filter(Boolean))];
  profile.skills = clean(profile.skills).slice(0, 18);
  profile.languages = clean(profile.languages).slice(0, 8);
  profile.roles = (profile.roles || [])
    .filter((role) => role && catalog.includes(role.name))
    .map((role) => ({ name: role.name, score: Math.max(0, Math.min(100, Math.round(role.score))) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  return profile;
}
