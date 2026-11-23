import { extractState, mergeState, diffEvents, ctaFor, initialState, stateFromClient, linkGender } from './state.ts';
import { journeyOf, PAIN_JOURNEY } from './journey.ts';
import { stableSystem, sessionFacts, stateBlock, openingTask, addressOf, addressBlock, turnReminder } from './prompt.ts';
import { harpatka } from './businesses/harpatka/index.ts';
import type { CampaignContext } from './types.ts';

const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
const ctx = (over: Partial<CampaignContext> = {}): CampaignContext => ({ campaign: { id: 'x', journey_type: 'pain', topic_id: null, segment_filters: {}, creative: {} }, journey: null, content_version_id: null, profile: null, insights: [], ...over });

Deno.test('the pain journey keeps the six milestones of the spec, in order', () => {
  eq(PAIN_JOURNEY.milestones.map((m) => m.id), ['connect', 'desire', 'motivation', 'bridge', 'curiosity', 'action'], 'ids');
});

Deno.test('extractState: reads the block, drops it from the text, survives a cut-off tag and bad JSON', () => {
  const r = extractState('שלום\n<state>{"milestone":"desire","action":"continue"}</state>');
  eq(r.state, { milestone: 'desire', action: 'continue' }, 'state');
  eq(r.text.trim(), 'שלום', 'text');
  eq(extractState('שלום <state>{"mile').text.trim(), 'שלום', 'cut off');
  eq(extractState('שלום <state>not json</state>').state, null, 'bad json');
});

Deno.test('mergeState: ignores unknown milestones and values, caps text, appends concerns without duplicates', () => {
  const s0 = initialState(PAIN_JOURNEY);
  const s1 = mergeState(s0, { milestone: 'nope', done: ['connect', 'nope'], readiness: 'hacked', action: 'rm -rf', learned: { pain: 'x'.repeat(900), concerns: ['מבוכה', 'מבוכה', 'לא יודע לרקוד'] } }, PAIN_JOURNEY);
  eq(s1.milestone, 'connect', 'milestone kept');
  eq(s1.done, ['connect'], 'done');
  eq(s1.readiness, 'checking', 'readiness kept');
  eq(s1.action, 'continue', 'action falls back');
  eq(s1.learned.pain!.length, 240, 'capped');
  eq(s1.learned.concerns, ['מבוכה', 'לא יודע לרקוד'], 'concerns');
});

Deno.test('stateFromClient: hostile input becomes a plain initial state', () => {
  eq(stateFromClient('x', PAIN_JOURNEY), initialState(PAIN_JOURNEY), 'string');
  eq(stateFromClient({ done: 'all', learned: 5 }, PAIN_JOURNEY), initialState(PAIN_JOURNEY), 'garbage');
});

Deno.test('diffEvents and ctaFor', () => {
  const a = initialState(PAIN_JOURNEY), b = mergeState(a, { done: ['connect'], readiness: 'concerned', action: 'guide', learned: { concerns: ['מגע'] } }, PAIN_JOURNEY);
  eq(diffEvents(a, b).map((e) => e.type), ['milestone_done', 'concern', 'readiness', 'action_guide'], 'events');
  eq(ctaFor('register', true), 'register', 'register');
  eq(ctaFor('register', false), 'updates', 'no meeting: updates');
  eq(ctaFor('guide', true), 'whatsapp', 'guide');
  eq(ctaFor('end', true), null, 'end');
  eq(ctaFor('safety', true), null, 'safety is no conversion step');
});

Deno.test('journeyOf: a broken row falls back to the default journey', () => {
  eq(journeyOf(null).milestones.length, 6, 'null');
  eq(journeyOf({ journey_type: 'pain', version: 9, definition: { milestones: [{ id: 'BAD ID' }] } }).version, 1, 'invalid milestones');
  const ok = journeyOf({ journey_type: 'inspiration', version: 2, definition: { milestones: [{ id: 'spark', title: 'ניצוץ', goal: 'g', doneWhen: 'd' }] } });
  eq([ok.type, ok.version, ok.milestones[0].id], ['inspiration', 2, 'spark'], 'valid row used');
});

Deno.test('the stable prompt: engine rules, journey, no staged flow of the old bot, no dash in text shown to people', () => {
  const t = stableSystem(harpatka, PAIN_JOURNEY);
  for (const needle of ['סדר קדימויות', 'connect', 'action', '<state>', 'ער"ן 1201']) if (!t.includes(needle)) throw new Error('missing ' + needle);
  if (/שלב [א-ו]\b/.test(t)) throw new Error('old stage reference left in prompt');
  if (/\{AGE\}/.test(t)) throw new Error('age placeholder not filled');
  if (/[—–]/.test(harpatka.persona('35–55').replace('35–55', ''))) throw new Error('long dash in persona');
});

