/* One answer open at a time. <details> already does the opening, the keyboard and
   the announcing — all this adds is closing the others, so the list never grows
   into a wall of text. No-ops on a page with no accordion. */
(function () {
  "use strict";
  document.querySelectorAll("[data-faq]").forEach(function (group) {
    var items = group.querySelectorAll("details");
    items.forEach(function (item) {
      item.addEventListener("toggle", function () {
        if (!item.open) return;
        items.forEach(function (other) { if (other !== item) other.open = false; });
      });
    });
  });
})();
