/* The chat of floa.co.il: everything is static. No AI, no writing, nothing saved about the visitor.
   message >> three options >> a reply of its own for the option >> the next message >> three options >> ... five messages, then the last one offers the site, the group and the team.
   It looks like a live chat: a typing indicator, then the bubble; the three options appear at once under the message.
   The address has two parameters: ad (the code of the ad, always) and gender (female, male, or empty for the version for both).
   The business comes from the address (chatbot.floa.co.il/<business>?ad=<code>&gender=<female|male>); its look and links from businesses/<business>.json.
   Content: { greeting, defaultAd, ads: { <code>: { ad, female: [message x5], male: [message x5], both: [message x5] } } }, where a message is
   { say, options: [{ label, reply }] x3 } and the last one has { label, url, action? } options (url is the link; action is the older way and only the fallback).
   It is read from the database (the published version, through the chat function) and falls back to the file of the repo when the function does not answer.
   Edited in the editor at /admin/. The only measurement is the Facebook pixel. */
(function () {
  'use strict';
  const SB = window.SUPABASE;
  const q = new URLSearchParams(location.search);
  const ENDPOINT = SB.url + '/functions/v1/chatbot';
  const cid = (q.get('ad') || '').slice(0, 40);
  const gq = q.get('gender');
  const gp = gq === 'female' || gq === 'male' ? gq : 'both';
  const src = (q.get('s') || '').slice(0, 20);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const track = (name, data) => { try { if (window.fbq) fbq('trackCustom', name, data || {}); } catch (e) {} };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The memory of the taps: one small record per event (the ad, the version shown, the message, the option). Nothing identifies the visitor.
  let visit = ''; try { visit = sessionStorage.getItem('floa_chat_visit') || ''; if (!visit) { visit = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); sessionStorage.setItem('floa_chat_visit', visit); } } catch (e) {}
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function init(opts) {
    const root = opts.root, business = opts.business, cfg = opts.cfg, KEY = 'floa_chat_v1_' + business;
    root.innerHTML = '<div class="ch-log" id="chLog" role="log" aria-live="polite" aria-label="השיחה"></div>';
    const log = root.querySelector('#chLog');
    const scroll = () => { log.scrollTo({ top: log.scrollHeight, behavior: reduce ? 'auto' : 'smooth' }); };
    const bubble = (role, text) => { log.appendChild(el('div', 'ch-msg ' + (role === 'user' ? 'me' : 'bot'), text)); };
    const typing = () => { const t = el('div', 'ch-typing'); t.setAttribute('aria-label', 'הבוט כותב'); t.innerHTML = '<i></i><i></i><i></i>'; log.appendChild(t); scroll(); return t; };

    // the content: the published version from the database, the file of the repo as the fallback
    let data = null;
    const ctl = new AbortController(), t0 = setTimeout(() => ctl.abort(), 3500);
    try {
      const r = await fetch(ENDPOINT, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', apikey: SB.anonKey, Authorization: 'Bearer ' + SB.anonKey }, body: JSON.stringify({ business, mode: 'script' }) });
      const d = r.ok ? await r.json().catch(() => null) : null;
      if (d && d.content && d.content.ads) data = d.content;
    } catch (e) { /* the file below */ } finally { clearTimeout(t0); }
    if (!data) { try { const r = await fetch('businesses/' + business + '.script.json', { cache: 'no-cache' }); if (r.ok) { const d = await r.json(); if (d && d.ads) data = d; } } catch (e) { /* the fixed error below */ } }
    if (!data) { bubble('bot', cfg.errorText); return; }

    const ad = data.ads[cid] || data.ads[data.defaultAd] || Object.values(data.ads)[0];
    const g = ad[gp] ? gp : ad.both ? 'both' : ad.female ? 'female' : 'male';
    const steps = ad[g];

    const record = (kind, step, opt, label) => { try { fetch(ENDPOINT, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', apikey: SB.anonKey, Authorization: 'Bearer ' + SB.anonKey }, body: JSON.stringify({ business, mode: 'click', ad: cid || 'default', gender: g, kind, step, opt, label: label || '', visit }) }).catch(() => {}); } catch (e) {} };
    const SKEY = KEY + ':script2:' + (cid || 'default') + ':' + g;
    // the test page loads the chat with ?fresh=<time>: that always starts the conversation from the beginning
    if (q.get('fresh')) { try { sessionStorage.removeItem(SKEY); } catch (e) {} }
    let st = null;
    try { st = JSON.parse(sessionStorage.getItem(SKEY) || 'null'); } catch (e) {}
    if (!st || !Array.isArray(st.log)) st = { i: 0, log: [] };
    const save = () => { try { sessionStorage.setItem(SKEY, JSON.stringify(st)); } catch (e) {} };

    const delay = (text) => (reduce ? 0 : Math.min(1800, 500 + String(text).length * 16));
    let row = null;
    const clearRow = () => { if (row) { row.remove(); row = null; } };
    const siteUrl = () => { const u = new URL(cfg.siteUrl); if (src) u.searchParams.set('s', src); return u.href; };
    const withSrc = (s) => { try { const u = new URL(s); if (src) u.searchParams.set('s', src); return u.href; } catch (e) { return s; } };
    const waUrl = () => 'https://wa.me/' + cfg.whatsapp + '?text=' + encodeURIComponent(cfg.whatsappText);

    async function say(role, text, instant) {
      if (role === 'bot' && !instant) { const t = typing(); await wait(delay(text)); t.remove(); }
      bubble(role === 'user' ? 'user' : 'bot', text);
      scroll();
    }

    let reshow = false;   // options drawn again after a refresh are not a new showing
    function showOptions(i) {
      clearRow();
      const step = steps[i], last = i === steps.length - 1;
      row = el('div', 'ch-chips');
      step.options.forEach((o, k) => {
        if (last && (o.action || o.url)) {
          const own = /^https?:[/][/][^ ]+$/i.test((o.url || '').trim()) ? o.url.trim() : '';
          const href = own ? (o.action === 'site' ? withSrc(own) : own) : o.action === 'site' ? siteUrl() : o.action === 'updates' ? cfg.updatesLink : waUrl();
          const a = el('a', 'ch-chip', o.label); a.href = href; a.target = '_blank'; a.rel = 'noopener';
          a.addEventListener('click', () => { track('ChatCTA', { kind: o.action || 'link', ad: cid || 'default' }); record('cta', i + 1, k + 1, o.label); if (o.reply) { bubble('bot', o.reply); scroll(); } });
          row.appendChild(a);
        } else {
          const b = el('button', 'ch-chip', o.label); b.type = 'button';
          b.addEventListener('click', () => answer(i, k));
          row.appendChild(b);
        }
      });
      log.appendChild(row);
      scroll();
      if (!reshow) record('shown', i + 1, 0, '');
    }

    // a tap: the visitor's bubble, the reply of that option, then the next message with its options
    let busy = false;
    async function answer(i, k) {
      if (busy) return;
      busy = true;
      clearRow();
      const o = steps[i].options[k];
      st.log.push({ r: 'user', t: o.label }); save();
      track('ChatStep', { ad: cid || 'default', step: i + 1, option: k + 1 }); record('option', i + 1, k + 1, o.label);
      await say('user', o.label, true);
      if (o.reply) { st.log.push({ r: 'bot', t: o.reply }); save(); await say('bot', o.reply); }
      const next = steps[i + 1];
      if (!next) { busy = false; return; }
      st.i = i + 1; st.log.push({ r: 'bot', t: next.say }); save();
      await say('bot', next.say);
      showOptions(i + 1);
      busy = false;
    }

    // start: the greeting is a bubble of its own, not one of the five
    track('ChatOpen', { ad: cid });
    if (!st.log.length) record('open', 0, 0, '');
    if (st.log.length) {
      for (const m of st.log) bubble(m.r === 'user' ? 'user' : 'bot', m.t);
      reshow = true; showOptions(Math.min(st.i, steps.length - 1)); reshow = false;
    } else {
      const hello = data.greeting || 'היי';
      await say('bot', hello);
      st.log.push({ r: 'bot', t: hello }, { r: 'bot', t: steps[0].say }); save();
      await say('bot', steps[0].say);
      showOptions(0);
    }
    log.scrollTop = log.scrollHeight;
  }
  window.FloaChat = { init };
})();
