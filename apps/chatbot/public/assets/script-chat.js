/* The scripted chat: pre-written messages with three buttons each, five messages in the same order for every pain; the agent writes ONLY the first bubble of a turn.
   Every turn is two bubbles: (1) one short sentence that reflects what the visitor tapped or wrote, written by the agent (mode "react" of the chat function; it receives the ad text,
   the visitor's gender and the conversation so far, nothing else, and saves nothing), (2) the next pre-written message with its three buttons.
   If the agent is slow or breaks a rule, bubble 1 is the pre-written reaction of the button, so the conversation never waits for it for more than a few seconds.
   A free message answers the current question: the agent reflects on it, then the next pre-written message follows. A crisis in the words gets a fixed answer and a button to the team.
   Content: businesses/<business>.script.json = { common, defaultPain, pains: { <pain>: { ad, s1, s2, s3, help } } }. Texts carry {f:...|m:...} for a woman | a man.
   The look is the live chat's own: a typing indicator, then the bubble; the buttons appear at once under the message. The only measurement is the Facebook pixel. */
(function () {
  'use strict';
  const pick = (t, g) => String(t == null ? '' : t).replace(/\{f:([^|}]*)\|m:([^}]*)\}/g, (_, f, m) => (g === 'female' ? f : m));

  async function run(c) {
    const { log, el, cfg, business, cid, segment, src, track, reduce, KEY, scroll, bubble, typing, wait, setBusy, inp, grow, endpoint, anonKey, device } = c;
    const g = segment.gender === 'female' ? 'female' : 'male';
    let data = null;
    try { const r = await fetch('businesses/' + business + '.script.json', { cache: 'no-cache' }); if (r.ok) data = await r.json(); } catch (e) { /* the page shows the fixed error below */ }
    if (!data || !data.pains) { bubble('bot', cfg.errorText); return; }
    const pain = data.pains[cid] || data.pains[data.defaultPain] || Object.values(data.pains)[0];
    const T = (t) => pick(t, g);

    // the five messages: three of the pain, then the biodanza question (the pain's own sentence first), then the invitation
    const steps = [pain.s1, pain.s2, pain.s3,
      { say: T(pain.help) + '. ' + (pain.s4say ? T(pain.s4say) : data.common.s4.say), options: data.common.s4.options },
      { say: data.common.s5.say, options: data.common.s5.options, final: true }];

    const SKEY = KEY + ':script:' + (cid || 'default') + ':' + g;
    // the test page loads the chat with ?fresh=<time>: that always starts the conversation from the beginning
    if (new URLSearchParams(location.search).get('fresh')) { try { sessionStorage.removeItem(SKEY); } catch (e) {} }
    let st = null;
    try { st = JSON.parse(sessionStorage.getItem(SKEY) || 'null'); } catch (e) {}
    if (!st || !Array.isArray(st.log)) st = { i: 0, log: [] };
    const save = () => { try { sessionStorage.setItem(SKEY, JSON.stringify(st)); } catch (e) {} };

    const delay = (text) => (reduce ? 0 : Math.min(1800, 500 + String(text).length * 16));
    let row = null;
    const clearRow = () => { if (row) { row.remove(); row = null; } };
    const siteUrl = () => { const u = new URL(cfg.siteUrl); if (src) u.searchParams.set('s', src); return u.href; };
    const waUrl = (text) => 'https://wa.me/' + cfg.whatsapp + '?text=' + encodeURIComponent(text || cfg.whatsappText);

    async function say(role, text, instant) {
      if (role === 'bot' && !instant) { const t = typing(); await wait(delay(text)); t.remove(); }
      bubble(role === 'user' ? 'user' : 'bot', text);
      scroll();
    }

    // the agent's one sentence: the ad text, the gender and the conversation go along; a failure, a delay or a rule it broke returns null
    async function react(text, source, question, step) {
      if (!endpoint) return { reaction: null };
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 4500);
      try {
        const r = await fetch(endpoint, {
          method: 'POST', signal: ctl.signal,
          headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: 'Bearer ' + anonKey },
          body: JSON.stringify({ business, mode: 'react', pain: cid, segment, device, text, source, question, step, ad: pain.ad, history: st.log.slice(-10) }),
        });
        const d = await r.json().catch(() => ({}));
        return r.ok ? { reaction: d.reaction || null, safety: !!d.safety } : { reaction: null };
      } catch (e) { return { reaction: null }; } finally { clearTimeout(timer); }
    }

    function crisis() {
      clearRow();
      row = el('div', 'ch-chips');
      const a = el('a', 'ch-chip', data.common.crisis.label); a.href = waUrl(); a.target = '_blank'; a.rel = 'noopener';
      a.addEventListener('click', () => track('ChatCTA', { kind: 'whatsapp_crisis', pain: cid || 'default' }));
      row.appendChild(a); log.appendChild(row); scroll();
    }

    // after the final offers (the site, the group, the team) the writing box is closed: the conversation does not go on
    let closed = false;
    function closeBar() {
      closed = true;
      const bar = log.parentElement && log.parentElement.querySelector('.ch-bar');
      if (bar) bar.remove();
    }

    function showOptions(i) {
      clearRow();
      const step = steps[i];
      if (step.final) closeBar();
      row = el('div', 'ch-chips');
      step.options.forEach((o, k) => {
        if (step.final) {
          const href = o.action === 'site' ? siteUrl() : o.action === 'updates' ? cfg.updatesLink : waUrl();
          const a = el('a', 'ch-chip', T(o.label)); a.href = href; a.target = '_blank'; a.rel = 'noopener';
          a.addEventListener('click', () => track('ChatCTA', { kind: o.action, pain: cid || 'default' }));
          row.appendChild(a);
        } else {
          const b = el('button', 'ch-chip', T(o.label)); b.type = 'button';
          b.addEventListener('click', () => answer(i, T(o.label), 'button', T(o.ack)));
          row.appendChild(b);
        }
      });
      log.appendChild(row);
      scroll();
    }

    // a tap or a free message answers step i: bubble 1 is the agent's reflection (the button's own pre-written one if the agent fails), bubble 2 the next pre-written message
    let busyNow = false;
    async function answer(i, text, source, staticAck) {
      if (busyNow) return;
      busyNow = true;
      clearRow();
      const question = T(steps[i].say);
      st.log.push({ r: 'user', t: text }); save();
      track('ChatStep', { pain: cid || 'default', step: i + 1, source });
      await say('user', text, true);
      const t = typing();
      const [res] = await Promise.all([react(text, source, question, i), wait(reduce ? 0 : 900)]);
      t.remove();
      if (res.safety) { st.log.push({ r: 'bot', t: data.common.crisis.say }); save(); await say('bot', data.common.crisis.say, true); crisis(); busyNow = false; return; }
      const ack = res.reaction || staticAck || T(data.common.fallbackAck);
      st.log.push({ r: 'bot', t: ack }); save();
      await say('bot', ack, true);
      if (i + 1 >= steps.length) { showOptions(steps.length - 1); busyNow = false; return; }   // a message after the last one: only a reflection, the three actions stay
      const next = T(steps[i + 1].say);
      st.i = i + 1; st.log.push({ r: 'bot', t: next }); save();
      await say('bot', next);
      showOptions(i + 1);
      busyNow = false;
    }

    // a free message in the writing bar answers the current question
    c.onText = (text) => {
      text = String(text || '').trim().slice(0, 600);
      if (!text || busyNow || closed) return;
      inp.value = ''; grow();
      answer(Math.min(st.i, steps.length - 1), text, 'text', '');
    };

    // start: the greeting is a bubble of its own, not one of the five
    track('ChatOpen', { ad: cid, source: 'script' });
    if (st.log.length) {
      for (const m of st.log) bubble(m.r === 'user' ? 'user' : 'bot', m.t);
      showOptions(Math.min(st.i, steps.length - 1));
      setBusy(false);
      return;
    }
    const hello = 'היי, אני הבוט של "יוצאים להרפתקה" 🙂';
    await say('bot', hello);
    const first = T(steps[0].say);
    st.log.push({ r: 'bot', t: hello }, { r: 'bot', t: first }); save();
    await say('bot', first);
    showOptions(0);
    setBusy(false);
  }

  window.FloaScriptChat = { run };
})();
