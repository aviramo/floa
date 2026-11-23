import { ACTIONS, READINESS, type Action, type Gender, type JourneyDef, type Readiness, type SessionState } from './types.ts';

const cut = (v: unknown, n: number) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);

const asGender = (v: unknown): Gender => (v === 'female' || v === 'male' ? v : null);
// The gender the link implies: the audience of the campaign (segment.gender), or none
export const linkGender = (segment: Record<string, unknown> | null | undefined): Gender => asGender(segment?.gender);

export const initialState = (j: JourneyDef, gender: Gender = null): SessionState =>
  ({ milestone: j.milestones[0].id, done: [], readiness: 'checking', action: 'continue', learned: {}, gender, genderSource: gender ? 'link' : null });

// The model returns <state>{...}</state> on every reply. Parsed and checked here: the model's word steers the
// conversation, but a malformed or hostile value can never break a session or reach the database unbounded.
export function extractState(raw: string): { text: string; state: Record<string, unknown> | null } {
  let state: Record<string, unknown> | null = null;
  let text = String(raw ?? '').replace(/<state>([\s\S]*?)<\/state>/g, (_, body) => {
    if (!state) { try { const v = JSON.parse(String(body).trim()); if (v && typeof v === 'object' && !Array.isArray(v)) state = v; } catch (_) { /* ignored */ } }
    return '';
  });
  text = text.replace(/<state>[\s\S]*$/, '').replace(/<\/?state>/g, '');   // a reply cut off inside the tag
  return { text, state };
}

export function mergeState(prev: SessionState, incoming: Record<string, unknown> | null, j: JourneyDef): SessionState {
  if (!incoming) return prev;
  const ids = j.milestones.map((m) => m.id);
  const next: SessionState = { ...prev, done: [...prev.done], learned: { ...prev.learned } };
  if (typeof incoming.milestone === 'string' && ids.includes(incoming.milestone)) next.milestone = incoming.milestone;
  if (Array.isArray(incoming.done)) for (const d of incoming.done) if (typeof d === 'string' && ids.includes(d) && !next.done.includes(d)) next.done.push(d);
  if (READINESS.includes(incoming.readiness as Readiness)) next.readiness = incoming.readiness as Readiness;
  next.action = ACTIONS.includes(incoming.action as Action) ? incoming.action as Action : 'continue';
  // The person revealed a gender: it replaces the one from the link and stays. The model repeating the current value changes nothing.
  const g = asGender(incoming.gender);
  if (g && g !== next.gender) { next.gender = g; next.genderSource = 'visitor'; }
  const l = incoming.learned as Record<string, unknown> | undefined;
  if (l && typeof l === 'object') {
    const set = (k: 'pain' | 'desire' | 'changeTrigger' | 'coping', v: unknown) => { const s = cut(v, 240); if (s) next.learned[k] = s; };
    set('pain', l.pain); set('desire', l.desire); set('changeTrigger', l.changeTrigger ?? l.change_trigger); set('coping', l.coping);
    if (Array.isArray(l.concerns)) {
      const all = [...(next.learned.concerns ?? []), ...l.concerns.map((c) => cut(c, 120)).filter(Boolean)];
      next.learned.concerns = [...new Set(all)].slice(0, 6);
    }
  }
  return next;
}

// What changed, for the funnel events
export function diffEvents(prev: SessionState, next: SessionState) {
  const ev: { type: string; milestone: string | null; data: Record<string, unknown> }[] = [];
  for (const d of next.done) if (!prev.done.includes(d)) ev.push({ type: 'milestone_done', milestone: d, data: {} });
  if ((next.learned.concerns?.length ?? 0) > (prev.learned.concerns?.length ?? 0)) ev.push({ type: 'concern', milestone: next.milestone, data: { count: next.learned.concerns!.length } });
  if (next.gender !== prev.gender) ev.push({ type: 'gender_set', milestone: next.milestone, data: { gender: next.gender, source: next.genderSource } });
  if (next.readiness !== prev.readiness) ev.push({ type: 'readiness', milestone: next.milestone, data: { from: prev.readiness, to: next.readiness } });
  if (['register', 'updates', 'guide', 'end', 'safety'].includes(next.action)) ev.push({ type: 'action_' + next.action, milestone: next.milestone, data: {} });
  return ev;
}

// The visitor's state as echoed by the browser is only a hint: shape-checked against the journey, never trusted further
export function stateFromClient(v: unknown, j: JourneyDef, fromLink: Gender = null): SessionState {
  const base = initialState(j, fromLink);
  if (!v || typeof v !== 'object') return base;
  const c = v as Record<string, unknown>;
  const merged = mergeState({ ...base, gender: null, genderSource: null }, c, j);   // the echo's own gender is judged below, not by the link
  // What the person revealed is kept; anything else is the link's, so an echoed value can never override the campaign by itself
  const revealed = c.genderSource === 'visitor' ? asGender(c.gender) : null;
  merged.gender = revealed ?? fromLink;
  merged.genderSource = revealed ? 'visitor' : fromLink ? 'link' : null;
  return merged;
}

// action -> the button the page shows. Registration needs a real meeting to register to.
export function ctaFor(action: Action, hasFacts: boolean): 'register' | 'whatsapp' | 'updates' | null {
  if (action === 'register') return hasFacts ? 'register' : 'updates';
  if (action === 'updates') return 'updates';
  if (action === 'guide') return 'whatsapp';
  return null;
}

// The buttons the page shows. Someone who is not ready keeps the way to register next to the updates group.
export function ctasOf(cta: 'register' | 'whatsapp' | 'updates' | null, hasFacts: boolean): string[] {
  if (!cta) return [];
  return cta === 'updates' && hasFacts ? ['register', 'updates'] : [cta];
}
