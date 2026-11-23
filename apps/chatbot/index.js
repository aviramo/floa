import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* Chatbot, the conversation engine of floa.co.il and the page that talks to people for a business
   (chatbot.floa.co.il/<business>?pain=<ad>). A MANUAL business (see CLAUDE.md): the whole look is in
   public/, copied verbatim into dist/chatbot/. It has no form, so no lead can be sent in its name.
   The engine itself is the Edge Function in supabase/functions/chatbot/, not part of the build. */
export const business = {
  key: "chatbot",
  out: "chatbot",
  root: false,

  lead: {
    to: "LEAD_TO",
    origins: ["https://floa.co.il", "https://www.floa.co.il", "https://chatbot.floa.co.il", "http://localhost:5173"],
  },

  site,
  runtime,
  pages,
  siteMap,
  leadPages,
};
