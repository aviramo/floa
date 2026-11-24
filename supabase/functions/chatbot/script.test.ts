const assertEquals = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
import { scriptProblem } from './script.ts';

const msg = (final = false) => ({ say: 'שלום', options: [0, 1, 2].map((k) => (final ? { label: 'א' + k, action: ['site', 'updates', 'whatsapp'][k] } : { label: 'א' + k, reply: 'ב' })) });
const five = () => [msg(), msg(), msg(), msg(), msg(true)];

Deno.test('a version for both genders is enough', () => {
  assertEquals(scriptProblem({ ads: { opening_up: { both: five() } } }), null);
});
Deno.test('or one for each gender', () => {
  assertEquals(scriptProblem({ ads: { a: { female: five(), male: five() } } }), null);
  assertEquals(scriptProblem({ ads: { a: { female: five() } } })?.includes('needs both'), true);
});
Deno.test('five messages, three options, an action on the last', () => {
  assertEquals(scriptProblem({ ads: { a: { both: five().slice(0, 4) } } })?.includes('five'), true);
  const bad = five(); bad[4].options[1] = { label: 'x' } as any;
  assertEquals(scriptProblem({ ads: { a: { both: bad } } })?.includes('action'), true);
});
Deno.test('the ad code is a plain name', () => {
  assertEquals(scriptProblem({ ads: { 'Bad Code': { both: five() } } })?.includes('bad ad code'), true);
});