Deno.test('session facts: research is labelled as hypothesis, absent research is never invented, facts block is present', () => {
  const none = sessionFacts(harpatka, ctx(), null, '');
  if (!none.includes('אין פרופיל מחקר')) throw new Error('should say there is no profile');
  const withProfile = sessionFacts(harpatka, ctx({ profile: { title: 'שינה ועייפות', summary: 'סיכום', evidence: 'B', profile: {} } }), null, 'משפט מודעה');
  for (const needle of ['השערות לבדיקה', 'רמת ראיות B', 'משפט מודעה', 'כרגע לא נקבע מפגש']) if (!withProfile.includes(needle)) throw new Error('missing ' + needle);
});

Deno.test('state block nudges a long conversation toward a clear step', () => {
  const s = initialState(PAIN_JOURNEY);
  if (stateBlock(s, PAIN_JOURNEY, 3).includes('אורך השיחה')) throw new Error('too early');
  if (!stateBlock(s, PAIN_JOURNEY, 7).includes('אורך השיחה')) throw new Error('should nudge');
});

Deno.test('opening task names the business bot and keeps the meeting out of the opening', () => {
  const t = openingTask(harpatka, 'כמה זמן עבר?');
  if (!t.includes(harpatka.botName) || !t.includes('אין להזכיר בפתיחה מפגש')) throw new Error(t);
});

import { campaignKey, distressIn, neutralize, parseSegment, stripGreeting, toSingular } from './guard.ts';
Deno.test('distress net catches plain phrasings and not ordinary talk', () => {
  for (const t of ['אני חושבת על למות', 'לפעמים אני חושבת שעדיף שלא אהיה פה', 'רוצה למות', 'אין טעם לחיות']) if (!distressIn(t)) throw new Error('missed: ' + t);
  for (const t of ['הייתי רוצה להרגיש חלק ממשהו', 'מתי המפגש הקרוב?', 'מת מצחוק', 'עייפה ולא ישנה']) if (distressIn(t)) throw new Error('false alarm: ' + t);
});
Deno.test('neutralize rewrites the bot speaking about itself with a gender, and leaves the rest', () => {
  eq(neutralize('אני מבינה שזה קשה. אני שומע אותך'), 'הבנתי שזה קשה. שמעתי אותך', 'understand and hear');
  eq(neutralize('זה כבד, ואני לוקח את זה ברצינות'), 'זה כבד, ולוקחים את זה ברצינות', 'take seriously');
  eq(neutralize('בסדר גמור, אני מכבדת את זה'), 'בסדר גמור, מכבדים את זה', 'respect');
  eq(neutralize('את אמרת שאת מבינה'), 'את אמרת שאת מבינה', 'visitor words untouched');
});

Deno.test('address follows the audience of the link: woman, man, or plural when the ad defined no gender', () => {
  eq([addressOf('female'), addressOf('male'), addressOf(null), addressOf(undefined)], ['female', 'male', 'plural', 'plural'], 'addressOf');
  if (!addressBlock('female').includes('נקבה יחידה') || !addressBlock('male').includes('זכר יחיד') || !addressBlock('plural').includes('רבים')) throw new Error('blocks');
  const f = sessionFacts(harpatka, ctx({ campaign: { id: 'x', journey_type: 'pain', topic_id: null, segment_filters: { gender: 'female' }, creative: {} } }), null, '', 'female');
  if (!f.includes('לשון נקבה יחידה')) throw new Error('session facts must carry the address block');
  for (const [a, needle] of [['female', 'אליה בלשון נקבה'], ['male', 'אליו בלשון זכר'], ['plural', 'לשון רבים בלבד']] as const) {
    const o = openingTask(harpatka, 'x', a);
    if (!o.includes(needle) || !o.includes('אין מגדר ואין רגש') || !o.includes('אין להזכיר בפתיחה מפגש')) throw new Error('opening ' + a);
  }
  if (!turnReminder('male').includes('זכר') || !turnReminder('plural').includes('<state>')) throw new Error('reminder');
});

