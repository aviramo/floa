/* Sub-domains of floa.co.il. Every one of them is served by THIS Pages project
   (floa-site), and the old address (floa.co.il/chords/ and so on) keeps working
   because the files have not moved. All this does is send the ROOT of a
   sub-domain to the app that owns it. Everything else on the sub-domain (assets,
   /supabase.js, /auth.js, deep links) is served exactly as on the main domain.

   Keep in step with domains.json (a host added there needs a line here). */
const HOMES = {
  "chords.floa.co.il": "/chords/",
  "jobs.floa.co.il": "/jobs/",
  "roster.floa.co.il": "/roster/",
  "biofamily.floa.co.il": "/biofamily/",
  "tal.floa.co.il": "/tal/",
  "taltalia.floa.co.il": "/tal/ia/",
  "aum.floa.co.il": "/tal/aum/",
};

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  const home = HOMES[url.hostname];
  if (home && url.pathname === "/") {
    return Response.redirect(url.origin + home + url.search, 307);
  }
  return next();
}
