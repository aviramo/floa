/* Injected into every page of the TEST environment (served by `node build.mjs --serve --test`, and copied into
   the test site by scripts/deploy-test.mjs). Never part of the real build. */
(function () {
  window.FLOA_ENV = { name: "test", schema: "test" };
  var of = window.fetch;
  window.fetch = function (input, init) {
    try {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      if (url.indexOf(".supabase.co/rest/v1/") !== -1) {
        var h = new Headers((init && init.headers) || (input && input.headers) || {});
        h.set("Accept-Profile", "test"); h.set("Content-Profile", "test");
        init = Object.assign({}, init || {}, { headers: h });
      }
    } catch (e) {}
    return of.call(this, input, init);
  };
  document.addEventListener("DOMContentLoaded", function () {
    var d = document.createElement("div");
    d.textContent = "סביבת בדיקות · נתונים נפרדים מהאמיתיים";
    d.style.cssText = "position:fixed;top:0;left:0;right:0;height:18px;z-index:2147483647;background:#3F382F;color:#fff;font:600 11px/18px system-ui;text-align:center;pointer-events:none";
    document.body.appendChild(d); document.documentElement.style.marginTop = "18px";
  });
})();
