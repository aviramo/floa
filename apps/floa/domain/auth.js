/* ==========================================================================
   The domain's sign-in.

   ONE way to sign in for every app on floa.co.il: Google, through the domain's
   one Supabase project. It sits here, in apps/floa/domain/, and is copied
   to the ROOT of the domain beside /supabase.js, for the same reason: it belongs
   to the domain, not to the app that happens to read it first.

   An app that needs a signed-in person loads both, in this order, before its
   own script:

       <script src="/supabase.js"></script>
       <script src="/auth.js"></script>

   and then talks to the database through FLOA_AUTH.api, which carries the
   person's token and refreshes it when it is about to run out:

       FLOA_AUTH.api("/rest/v1/<table>?select=*")
       FLOA_AUTH.api("/rest/v1/<table>", { method: "POST", json: { … } })

   THE SESSION IS ONE KEY, "floa.session", and the origin is one origin, so a
   person who signed in to one app is signed in to the next. An app must not keep
   a session of its own.

   Back from Google the session arrives in the address as `#access_token=…`.
   It is taken the moment this file loads, before any app code can read the
   address, and the address is cleaned: no fragment is left in the bar.

   Google must be the provider enabled in Supabase, and the app's address must be
   in its Redirect URLs, or the sign-in button lands on a raw error page.
   ========================================================================== */
