/* ==========================================================================
   Distance, so that "a city and a radius" means something.

   A job page says "תל אביב" or "מרכז" or nothing at all. A radius is only
   meaningful against coordinates, so this reads the list of cities the
   dashboard offers (public/assets/cities.json, made by cities-build.mjs from
   GeoNames) and finds which of them a piece of text names. The distance is the
   straight line between two of them: not a road, a way to say "near".
   ========================================================================== */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { cities } = JSON.parse(readFileSync(join(import.meta.dirname, "..", "public", "assets", "cities.json"), "utf8"));

const clean = (s) => String(s || "").replace(/[־\-–,.()]/g, " ").replace(/\s+/g, " ").trim();

/* Every name a city goes by, longest first, so "מודיעין עילית" is not taken for
   "מודיעין". */
const NAMES = cities
  .flatMap((c) => [c.name, ...c.aliases].map((name) => ({ name, city: c })))
  .sort((a, b) => b.name.length - a.name.length);

export function place(text) {
  const t = clean(text);
  if (!t) return null;
  const hit = NAMES.find((n) => t.includes(n.name));
  return hit ? { name: hit.city.name, at: [hit.city.lat, hit.city.lon] } : null;
}

export function km(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
