/* ==========================================================================
   The list of cities an agent can be pointed at, with where they are.

     node cities-build.mjs path/to/IL.txt

   IL.txt is GeoNames' Israel file (https://download.geonames.org/export/dump/IL.zip,
   unzipped), an open dataset under CC BY 4.0 with a name, a population and a
   position for every place. Every place of 8,000 people or more is kept: a
   person is looking for work in a town, not in a village of two hundred.

   GeoNames files Hebrew names as loose aliases, with vowel marks and spelling
   variants, and does not say which is the usual one. So a place keeps ALL its
   plain aliases (so a job that says "יוקנעם עילית" still finds "יקנעם עילית"),
   and is shown under one: the spelling already in CURATED if it has one, else
   the shortest alias of three letters or more.

   The result, ../public/assets/cities.json, is committed, so neither the site
   nor the runner depends on GeoNames being reachable.
   ========================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CURATED = new Set(JSON.parse(readFileSync(process.argv[3] || "/tmp/preferred.json", "utf8")));
const OUT = join(import.meta.dirname, "..", "public", "assets", "cities.json");
const hebrew = (s) => /[\u05d0-\u05ea]/.test(s);
const plain = (s) => s.replace(/[\u0591-\u05c7]/g, "").replace(/[\u05be\-]/g, " ").replace(/\s+/g, " ").trim();

const places = readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean).map((l) => l.split("\t"))
  .filter((r) => r[6] === "P" && Number(r[14]) >= 8000)
  .map((r) => {
    const aliases = [...new Set(r[3].split(",").filter(hebrew).map(plain).filter((s) => s.length >= 3))];
    return { aliases, pop: Number(r[14]), lat: Number(r[4]), lon: Number(r[5]) };
  })
  .filter((p) => p.aliases.length);

const cities = places.map((p) => {
  const name = p.aliases.find((a) => CURATED.has(a)) || [...p.aliases].sort((a, b) => a.length - b.length)[0];
  return { name, aliases: p.aliases.filter((a) => a !== name), lat: p.lat, lon: p.lon, pop: p.pop };
}).sort((a, b) => b.pop - a.pop);

const names = new Set();
/* a district of a city is not a place to look for work in its own right */
const unique = cities.filter((c) => !/^(מערב|מזרח) ירושלים/.test(c.name) && !names.has(c.name) && names.add(c.name));
writeFileSync(OUT, JSON.stringify({ source: "geonames.org (CC BY 4.0)", cities: unique.map(({ pop, ...c }) => c) }));
console.log(`${unique.length} ערים -> ${OUT}`);
console.log(unique.slice(0, 40).map((c) => c.name).join(", "));
