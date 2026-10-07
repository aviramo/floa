/* ==========================================================================
   Reading a CV for the jobs app.

   A PDF or an image goes in, a short structured profile comes out. Like
   /transcribe it lives here because the Anthropic key must never reach a
   browser. Nothing is stored: the browser saves the answer on the agent's row.
   ========================================================================== */
const CV_MODEL = "claude-sonnet-5";
export const CV_MEDIA = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

const PROFILE = {
  type: "object",
  properties: {
    name: { type: "string" },
    headline: { type: "string", description: "one line: who this person is professionally" },
    years_experience: { type: "number" },
    skills: { type: "array", items: { type: "string" } },
    languages: { type: "array", items: { type: "string" } },
    city: { type: "string", description: "city of residence if the CV says, else empty" },
    summary: { type: "string", description: "two or three sentences, Hebrew" },
    roles: { type: "array", items: { type: "string" }, description: "ONLY values copied exactly from the catalog" },
  },
  required: ["headline", "years_experience", "skills", "languages", "city", "summary", "roles"],
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
      max_tokens: 2000,
      tools: [{ name: "profile", description: "The profile read from the CV", input_schema: PROFILE }],
      tool_choice: { type: "tool", name: "profile" },
      messages: [{
        role: "user",
        content: [
          block,
          {
            type: "text",
            text:
              "Read this CV and fill the profile. Write in Hebrew. For `roles`, pick the 1 to 4 roles from this " +
              "catalog that best fit the person, copying each exactly:\n" + catalog.join("\n"),
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
  profile.roles = (profile.roles || []).filter((role) => catalog.includes(role));
  return profile;
}
