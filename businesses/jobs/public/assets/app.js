(function () {
  "use strict";
  var list = document.getElementById("list");
  var S = window.SUPABASE;
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  fetch(S.url + "/rest/v1/jobs?select=*&published=eq.true&order=created_at.desc", {
    headers: { apikey: S.anonKey, authorization: "Bearer " + S.anonKey },
  })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (rows) {
      if (!rows.length) { list.textContent = "אין משרות פתוחות כרגע."; return; }
      list.innerHTML = rows.map(function (j) {
        return '<article class="job"><h2>' + esc(j.title) + "</h2><p>" +
          esc([j.company, j.location].filter(Boolean).join(" · ")) + "</p><p>" +
          esc(j.description) + "</p>" +
          (/^https?:\/\//.test(j.apply_url) ? '<a href="' + esc(j.apply_url) + '" rel="noopener">להגשת מועמדות</a>' : "") +
          "</article>";
      }).join("");
    })
    .catch(function () { list.textContent = "לא הצלחנו לטעון את המשרות."; });
})();