(function () {
  "use strict";

  var S = window.SUPABASE;
  var KEY = "floa.session";
  var session = null;
  var refreshing = null;

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); }
    catch (e) { return null; } // private window, or storage blocked
  }
  function keep(next) {
    session = next;
    try {
      if (next) localStorage.setItem(KEY, JSON.stringify(next));
      else localStorage.removeItem(KEY);
    } catch (e) { /* private window: the session lives for this page only */ }
  }
  session = read();

  /* ONE word to the page when the session ends or changes hands, so no app has to
     listen to `storage` or test `.signedOut` itself (ui/docs/app-session.md):
       window "floa:auth", detail.reason: "expired" (the server said no: a refresh
       that was refused, or a 401), "signout" (here or in another tab, detail.tab
       says which), "switch" (another tab signed in as somebody else). */
  function tell(reason, tab) {
    setTimeout(function () {
      try { window.dispatchEvent(new CustomEvent("floa:auth", { detail: { reason: reason, tab: tab || "this" } })); }
      catch (e) { /* a very old browser: nobody is told */ }
    }, 0);
  }
  function subOf(s) {
    try { return JSON.parse(atob(s.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub || ""; }
    catch (e) { return ""; }
  }
  /* the session ended because the server refused it: wiped here, and said once */
  function lost() {
    var had = !!(session && session.refresh_token);
    keep(null);
    if (had) tell("expired");
  }

  /* Another tab refreshed the token, or signed out: follow it, rather than
     spending a refresh token that has already been replaced. */
  window.addEventListener("storage", function (e) {
    if (e.key !== KEY) return;
    var was = session, now = read();
    session = now;
    var a = was && was.refresh_token ? subOf(was) : "", b = now && now.refresh_token ? subOf(now) : "";
    if (a && !b) tell("signout", "other");
    else if (a && b && a !== b) tell("switch", "other");
  });

  /* A session in the address is accepted ONLY when this tab asked for one.
     signIn() leaves a one-shot flag in sessionStorage just before it leaves for
     Google, and this takes it back. Without that, a link that carries somebody
     else's #access_token would silently sign the visitor in as that somebody,
     and whatever they then typed would be saved under the wrong account (login
     CSRF). If sessionStorage cannot be read at all there is nothing to check
     against, and the old behaviour is kept rather than breaking sign-in. */
  var ASKED = "floa.login";
  function asked() {
    try {
      var yes = sessionStorage.getItem(ASKED) === "1";
      sessionStorage.removeItem(ASKED);
      return yes;
    } catch (e) { return true; }
  }

  function take() {
    if (location.hash.indexOf("#access_token") !== 0) return;
    var got = new URLSearchParams(location.hash.slice(1));
    var wanted = asked();
    history.replaceState(null, "", location.pathname + location.search);
    if (!wanted) return;
    keep({
      access_token: got.get("access_token"),
      refresh_token: got.get("refresh_token") || "",
      expires_at: Date.now() + Number(got.get("expires_in") || 3600) * 1000,
    });
  }
  take();

  /* What the token says about the person. The payload is UTF-8, so a Hebrew
     name needs more than atob. */
  function claims() {
    try {
      var part = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      var bin = atob(part);
      var utf8 = "";
      for (var i = 0; i < bin.length; i++) utf8 += "%" + ("00" + bin.charCodeAt(i).toString(16)).slice(-2);
      return JSON.parse(decodeURIComponent(utf8));
    } catch (e) { return {}; }
  }

  function token() {
    if (!session || !session.refresh_token) return Promise.reject(signedOut());
    if (session.expires_at - Date.now() > 60000) return Promise.resolve(session.access_token);
    if (refreshing) return refreshing;
    var spent = session.refresh_token;
    refreshing = fetch(S.url + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { apikey: S.anonKey, "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: spent }),
    }).then(function (r) {
      /* only a refusal ends the session (400, 401: the refresh token is spent or revoked). A 5xx is the
         sign-in server having a bad moment: the session stays, and the next request tries the refresh again */
      if (r.status === 400 || r.status === 401) { lost(); throw signedOut(); }
      if (!r.ok) { var bad = new Error("refresh failed " + r.status); bad.status = r.status; throw bad; }
      return r.json();
    }).then(function (d) {
      keep({
        access_token: d.access_token,
        refresh_token: d.refresh_token || spent,
        expires_at: Date.now() + (d.expires_in || 3600) * 1000,
      });
      return session.access_token;
    }).then(function (t) { refreshing = null; return t; },
            function (e) { refreshing = null; throw e; });
    return refreshing;
  }

  function signedOut() {
    var e = new Error("signed out");
    e.signedOut = true;
    return e;
  }

  /* A request to Supabase as the person. Resolves to the parsed body (null when
     there is none), and rejects with the status on `.status`. A rejection with
     `.signedOut` set means the session is gone and the app should ask to sign in. */
  function api(path, opts) {
    opts = opts || {};
    return token().then(function (t) {
      var headers = { apikey: S.anonKey, authorization: "Bearer " + t };
      if (opts.json !== undefined) headers["content-type"] = "application/json";
      if (opts.prefer) headers.prefer = opts.prefer;
      if (opts.headers) for (var k in opts.headers) if (Object.prototype.hasOwnProperty.call(opts.headers, k)) headers[k] = opts.headers[k];   /* e.g. x-floa-live from /live.js */
      /* opts.profile: the schema of this one request (Accept-Profile and Content-Profile), for a page that /supabase.js gives no
         schema, e.g. /roster-site.js on a business's own site. A profile header the caller already wrote in opts.headers wins. */
      if (opts.profile) {
        var named = {};
        for (var n in headers) if (Object.prototype.hasOwnProperty.call(headers, n)) named[n.toLowerCase()] = true;
        if (!named["accept-profile"]) headers["Accept-Profile"] = opts.profile;
        if (!named["content-profile"]) headers["Content-Profile"] = opts.profile;
      }
      return fetch(S.url + path, {
        method: opts.method || "GET",
        headers: headers,
        body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
      });
    }).then(function (r) {
      if (r.status === 401) { lost(); throw signedOut(); }
      if (!r.ok) {
        var e = new Error("request failed " + r.status);
        e.status = r.status;
        throw e;
      }
      return r.status === 204 ? null : r.json().catch(function () { return null; });
    }).catch(function (e) {
      /* a rejection with `.signedOut` carries the request it refused (`.req`), so a write that was
         typed is not lost: the kit (/app.js) keeps it and sends it after the sign-in */
      if (e && e.signedOut) { var x = signedOut(); x.req = { path: path, opts: opts }; throw x; }
      throw e;
    });
  }

  /* `back` is where Google sends the person afterwards. It must be one of the
     Redirect URLs in Supabase; by default it is the page they are on. */
  function signIn(back) {
    try { sessionStorage.setItem(ASKED, "1"); } catch (e) { /* see take() */ }
    location.assign(S.url + "/auth/v1/authorize?provider=google&redirect_to=" +
      encodeURIComponent(back || location.origin + location.pathname));
  }

  /* Best effort on the server, certain on this device. */
  function signOut() {
    var t = session && session.access_token;
    keep(null);
    if (t) tell("signout", "this");
    if (!t) return Promise.resolve();
    return fetch(S.url + "/auth/v1/logout", {
      method: "POST",
      headers: { apikey: S.anonKey, authorization: "Bearer " + t },
    }).catch(function () { /* the device is signed out either way */ });
  }

  window.FLOA_AUTH = {
    signedIn: function () { return !!(session && session.refresh_token); },
    userId: function () { return claims().sub || ""; },
    email: function () { return claims().email || ""; },
    name: function () { var m = claims().user_metadata || {}; return m.full_name || m.name || ""; },
    avatar: function () { var m = claims().user_metadata || {}; return m.avatar_url || m.picture || ""; },
    token: token,
    api: api,
    signIn: signIn,
    signOut: signOut,
  };
})();
