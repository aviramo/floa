import assert from "node:assert/strict";
import { buildSummary, campaignId, campaignLink, checkSegment, dollar, readableId, segmentKey, validateResearch, validCampaignId } from "../engine-lib.mjs";

const dims = [
  { key: "gender", kind: "enum", allowed: ["female", "male"] },
  { key: "relationship_status", kind: "enum", allowed: ["partnered", "single"] },
  { key: "age", kind: "range", allowed: [] },
];
const good = {
  version: { label: "v1" },
  profiles: [
    { topic_id: "sleep_fatigue", segment: { gender: "female", relationship_status: "partnered" }, title: "שינה ועייפות", evidence: "B", profile: { description: "עייפות", hidden: ["מתביישת"] } },
    { topic_id: "sleep_fatigue", segment: { gender: "male", relationship_status: "partnered" }, title: "שינה ועייפות", evidence: "B", profile: { description: "עייפות" } },
  ],
};

// segment keys do not depend on key order
assert.equal(segmentKey({ a: 1, b: 2 }), segmentKey({ b: 2, a: 1 }));

// a good file passes and reports its coverage
{ const r = validateResearch(good, dims); assert.deepEqual(r.errors, []); assert.equal(r.coverage.length, 2); }

// the mistakes that would put a wrong profile in front of a visitor are all caught
{
  const bad = structuredClone(good);
  bad.profiles[1].segment = { gender: "female", relationship_status: "partnered" };   // duplicate
  bad.profiles.push({ topic_id: "Bad Id", segment: { gender: "x" }, title: "", evidence: "Z", profile: {} });
  const r = validateResearch(bad, dims);
  for (const needle of ["כפילות", "topic_id", "חסרה כותרת", "רמת ראיות", "לא ברשימה", "אין שדות תוכן"]) assert.ok(r.errors.join("\n").includes(needle), "should report " + needle);
}

// an unknown dimension and a range written wrongly
assert.ok(checkSegment({ planet: "mars" }, dims)[0].includes("לא מוכר"));
assert.equal(checkSegment({ age: { lte: 45 } }, dims).length, 0);
assert.equal(checkSegment({ age: 45 }, dims).length, 1);

// the summary keeps what the source has, in order, and never invents a missing field
{
  const s = buildSummary(good.profiles[0]);
  assert.ok(s.startsWith("תיאור הכאב: עייפות"));
  assert.ok(s.includes("ביטויים סמויים: מתביישת"));
  assert.ok(!s.includes("טריגרים"));
  assert.ok(buildSummary({ profile: { description: "א".repeat(5000) } }, 300).length <= 300);
}

// campaign ids: opaque, valid, different each time; the link carries the business and the id
{
  const a = campaignId(), b = campaignId();
  assert.ok(validCampaignId(a) && a !== b && a.length === 7);
  assert.equal(campaignLink("harpatka", "stress_overload", { gender: "female" }), "https://chatbot.floa.co.il/harpatka?pain=stress_overload&gender=female");
  assert.equal(campaignLink("harpatka", "lost_joy", { gender: "male", age: "40" }), "https://chatbot.floa.co.il/harpatka?pain=lost_joy&age=40&gender=male", "a new dimension is just one more parameter");
  assert.ok(!validCampaignId("a b") && !validCampaignId("") && !validCampaignId("x".repeat(60)));
}

// dollar quoting cannot be escaped by the content
assert.equal(dollar("a $q$ b").startsWith("$q1$"), true);

// readable ids: the pain and the audience, always a valid campaign id
assert.equal(readableId("stress_overload", "female"), "stress-overload-women");
assert.equal(readableId("lost_joy", "male"), "lost-joy-men");
assert.equal(readableId("loneliness", undefined), "loneliness-all");
for (const [t, g] of [["stress_overload", "female"], ["opening_up", "male"], ["low_confidence", "male"]]) assert.ok(validCampaignId(readableId(t, g)));

console.log("chatbot engine-lib: ok");
