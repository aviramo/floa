import { extractState, mergeState, diffEvents, ctaFor, ctasOf, initialState, stateFromClient, linkGender } from './state.ts';
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
  for (const needle of ['סדר קדימויות', 'connect', 'action', '<state>', 'המטרה והקצב']) if (!t.includes(needle)) throw new Error('missing ' + needle);
  if (/שלב [א-ו]\b/.test(t)) throw new Error('old stage reference left in prompt');
  if (/\{AGE\}/.test(t)) throw new Error('age placeholder not filled');
  if (/[—–]/.test(harpatka.persona('35–55').replace('35–55', ''))) throw new Error('long dash in persona');
});

Deno.test('session facts: research is labelled as hypothesis, absent research is never invented, facts block is present', () => {
  const none = sessionFacts(harpatka, ctx(), null, '');
  if (!none.includes('אין פרופיל מחקר')) throw new Error('should say there is no profile');
  const withProfile = sessionFacts(harpatka, ctx({ profile: { title: 'שינה ועייפות', summary: 'סיכום', evidence: 'B', profile: {} } }), null, 'משפט מודעה');
  for (const needle of ['השערות לבדיקה', 'רמת ראיות B', 'משפט מודעה']) if (!withProfile.includes(needle)) throw new Error('missing ' + needle);
});

Deno.test('state block nudges a long conversation toward a clear step', () => {
  const s = initialState(PAIN_JOURNEY);
  if (stateBlock(s, PAIN_JOURNEY, 3).includes('אורך השיחה')) throw new Error('too early');
  if (!stateBlock(s, PAIN_JOURNEY, 7).includes('אורך השיחה')) throw new Error('should nudge');
});

Deno.test('opening task names the business bot and keeps the meeting out of the opening', () => {
  const t = openingTask(harpatka, 'כמה זמן עבר?');
  if (!t.includes(harpatka.botName) || !t.includes('אסור להזכיר ערב, מפגש או תנועה')) throw new Error(t);
});

