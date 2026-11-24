/* The scripted chat: everything is static. No AI, no writing, nothing saved about the visitor.
   message >> three options >> a reply of its own for the option >> the next message >> three options >> ... five messages, then the last one offers the site, the group and the team.
   It looks like the live chat: a typing indicator, then the bubble; the three options appear at once under the message.
   Content (the "format 2"): { greeting, defaultAd, ads: { <ad>: { ad, female: [message x5], male: [message x5] } } } where a message is
   { say, options: [{ label, reply }] x3 } and the last one is { say, final: true, options: [{ label, action: site|updates|whatsapp, reply? }] x3 }.
   It is read from the database (the published version, through the chat function) and falls back to the file of the repo when the function does not answer.
   Edited in the editor at /admin/. The only measurement is the Facebook pixel. */
(function () {
  'use strict';

  async function run(c) {
    const { log, el, cfg, business, cid, segment, src, track, reduce, KEY, scroll, bubble, typing, wait, setBusy, endpoint, anonKey } = c;
    const gp = segment.gender === 'female' ? 'female' : segment.gender === 'male' ? 'male' : 'both';

    // no writing: the bar is removed
    const bar = log.parentElement && log.parentElement.querySelector('.ch-bar');
    if (bar) bar.remove();

    // the content: the published version from the database, the file of the repo as the fallback
    let data = null;
    if (endpoint) {
      const ctl = new AbortController(), t0 = setTimeout(() => ctl.abort(), 3500);
      try {
        const r = await fetch(endpoint, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: 'Bearer ' + anonKey }, body: JSON.stringify({ business, mode: 'script' }) });
        const d = r.ok ? await r.json().catch(() => null) : null;
        if (d && d.content && d.content.ads) data = d.content;
      } catch (e) { /* the file below */ } finally { clearTimeout(t0); }
    }
    if (!data) { try { const r = await fetch('businesses/' + business + '.script.json', { cache: 'no-cache' }); if (r.ok) { const d = await r.json(); if (d && d.ads) data = d; } } catch (e) { /* the fixed error below */ } }
    if (!data) { bubble('bot', cfg.errorText); return; }

    // the name of the ad parameter is part of the content (default pain); no gender in the address means the version for both
    const pid = data.param ? (new URLSearchParams(location.search).get(data.param) || cid) : cid;
    const ad = data.ads[pid] || data.ads[data.defaultAd] || Object.values(data.ads)[0];
    const g = ad[gp] ? gp : ad.both ? 'both' : ad.female ? 'female' : 'male';
    const steps = ad[g];

    const SKEY = KEY + ':script2:' + (pid || 'default') + ':' + g;
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
    const waUrl = () => 'https://wa.me/' + cfg.whatsapp + '?text=' + encodeURIComponent(cfg.whatsappText);

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
          const a = el('a', 'ch-chip', o.label); a.href = href; a.target = '_blank'; a.rel = 'noopener';
          a.addEventListener('click', () => { track('ChatCTA', { kind: o.action, pain: cid || 'default' }); if (o.reply) { bubble('bot', o.reply); scroll(); } });
          row.appendChild(a);
        } else {
          const b = el('button', 'ch-chip', o.label); b.type = 'button';
          b.addEventListener('click', () => answer(i, k));
          row.appendChild(b);
        }
      });
      log.appendChild(row);
      scroll();
    }

    // a tap: the visitor's bubble, the reply of that option, then the next message with its options
    let busyNow = false;
    async function answer(i, k) {
      if (busyNow) return;
      busyNow = true;
      clearRow();
      const o = steps[i].options[k];
      st.log.push({ r: 'user', t: o.label }); save();
      track('ChatStep', { pain: cid || 'default', step: i + 1, option: k + 1 });
      await say('user', o.label, true);
      if (o.reply) { st.log.push({ r: 'bot', t: o.reply }); save(); await say('bot', o.reply); }
      const next = steps[i + 1];
      if (!next) { busyNow = false; return; }
      st.i = i + 1; st.log.push({ r: 'bot', t: next.say }); save();
      await say('bot', next.say);
      showOptions(i + 1);
      busyNow = false;
    }

    // start: the greeting is a bubble of its own, not one of the five
    track('ChatOpen', { ad: cid, source: 'script' });
    if (st.log.length) {
      for (const m of st.log) bubble(m.r === 'user' ? 'user' : 'bot', m.t);
      showOptions(Math.min(st.i, steps.length - 1));
      setBusy(false);
      return;
    }
    const hello = data.greeting || 'היי';
    await say('bot', hello);
    st.log.push({ r: 'bot', t: hello }, { r: 'bot', t: steps[0].say }); save();
    await say('bot', steps[0].say);
    showOptions(0);
    setBusy(false);
  }

  window.FloaScriptChat = { run };
})();
