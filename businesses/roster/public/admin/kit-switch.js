/* kit-switch: which stylesheet set the admin page uses. Build default on; ?kit=1 or ?kit=0 overrides it and is remembered for the tab. */
(function () {
  var q = /[?&]kit=([01])\b/.exec(location.search), m = q ? q[1] : null, v = null;
  try { if (m) sessionStorage.setItem('rk.kit', m); v = sessionStorage.getItem('rk.kit'); } catch (e) {}
  var on = (m || v || '1') === '1', d = document.documentElement;
  d.setAttribute('data-kit', on ? '1' : '0');
  var L = document.querySelectorAll('link[data-kit]'), i;
  for (i = 0; i < L.length; i++) L[i].disabled = !on;
  L = document.querySelectorAll('link[data-legacy]');
  for (i = 0; i < L.length; i++) L[i].disabled = on;
})();
