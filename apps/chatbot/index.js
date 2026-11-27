import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* Chatbot, the static chat of floa.co.il: the page that talks to people for a business
   (chatbot.floa.co.il/<business>?ad=<code>&gender=<female|male>). A MANUAL business (see CLAUDE.md): the whole look is in
   public/, copied verbatim into dist/chatbot/. It has no form, so no lead can be sent in its name.
   The texts come from the database through the Edge Function in supabase/functions/chatbot/ (not part of the build); the editor is public/admin/. */
export const business = {
  key: "chatbot",
  out: "chatbot",
  root: false,

  lead: {
    to: "LEAD_TO",
    origins: ["https://floa.co.il", "https://www.floa.co.il", "https://chatbot.floa.co.il", "http://localhost"],
  },

  site,
  runtime,
  pages,
  siteMap,
  leadPages,
};