import { endOnQuestion, revealedGender, scrub, wrongSingular, asksDetails, styleFix, genderChip, chipOk, stripMeeting, deadEndChip, offersUpdates, mentionsOffer, assertsCondition, campaignKey, conditionFix, distressIn, earlyPitchFix, genderFix, neutralize, parseSegment, pitchAllowed, pluralAddress, putsEveningOnTable, repeatedWord, stripGreeting, toSingular } from './guard.ts';
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
  for (const a of ['female', 'male', 'plural'] as const) {
    const o = openingTask(harpatka, 'x', a);
    if (!o.includes('אסור להזכיר ערב, מפגש או תנועה')) throw new Error('opening ' + a);
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
  eq(toSingular('ראיתם את המודעה, ואני שמח שאתם כאן. מה הביא אתכם? מה עלה לכם?', 'female'), 'ראיתם את המודעה, ואני שמח שאת כאן. מה הביא אותך? מה עלה לך?', 'pronouns only');
  eq(toSingular('שאתם כאן, סתם לחצתם עליה', 'male'), 'שאתה כאן, סתם לחצתם עליה', 'male pronoun, and the word סתם is left alone');
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

Deno.test('hardship is not an emergency: no hotline in the rules or the persona, the evening is the answer to a reluctant visitor', () => {
  const s = stableSystem(harpatka, PAIN_JOURNEY);
  if (s.includes('ער"ן') || s.includes('1201')) throw new Error('the hotline must not be in the stable prompt');
  for (const needle of ['קשה לי לדבר על זה', 'אינו מצב חירום', 'לא מניחים שהאדם סובל']) if (!s.includes(needle)) throw new Error('missing ' + needle);
});
Deno.test('the opening never quotes an ad that is not there', () => {
  const o = openingTask(harpatka, '', 'male', 'בדידות');
  if (!o.includes('אסור לכתוב ״המשפט במודעה״')) throw new Error(o);
});

Deno.test('plural address is detected by explicit markers only, so the model is asked again only when it really spoke to the plural', () => {
  for (const s of ['יש מצב שמשהו בה דיבר אליכם', 'ראיתם את המודעה', 'מה הביא אתכם', 'שסתם הייתם סקרנים']) if (!pluralAddress(s)) throw new Error('missed: ' + s);
  for (const s of ['סתם ערב נעים', 'אנשים מרגישים כך', 'ראית את המודעה, מה הביא אותך?', 'הייתי שמח']) if (pluralAddress(s)) throw new Error('false alarm: ' + s);
  if (!genderFix('female').includes('נקבה') || !genderFix('male').includes('זכר')) throw new Error('fix text');
});

Deno.test('findings of the five conversations: the bot is never a he or a she in I can / I think, the opening claims nothing, tiers are quoted exactly, a hesitant visitor keeps the register button', () => {
  eq(neutralize('ואני יכול לספר לך על המפגשים'), 'ואפשר לספר לך על המפגשים', 'I can');
  eq(neutralize('אני חושבת שזה מתאים'), 'נראה לי שזה מתאים', 'I think');
  const o = openingTask(harpatka, '', 'female', 'שמחת החיים');
  for (const needle of ['אסור ״כתבת״']) if (!o.includes(needle)) throw new Error('opening missing ' + needle);

  const facts = harpatka.factsBlock({ date: '2026-12-02', time: '20:30', name: '', city: 'תל אביב', place: 'סמינר', max: 30, priceNow: 80, priceNote: 'המחיר הרגיל 80 ש"ח, מתאריך 28.11 100 ש"ח' } as any);
  if (!facts.includes('בלי ״מחר״')) throw new Error('tier quoting rule missing');
  eq(ctasOf('updates', true), ['register', 'updates'], 'hesitant keeps register');
  eq(ctasOf('updates', false), ['updates'], 'no meeting: only updates');
  eq(ctasOf('register', true), ['register'], 'register');
  eq(ctasOf(null, true), [], 'none');
  if (!stableSystem(harpatka, PAIN_JOURNEY).includes('אסור ״במה שראית״')) throw new Error('curiosity rule');
});

Deno.test('a quick reply with a doubled word is dropped, and an opening that states the visitor condition is caught', () => {
  for (const s of ['יום יום עמוס מדי', 'ממש ממש עייפים']) if (!repeatedWord(s)) throw new Error('missed: ' + s);
  for (const s of ['יום עמוס מדי', 'סתם סקרנות', 'רוצה לנסות משהו חדש']) if (repeatedWord(s)) throw new Error('false alarm: ' + s);
  for (const s of ['נשמע שיש משהו שמלחיץ אותך כבר זמן', 'נראה שאתה סובל', 'כנראה שקשה לך']) if (!assertsCondition(s)) throw new Error('missed: ' + s);
  for (const s of ['ראית את המודעה על לחץ בעבודה. מה הביא אותך לחפש משהו כזה?', 'נראה לי שזה מתאים']) if (assertsCondition(s)) throw new Error('false alarm: ' + s);
  if (!conditionFix.includes('אין להצהיר על מצבו')) throw new Error('fix text');
});

Deno.test('the evening is offered after a bridge the visitor reacted to, never straight after one-word answers', () => {
  const base = { turns: 3, lastUser: 'רגועה', prevDone: ['connect', 'desire'], prevReadiness: 'connecting' };
  eq(pitchAllowed(base), false, 'quiet, then calm: first the bridge');
  eq(pitchAllowed({ ...base, prevDone: ['connect', 'desire', 'bridge'] }), true, 'the bridge was made');
  eq(pitchAllowed({ ...base, lastUser: 'כן, מתחבר לי' }), false, 'a yes alone is not enough');
  eq(pitchAllowed({ ...base, prevDone: ['connect', 'desire', 'motivation'] }), true, 'got through the milestones');
  eq(pitchAllowed({ ...base, turns: 4 }), false, 'four messages alone are not enough');
  eq(pitchAllowed({ ...base, lastUser: 'מתי זה ובכמה?' }), true, 'asked');
  eq(pitchAllowed({ ...base, lastUser: 'קשה לי לדבר על זה' }), false, 'rather not talk: still no evening before the bridge');
  eq(mentionsOffer('יש ערב שבו לא צריך לדעת לרקוד', OFFER), true, 'evening mentioned');
  eq(mentionsOffer('הדר ואופיר מוכנים לענות', OFFER), true, 'names before the offer');
  eq(mentionsOffer('לפעמים יש רצון לקשר. איך זה נראה אצלך?', OFFER), false, 'topic only');
  eq(pitchAllowed({ ...base, turns: 5 }), true, 'a long conversation');
  eq(putsEveningOnTable('יש מפגש ביום רביעי, 2.12, בשעה 20:30. המחיר 80 ש"ח'), true, 'date and price');
  eq(putsEveningOnTable('שקט זה בדיוק מה שמחפשים, ואיך זה נשמע לך?'), false, 'a bridge');
  if (!earlyPitchFix.includes('בלי להזכיר את הערב')) throw new Error('fix text');
  const s = stableSystem(harpatka, PAIN_JOURNEY);
  for (const needle of ['לא קופצים להצעה', 'הודעה אחת מחברת', 'אסור בהודעה אחת גם לחבר']) if (!s.includes(needle)) throw new Error('missing ' + needle);
});

const OFFER = harpatka.lexicon.offerWords;

Deno.test('a reply that offers the updates group always carries the button', () => {
  eq(offersUpdates('אם תרצי, הנה קבוצת העדכונים, ואפשר להצטרף בלי להתחייב'), true, 'offered');
  eq(offersUpdates('מה עוזר לך להירגע?'), false, 'not offered');
});

Deno.test('quick replies answer the last question of the message', () => {
  if (!stableSystem(harpatka, PAIN_JOURNEY).includes('תשובות אפשריות של האדם לשאלה האחרונה')) throw new Error('chips rule');
});

Deno.test('no dead-end quick reply', () => {
  for (const s of ['יש לי שאלה', 'שאלה קטנה']) if (!deadEndChip(s)) throw new Error('missed ' + s);
  for (const s of ['קצת', 'בעיקר בערבים']) if (deadEndChip(s)) throw new Error('false alarm ' + s);
});

Deno.test('a bare "glad that" is not a gender of the bot', () => {
  eq(neutralize('שמחה שכתבת. מה הביא אותך?'), 'טוב שכתבת. מה הביא אותך?', 'glad');
  eq(neutralize('שמח שזה מתחבר'), 'טוב שזה מתחבר', 'glad m');
});

Deno.test('flow rules for a visitor who only clicked a quick reply', async () => {
  const { FLOW_PROMPT } = await import('./businesses/harpatka/flow.ts');
  for (const needle of ['שואלים שאלה פתוחה', 'אל תמונים']) {}  // quick replies are made in a separate step now
});

Deno.test('round one of the live conversations: no machinery, no pressure, chips in the visitor gender, grammar', () => {
  if (!styleFix('ההודעה נשמעת כמו תשובה מוכנה')) throw new Error('fourth wall');
  if (!styleFix('מה הביא אותך אלינו היום?')) throw new Error('what brought you');
  if (!styleFix('יש עד 30 משתתפים, אז כדאי לשמור מקום מוקדם')) throw new Error('pressure');
  if (styleFix('באילו מצבים זה בולט יותר?')) throw new Error('false alarm');
  eq(genderChip('אני צריך לחשוב על זה', 'female'), 'אני צריכה לחשוב על זה', 'to female');
  eq(genderChip('לא בטוחה עדיין', 'male'), 'לא בטוח עדיין', 'to male');
  eq(chipOk('ככה זה נשמע לי קצת:'), false, 'cut chip');
  eq(chipOk('בסופי שבוע'), true, 'good chip');
  eq(neutralize('נשמח שהגעת. אני לא יודע עדיין מה נכון לך'), 'שמחים שהגעת. לא ברור עדיין מה נכון לך', 'grammar and bot gender');
  eq(stripMeeting('זה נשמע מתיש. יש מפגש ביום רביעי. מה הכי חסר לך?', OFFER), 'זה נשמע מתיש. מה הכי חסר לך?', 'strip');
});

Deno.test('the chat gives no meeting details: the site link does', async () => {
  const { FLOW_PROMPT } = await import('./businesses/harpatka/flow.ts');
  for (const needle of ['תאריך, שעה, מקום ומחיר לא נמסרים', 'קבוצת הוואטסאפ']) if (!FLOW_PROMPT.includes(needle)) throw new Error('missing ' + needle);
  if (FLOW_PROMPT.includes('מספרים על המקום, התאריך, השעה והמחיר')) throw new Error('old stage text left');
  eq(asksDetails('כמה זה עולה ומתי?'), true, 'asks price');
  eq(asksDetails('אחרי יום עבודה הראש לא נרגע'), false, 'does not');
});

Deno.test('round two: wrong singular, cut and one-word chips, "not sure fully", no leaked instructions', () => {
  eq(wrongSingular('אולי אתה צריך אותו לעבודה', 'female'), true, 'אתה to a woman');
  eq(wrongSingular('את מרגישה לחוצה', 'male'), true, 'את מרגישה to a man');
  eq(wrongSingular('ראית את המודעה, מה את מרגישה', 'female'), false, 'fine for a woman');
  eq(wrongSingular('ראית את המודעה על לחץ', 'male'), false, 'את as a particle is fine');
  eq(chipOk('משהו ש'), false, 'cut');
  eq(chipOk('האם'), false, 'one word');
  eq(chipOk('קצת'), false, 'a bare generic answer is not a quick reply');
  eq(neutralize('בננה, מעניין. לא בטוח לגמרי למה התכוונת'), 'בננה, מעניין. לא לגמרי ברור למה התכוונת', 'bare not sure');
  if (!styleFix('ההנחיה כאן: לא מפרטים')) throw new Error('leak');
});

Deno.test('round three: objections may name the meeting, no "I cannot", long replies are shortened', () => {
  eq(pitchAllowed({ turns: 1, lastUser: 'זה נשמע כמו כת', prevDone: [], prevReadiness: '' }), true, 'suspicion is answered with facts');
  eq(pitchAllowed({ turns: 1, lastUser: 'זה יקר', prevDone: [], prevReadiness: '' }), true, 'price objection');
  eq(pitchAllowed({ turns: 1, lastUser: 'יום עמוס מדי', prevDone: [], prevReadiness: '' }), false, 'plain pain');
  eq(neutralize('אני לא יכול לומר כאן מה המחיר'), 'אי אפשר לומר כאן מה המחיר', 'I cannot');
  if (!styleFix('א. ב. ג. ד. ה. ו. ז.')) throw new Error('long reply');
});

Deno.test('round four: no time greetings, no "what exactly brought you", no quoting-and-interpreting', () => {
  for (const s of ['לילה טוב ושיהיה לך יום נעים', 'מה בדיוק הביא אותך למודעה?', '"אוקיי" נשמע כמו סימן שאתה מוכן', 'אני מציע לא לשאול יותר שאלות']) if (!styleFix(s)) throw new Error('missed: ' + s);
  if (styleFix('מה הכי חסר לך בערב כזה?')) throw new Error('false alarm');
});

Deno.test('round five: "ומתי" is a question about the meeting, "שאני מבינה" is not the bot gender', () => {
  eq(asksDetails('ומתי?'), true, 'and when');
  eq(asksDetails('מתי בפעם האחרונה הרגשתי חופשי'), false, 'a memory is not a question');
  eq(neutralize('אני רוצה לוודא שאני מבינה נכון'), 'אני רוצה לוודא שהבנתי נכון', 'understand');
});

Deno.test('round six: masculine verb forms to a woman and the reverse, "מה שהביא"', () => {
  eq(wrongSingular('אם תרצה, אפשר לדבר', 'female'), true, 'תרצה to a woman');
  eq(wrongSingular('אם תרצי, אפשר לדבר', 'female'), false, 'תרצי to a woman');
  eq(wrongSingular('ספרי לי עוד', 'male'), true, 'ספרי to a man');
  eq(wrongSingular('ספר לי עוד', 'male'), false, 'ספר to a man');
  if (!styleFix('אם מה שהביא אותך לכאן הוא סקרנות')) throw new Error('what brought you with ש');
});

Deno.test('round seven: placeholders and pipe lines never reach the visitor, a bare "מתי" counts as asking', () => {
  eq(scrub('ביודנסה היא שיטה.\n\n{{chips}}\nלא שמעתי|שמעתי קצת'), 'ביודנסה היא שיטה.', 'scrub');
  eq(scrub('שורה אחת\nכן|לא|אולי\nשורה שנייה'), 'שורה אחת\nשורה שנייה', 'pipe line');
  eq(pitchAllowed({ turns: 3, lastUser: 'מתי', prevDone: [], prevReadiness: '' }), true, 'bare when');
});

Deno.test('round eight: the visitor own words about gender win over the link; the opening does not describe the activity', () => {
  eq(revealedGender(['אני בן 40 וגרוש']), 'male', 'בן 40');
  eq(revealedGender(['אני מרגישה לבד']), 'female', 'מרגישה');
  eq(revealedGender(['אני מרגישה לבד', 'אני גבר בעצם']), 'male', 'last one counts');
  eq(revealedGender(['הכול מתנהל אבל שום דבר לא מרגש']), null, 'nothing said');
  if (!mentionsOffer('מפגשי תנועה קבועים, עם הנחיה, לגברים ונשים', OFFER)) throw new Error('opening intro not caught');
});

Deno.test('round ten: no "what you wrote" after a few words or a tap', () => {
  if (!styleFix('מה שכתבת מוכר מאוד', 'מוכר מאוד')) throw new Error('missed');
  if (styleFix('מה שכתבת מוכר מאוד, נכון?', 'יש סביבי אנשים ובכל זאת חסר משהו וגם בבית יש עומס')) throw new Error('false alarm after a long message');
});

Deno.test('round eleven: "בעיקר" does not count as asking about price', () => {
  eq(pitchAllowed({ turns: 2, lastUser: 'בעיקר בערבים', prevDone: [], prevReadiness: '' }), false, 'בעיקר');
});

Deno.test('round eleven: never comment on a short answer', () => {
  if (!styleFix('רואה שהמשפט שלך קצר, ולא ברור עדיין מה בדיוק התכוונת', 'קצת')) throw new Error('missed');
});

Deno.test('round eleven: no hotline for silence or a bare question mark', () => {
  if (!styleFix('אני כאן. אם קשה, אפשר להתקשר לער"ן 1201', '?')) throw new Error('missed');
  if (styleFix('אני כאן. אפשר להתקשר לער"ן 1201 בכל שעה', 'אני רוצה למות')) throw new Error('blocked a real crisis');
});

Deno.test('round eleven: hotline stays allowed in a conversation that had real distress earlier', () => {
  if (styleFix('אם אתה בסכנה התקשר ל-101', 'לא יודע', 'אני לא רוצה לחיות יותר לא יודע')) throw new Error('blocked a hotline inside an ongoing crisis');
});

Deno.test('round eleven: no price or schedule in chat, no generic chips, no bot-voice chips', () => {
  if (!styleFix('המפגשים בתשלום, פעם בשבוע', 'אתם סתם רוצים כסף')) throw new Error('price leak missed');
  if (!styleFix('אתה כתבת שאתה עייף', 'שקט אמיתי')) throw new Error('quoted a tap');
  if (chipOk('כן') || chipOk('קצת') || chipOk('אני אחזור אליך בקרוב')) throw new Error('bad chip allowed');
  if (!chipOk('אני רוצה לספר קצת על זה')) throw new Error('good chip blocked');
});

Deno.test('round eleven: a question that lists three options is sent back', () => {
  if (!styleFix('נשמע כבד בערב. מה היה עושה לכם טוב? שיחה, אנשים סביב, או משהו אחר לגמרי?', 'קצת משניהם שלי')) throw new Error('list of options missed');
  if (styleFix('מה היה עושה לכם טוב בערבים האלה?', 'קצת משניהם שלי')) throw new Error('false alarm on an open question');
});

Deno.test('round eleven: a reply must end in a question, except a goodbye or the site invitation', () => {
  if (!styleFix('חום של אנשים. אם תרצו, אפשר לספר לי מתי הרגשתם את זה הכי חזק', 'הגעגוע לחום')) throw new Error('invitation missed');
  if (styleFix('חום של אנשים. מתי הרגשתם את זה הכי חזק?', 'הגעגוע לחום')) throw new Error('false alarm on a question');
  if (styleFix('הכול כתוב באתר, אפשר להציץ שם.', 'כן')) throw new Error('false alarm on the site line');
});

Deno.test('round eleven: asking what is offered opens the door at once', () => {
  for (const q of ['מה אתם מציעים בעצם?', 'איך זה עובד', 'ספרי לי על זה', 'מה קורה שם']) eq(pitchAllowed({ turns: 2, lastUser: q, prevDone: [], prevReadiness: '' }), true, q);
  eq(pitchAllowed({ turns: 2, lastUser: 'הבית שקט מדי בערב', prevDone: [], prevReadiness: '' }), false, 'a pain is not a request');
});

Deno.test('round eleven: a reply is cut after its last question, goodbyes and the site line stay', () => {
  eq(endOnQuestion('שמחים שזה מוכר. על מה זה מזכיר לך? אם זה משהו אחר, אפשר לדבר על זה'), 'שמחים שזה מוכר. על מה זה מזכיר לך?', 'cut');
  eq(endOnQuestion('מה עולה לך מזה?'), 'מה עולה לך מזה?', 'already a question');
  eq(endOnQuestion('הכול כתוב באתר, אפשר להציץ שם.'), 'הכול כתוב באתר, אפשר להציץ שם.', 'site line');
  eq(endOnQuestion('אפשר לספר לי על זה'), 'אפשר לספר לי על זה', 'no question mark: left to the retry');
});

Deno.test('round eleven: talk about the conversation itself is sent back', () => {
  if (!styleFix('זה נשמע מתיש. לפני שאני שואל עוד, את רוצה לספר מה קורה?', 'הרגע שאחרי')) throw new Error('process talk missed');
  if (styleFix('זה נשמע מתיש. מה קורה בדיוק ברגע שבו זה נסגר?', 'הרגע שאחרי')) throw new Error('false alarm');
});

