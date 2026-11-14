/* מנגנון זמן אמת משותף (28.10.26): window.HRT
   מטרה: בשום מקום באתר לא רואים "ערך חדש, ישן, חדש" כשמשנים משהו. הסיבה לבעיה: שינוי שלי נשלח לשרת, ובמקביל טעינה מחדש (שהופעלה מהזמן אמת או מרענון)
   יכולה להחזיר נתונים שנלקחו לפני שהשינוי נקלט. המנגנון פותר את זה פעם אחת, לכל הדפים:
   1. HRT.optimistic(apply): רושם "שינוי ממתין". apply(data) משנה את תמונת המצב (snapshot) ומופעל גם מיד וגם על כל טעינה שנלקחה לפני שהשינוי נקלט.
   2. HRT.loader(fetch, render): טעינה בטוחה: טעינה אחת בכל פעם (עם טעינה אחרונה בתור), תוצאה ישנה לא דורסת חדשה, ושינויים ממתינים מוחלים על כל תוצאה
      שהתחילה לפניהם; טעינה שהתחילה אחרי שהשינוי נקלט מבטלת אותו (היא כבר כוללת אותו).
   3. HRT.busy(el) / HRT.wrap(el, promise): אפקט המתנה על האובייקט שקשור לפעולה, עד שהתשובה מגיעה.
   4. HRT.channel(topic, onSignal): חיבור זמן אמת (WebSocket ישיר, בלי SDK) לערוץ ציבורי, עם חיבור מחדש אוטומטי ורענון בחזרה ללשונית.
   אין תלות בשאר הקוד; כל דף מחבר את הנתונים שלו דרך ארבע הפונקציות האלה. */
(function () {
  if (window.HRT) return;
  const pending = [];   // שינויים ממתינים: { apply, doneAt, exp }
  const TTL = 15000;    // מקסימום זמן שינוי ממתין נשמר (למקרה שהזמן אמת לא חזר)

  /* ---------- אפקט המתנה ---------- */
  try {
    const st = document.createElement('style');
    st.textContent = '.rt-wait{pointer-events:none!important;animation:rtPulse 1s ease-in-out infinite}@keyframes rtPulse{0%,100%{opacity:.62}50%{opacity:.34}}@media (prefers-reduced-motion:reduce){.rt-wait{animation:none;opacity:.5}}';
    document.head.appendChild(st);
  } catch (e) {}
  function busy(el) {
    if (!el || !el.classList) return function () {};
    const n = (Number(el.__rtn) || 0) + 1; el.__rtn = n; el.classList.add('rt-wait'); el.setAttribute('aria-busy', 'true');
    let rel = false;
    return function () {
      if (rel) return; rel = true;
      el.__rtn = Math.max(0, (Number(el.__rtn) || 1) - 1);
      if (!el.__rtn) { el.classList.remove('rt-wait'); el.removeAttribute('aria-busy'); }
    };
  }
  function wrap(el, p) {
    const rel = busy(el);
    const pr = typeof p === 'function' ? p() : p;
    return Promise.resolve(pr).then(function (v) { rel(); return v; }, function (e) { rel(); throw e; });
  }

  /* ---------- שינויים אופטימיים ---------- */
  function optimistic(apply) {
    const h = { apply: apply, doneAt: null, exp: Date.now() + 60000 };
    pending.push(h);
    return {
      done: function () { h.doneAt = Date.now(); h.exp = Date.now() + TTL; },
      fail: function () { const i = pending.indexOf(h); if (i >= 0) pending.splice(i, 1); }
    };
  }
  /* מחיל את השינויים הממתינים על תמונת מצב שנטענה; startedAt = הרגע שבו הטעינה התחילה */
  function reconcile(data, startedAt) {
    const now = Date.now();
    for (let i = pending.length - 1; i >= 0; i--) {
      const h = pending[i];
      if (h.exp <= now) { pending.splice(i, 1); continue; }
      if (h.doneAt != null && startedAt >= h.doneAt) { pending.splice(i, 1); continue; }   // הטעינה התחילה אחרי שהשינוי נקלט: כבר כוללת אותו
      try { h.apply(data); } catch (e) {}
    }
    return data;
  }

  /* ---------- טעינה בטוחה ---------- */
  function loader(fetchFn, onData, opts) {
    opts = opts || {};
    let inflight = false, again = false, seq = 0, applied = 0, timer = 0, aborted = false;
    async function run() {
      if (inflight) { again = true; return; }
      inflight = true;
      do {
        again = false;
        const my = ++seq, t0 = Date.now();
        try {
          const data = await fetchFn();
          if (my >= applied) { applied = my; onData(reconcile(data, t0), my); }
        } catch (e) { if (opts.onError) opts.onError(e); }
      } while (again && !aborted);
      inflight = false;
    }
    return {
      reload: function (delay) { clearTimeout(timer); const d = delay == null ? 250 : delay; if (d <= 0) { run(); return; } timer = setTimeout(run, d); },
      now: run,
      stop: function () { aborted = true; clearTimeout(timer); }
    };
  }

  /* ---------- ערוץ זמן אמת ---------- */
  function channel(cfg, topic, onSignal, opts) {
    opts = opts || {};
    let ws = null, hb = 0, retry = 1500, closed = false, dead = false;
    function open() {
      if (closed) return;
      try { ws = new WebSocket(cfg.url.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(cfg.key) + '&vsn=1.0.0'); } catch (e) { return; }
      const full = 'realtime:' + topic;
      const send = function (o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
      ws.onopen = function () {
        retry = 1500;
        send({ topic: full, event: 'phx_join', ref: '1', payload: { config: { broadcast: { ack: false, self: false }, presence: { key: '' }, private: false }, access_token: cfg.token ? cfg.token() : cfg.key } });
        hb = setInterval(function () { send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(Date.now()) }); }, 25000);
      };
      ws.onmessage = function (e) {
        let m; try { m = JSON.parse(e.data); } catch (x) { return; }
        if (m.event === 'phx_reply' && m.topic === full && m.ref === '1') { if (m.payload && m.payload.status === 'ok' && dead) { dead = false; onSignal('rejoin'); } }
        else if (m.topic === full && m.event === 'broadcast') onSignal('signal');
      };
      ws.onclose = function () { clearInterval(hb); dead = true; if (!closed) { setTimeout(open, retry); retry = Math.min(retry * 2, 30000); } };
      ws.onerror = function () { try { ws.close(); } catch (x) {} };
    }
    open();
    /* חזרה ללשונית, חזרה מהמטמון ואתחול רשת: טוענים מחדש, וגיבוי כל דקה */
    const poke = function () { if (!document.hidden) onSignal('visible'); };
    document.addEventListener('visibilitychange', poke);
    window.addEventListener('pageshow', function (e) { if (e.persisted) onSignal('visible'); });
    window.addEventListener('focus', poke);
    window.addEventListener('online', poke);
    const bk = setInterval(function () { if (!document.hidden) onSignal('poll'); }, opts.poll || 60000);
    return { close: function () { closed = true; clearInterval(bk); try { ws && ws.close(); } catch (x) {} } };
  }

  window.HRT = { busy: busy, wrap: wrap, optimistic: optimistic, reconcile: reconcile, loader: loader, channel: channel };
})();
