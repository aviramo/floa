import { classifyReply, lastSentence, buildMessages, parse, parseOpening, quoteSafe } from './parse.ts';
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
Deno.test('parse basics', () => {
  const r = parse('היי, מה שלומכם.\n<chips>אחד|שניים|שלושה|ארבעה|חמישה</chips>\n<cta>register</cta>');
  eq(r, { reply: 'היי, מה שלומכם', chips: ['אחד', 'שניים', 'שלושה', 'ארבעה'], cta: 'register', offer: null }, 'basic');
});
Deno.test('parse offer marker and classifyReply', () => {
  const r = parse('רוצים לשמוע על מפגש?\n<offer>meeting</offer>');
  eq(r.offer, 'meeting', 'offer'); eq(r.reply, 'רוצים לשמוע על מפגש?', 'offer stripped');
  eq(parse('טקסט <offer>evil</offer>').offer, null, 'unknown offer');
  eq(classifyReply('כן, אשמח'), 'yes', 'yes'); eq(classifyReply('לא תודה'), 'no', 'no'); eq(classifyReply('אולי אחר כך'), 'no', 'later'); eq(classifyReply('לא שמעתי'), 'other', 'not no'); eq(lastSentence('אחד. שתיים? שלוש שאלה?'), 'שלוש שאלה?', 'last'); eq(classifyReply('מה זה אומר'), 'other', 'other');
});
Deno.test('parse unknown cta and truncation', () => {
  eq(parse('טקסט <cta>evil</cta>').cta, null, 'cta');
  eq(parse('טקסט\n<chips>א|ב').reply, 'טקסט', 'truncated');
  eq(parse('<cta>whatsapp</cta><cta>register</cta>x').cta, 'whatsapp', 'first cta');
});
Deno.test('parse dashes', () => {
  eq(parse('זה — לא בסדר - בכלל').reply, 'זה, לא בסדר, בכלל', 'dashes');
  eq(parse('גילאי 35–55').reply, 'גילאי 35–55', 'range kept');
  eq(parse('רגע...').reply, 'רגע', 'ellipsis removed');
});
Deno.test('buildMessages', () => {
  eq(buildMessages([]), null, 'empty');
  eq(buildMessages([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]), null, 'ends with assistant');
  const r = buildMessages([{ role: 'assistant', content: 'o1' }, { role: 'assistant', content: 'o2' }, { role: 'user', content: 'u1' }, { role: 'user', content: 'u2' }, { role: 'system', content: 'x' }])!;
  eq(r.merged, [{ role: 'user', content: 'u1\nu2' }], 'merged and starts with user');
  eq(buildMessages([{ role: 'user', content: 'x'.repeat(900) }])!.merged[0].content.length, 600, 'trunc');
});
Deno.test('quoteSafe', () => { eq(quoteSafe('a"b\nc'), 'a b c', 'quote'); });
import { dynamicPrompt, STATIC_PROMPT } from './businesses/harpatka/prompt.ts';
Deno.test('prompt', () => {
  const d = dynamicPrompt({ date: '2026-12-06', time: '20:00', name: '', city: 'הרצליה', place: '', max: 40, priceNow: 80, priceNote: 'המחיר הרגיל 80 ש"ח' }, 'שאלה', '35–55', 'פתיחה');
  if (!d.includes('יום ראשון, 6.12')) throw new Error(d);
  if (/[—–-]/.test(STATIC_PROMPT.replace(/\{AGE\}|\d+–\d+/g, '').replace(/<[^>]+>/g, '').replace(/[a-z-]+/g, ''))) throw new Error('dash in prompt');
});

Deno.test('gendered quick replies are dropped', () => {
  const r = parse('היי\n<chips>לא יודע איך|לא זוכרת|קשה להסביר|סתם סקרנות|אני צריך זמן</chips>');
  if (JSON.stringify(r.chips) !== JSON.stringify(['קשה להסביר', 'סתם סקרנות'])) throw new Error(JSON.stringify(r.chips));
});

Deno.test('parseOpening', () => {
  const r = parseOpening('<msg>היי 🙂 כאן הבוט.</msg>\n<msg>מתי בפעם האחרונה? - ממש</msg>\n<chips>סקרנות|קשה להסביר|לא יודע</chips>');
  eq(r.messages, ['היי 🙂 כאן הבוט', 'מתי בפעם האחרונה? ממש'], 'messages');
  eq(r.chips, ['סקרנות', 'קשה להסביר'], 'chips');
  eq(parseOpening('שלום\n\nמה שלומכם').messages, ['שלום', 'מה שלומכם'], 'fallback split');
});
