import { humanize, parse } from './parse.ts';
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)); };

Deno.test('humanize removes AI tells', () => {
  eq(humanize('**שלום** — מה “נשמע”… → טוב'), 'שלום — מה "נשמע". טוב', 'markdown, quotes, ellipsis, arrows');
  eq(humanize('- אחד\n- שניים'), 'אחד\nשניים', 'bullets');
  eq(humanize('היי \u{1F642} ✨ \u{1F680}'), 'היי \u{1F642}', 'emoji kept only smiley');
  eq(humanize('«ציטוט»'), '"ציטוט"', 'guillemets');
});

Deno.test('parse output has no dashes, bullets or markdown', () => {
  const r = parse('**מה** שלומכם — ספרו לי\n- נקודה\n<chips>• כן|לא|✨</chips>');
  if (/[—–*•✨]/.test(r.reply) || r.chips.some((c) => /[•✨]/.test(c))) throw new Error(JSON.stringify(r));
});
