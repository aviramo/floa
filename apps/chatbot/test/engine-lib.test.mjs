import assert from "node:assert/strict";
import { buildSummary, campaignId, campaignLink, checkSegment, dollar, segmentKey, validateResearch, validCampaignId } from "../engine-lib.mjs";

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
  assert.equal(campaignLink("harpatka", "touch"), "https://chatbot.floa.co.il/harpatka?pain=touch");
  assert.ok(!validCampaignId("a b") && !validCampaignId("") && !validCampaignId("x".repeat(60)));
}

// dollar quoting cannot be escaped by the content
assert.equal(dollar("a $q$ b").startsWith("$q1$"), true);

console.log("chatbot engine-lib: ok");
