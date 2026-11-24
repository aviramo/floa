/* The scripted chat: no AI and no database at runtime. Pre-written messages and three buttons per message, five messages in the same order for every pain.
   It looks exactly like the live chat (a typing indicator, then the bubble; the buttons appear at once under the message).
   Content: businesses/<business>.script.json = { common, defaultPain, pains: { <pain>: { ad, s1, s2, s3, help } } }.
   Texts carry {f:...|m:...} for a woman | a man. Typing a free message opens WhatsApp to the team with that message (wa.me).
   Nothing is sent to the server: the only measurement is the Facebook pixel (ChatStep). */
(function () {
  'use strict';
  const pick = (t, g) => String(t == null ? '' : t).replace(/\{f:([^|}]*)\|m:([^}]*)\}/g, (_, f, m) => (g === 'female' ? f : m));

  async function run(c) {
    const { log, el, cfg, business, cid, segment, src, track, reduce, KEY, scroll, bubble, who, typing, wait, setBusy, inp, grow } = c;
    const g = segment.gender === 'female' ? 'female' : 'male';
    let data = null;
    try { const r = await fetch('businesses/' + business + '.script.json', { cache: 'no-cache' }); if (r.ok) data = await r.json(); } catch (e) { /* the page shows the fixed error below */ }
    if (!data || !data.pains) { who(); bubble('bot', cfg.errorText); return; }
    const pain = data.pains[cid] || data.pains[data.defaultPain] || Object.values(data.pains)[0];
    const T = (t) => pick(t, g);

    // the five messages: three of the pain, then the biodanza question (the pain's own sentence first), then the invitation
    const steps = [pain.s1, pain.s2, pain.s3,
      { say: T(pain.help) + '. ' + data.common.s4.say, options: data.common.s4.options },
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

    function showOptions(i) {
      clearRow();
      const step = steps[i];
      row = el('div', 'ch-chips');
      step.options.forEach((o, k) => {
        if (step.final) {
          const href = o.action === 'site' ? siteUrl() : o.action === 'updates' ? cfg.updatesLink : waUrl();
          const a = el('a', 'ch-chip', T(o.label)); a.href = href; a.target = '_blank'; a.rel = 'noopener';
          a.addEventListener('click', () => track('ChatCTA', { kind: o.action, pain: cid || 'default' }));
          row.appendChild(a);
        } else {
          const b = el('button', 'ch-chip', T(o.label)); b.type = 'button';
          b.addEventListener('click', () => choose(i, k));
          row.appendChild(b);
        }
      });
      log.appendChild(row);
      scroll();
    }

    let busyNow = false;
    async function choose(i, k) {
      if (busyNow) return;
      busyNow = true;
      clearRow();
      const o = steps[i].options[k];
      const label = T(o.label), ack = T(o.ack);
      st.log.push({ r: 'user', t: label }); st.i = i + 1; save();
      track('ChatStep', { pain: cid || 'default', step: i + 1, option: k + 1 });
      await say('user', label, true);
      await say('bot', ack);
      const next = steps[i + 1];
      const text = T(next.say);
      st.log.push({ r: 'bot', t: ack }, { r: 'bot', t: text }); save();
      await say('bot', text);
      showOptions(i + 1);
      busyNow = false;
    }

    // a free message opens WhatsApp to the team with it (called straight from the send gesture, so the browser allows the new tab)
    function onText(text) {
      text = String(text || '').trim().slice(0, 600);
      if (!text) return;
      window.open(waUrl(text), '_blank', 'noopener');
      inp.value = ''; grow();
      track('ChatCTA', { kind: 'whatsapp_text', pain: cid || 'default' });
      say('user', text, true).then(() => say('bot', 'פתחנו את הוואטסאפ של הדר ואופיר עם ההודעה שלך', true));
    }
    c.onText = onText;

    // start: the greeting is a bubble of its own, not one of the five
    track('ChatOpen', { ad: cid, source: 'script' });
    if (st.log.length) {
      who();
      for (const m of st.log) bubble(m.r === 'user' ? 'user' : 'bot', m.t);
      showOptions(Math.min(st.i, steps.length - 1));
      setBusy(false);
      return;
    }
    who();
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