Deno.test('gender is a saved parameter: from the link, kept, replaced only when the person reveals, never re-imposed by the link', () => {
  eq([linkGender({ gender: 'female' }), linkGender({ gender: 'x' }), linkGender({}), linkGender(null)], ['female', null, null, null], 'linkGender');
  const s0 = initialState(PAIN_JOURNEY, 'female');
  eq([s0.gender, s0.genderSource], ['female', 'link'], 'from the link');
  const same = mergeState(s0, { gender: 'female' }, PAIN_JOURNEY);
  eq([same.gender, same.genderSource], ['female', 'link'], 'the model repeating it changes nothing');
  const rev = mergeState(s0, { gender: 'male' }, PAIN_JOURNEY);
  eq([rev.gender, rev.genderSource], ['male', 'visitor'], 'the person revealed otherwise');
  eq(mergeState(s0, { gender: 'robot' }, PAIN_JOURNEY).gender, 'female', 'garbage ignored');
  // the echo from the browser: a revealed gender survives the next request, an echoed plain value cannot override the link
  const echoed = stateFromClient({ ...rev }, PAIN_JOURNEY, 'female');
  eq([echoed.gender, echoed.genderSource], ['male', 'visitor'], 'revealed gender kept across requests');
  const forged = stateFromClient({ gender: 'male', genderSource: 'link' }, PAIN_JOURNEY, 'female');
  eq([forged.gender, forged.genderSource], ['female', 'link'], 'an echo claiming the link cannot change it');
  eq(stateFromClient(null, PAIN_JOURNEY, null).gender, null, 'no gender: plural');
  eq(diffEvents(s0, rev).map((e) => e.type).includes('gender_set'), true, 'gender_set event');
  if (!stateBlock(rev, PAIN_JOURNEY, 0).includes('מגדר שמור: male')) throw new Error('model sees the saved gender');
});

Deno.test('opening with no ad sentence leans on the pain topic of the campaign', () => {
  const o = openingTask(harpatka, '', 'female', 'נשים בזוגיות: שינה ועייפות');
  if (!o.includes('שעסקה בנושא: נשים בזוגיות: שינה ועייפות')) throw new Error(o);
  if (openingTask(harpatka, 'משפט', 'female', 'נושא').includes('שעסקה בנושא')) throw new Error('the ad sentence wins');
});

Deno.test('plural address is rewritten into the singular of the link gender; the bot is never a he or a she', () => {
  eq(toSingular('ראיתם את המודעה, ואני שמח שאתם כאן. מה הביא אתכם? מה עלה לכם כשקראתם?', 'female'), 'ראית את המודעה, ואני שמח שאת כאן. מה הביא אותך? מה עלה לך כשקראת?', 'female singular');
  eq(toSingular('שאתם כאן, לחצתם עליה', 'male'), 'שאתה כאן, לחצת עליה', 'male singular');
  eq(toSingular('נפגשים בקבוצה, נשמע טוב', 'female'), 'נפגשים בקבוצה, נשמע טוב', 'unrelated words untouched');
  eq(neutralize('ואני שמח שאתם כאן'), 'ושמחים שאתם כאן', 'bot joy is plural');
  eq(neutralize('אני שמחה לשמוע'), 'שמחים לשמוע', 'bot joy fem');
});
Deno.test('a reply never opens with a second greeting', () => {
  eq(stripGreeting('היי, נשמע שאת פשוט מסתכלת'), 'נשמע שאת פשוט מסתכלת', 'plain');
  eq(stripGreeting('היי 🙂 זה לגיטימי'), 'זה לגיטימי', 'with emoji');
  eq(stripGreeting('הייתי רוצה לשמוע'), 'הייתי רוצה לשמוע', 'a word that only starts with the same letters');
});

Deno.test('a link names its campaign by two readable parameters', () => {
  eq(campaignKey('stress_overload', 'female'), 'stress-overload-women', 'women');
  eq(campaignKey('lost_joy', 'male'), 'lost-joy-men', 'men');
  eq(campaignKey('loneliness', ''), 'loneliness-all', 'no gender');
  eq(campaignKey('', 'female'), '', 'no pain means no campaign');
  eq(campaignKey('../../x y', 'male'), 'x-y-men', 'junk is flattened to a safe key');
});

Deno.test('the segment of a link is one separate parameter per dimension, safely parsed', () => {
  eq(parseSegment({ gender: 'Female' }), { gender: 'female' }, 'gender');
  eq(parseSegment({ gender: 'male', age: '40' }), { gender: 'male', age: '40' }, 'a second dimension');
  eq(parseSegment({ 'bad key!': 'x', gender: 'male; drop' }), {}, 'junk dropped');
  eq(parseSegment(null), {}, 'null');
  eq(parseSegment(['a']), {}, 'array');
  eq(Object.keys(parseSegment({ a: '1', b: '1', c: '1', d: '1', e: '1', f: '1' })).length, 5, 'capped');
});
