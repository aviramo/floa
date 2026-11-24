// The shape of the static content, checked on every save: five messages, three options each; every ad has the version for both genders,
// or one for each gender. The last message's options are actions.
const KEY = /^[a-z][a-z0-9_]{0,29}$/;

export function scriptProblem(c: any): string | null {
  if (!c || typeof c !== 'object' || !c.ads || typeof c.ads !== 'object') return 'ads missing';
  if (JSON.stringify(c).length > 400000) return 'too large';
  for (const [key, ad] of Object.entries<any>(c.ads)) {
    if (!KEY.test(key)) return key + ': bad ad code';
    if (!ad || !(ad.both || (ad.female && ad.male))) return key + ': needs both genders or the version for both';
    for (const g of ['female', 'male', 'both']) {
      const steps = ad[g];
      if (steps === undefined) continue;
      if (!Array.isArray(steps) || steps.length !== 5) return key + ' ' + g + ': five messages are needed';
      for (let i = 0; i < 5; i++) {
        const m = steps[i];
        if (!m || typeof m.say !== 'string' || !m.say.trim()) return key + ' ' + g + ' message ' + (i + 1) + ': text missing';
        if (!Array.isArray(m.options) || m.options.length !== 3) return key + ' ' + g + ' message ' + (i + 1) + ': three options are needed';
        for (const o of m.options) {
          if (!o || typeof o.label !== 'string' || !o.label.trim()) return key + ' ' + g + ' message ' + (i + 1) + ': an option has no text';
          if (i === 4 && !['site', 'updates', 'whatsapp'].includes(o.action)) return key + ' ' + g + ' message 5: an option has no valid action';
        }
      }
    }
  }
  return null;
}

// A draft may be unfinished: only its outline is checked.
export function draftProblem(c: any): string | null {
  if (!c || typeof c !== 'object' || !c.ads || typeof c.ads !== 'object') return 'ads missing';
  if (JSON.stringify(c).length > 400000) return 'too large';
  return null;
}
