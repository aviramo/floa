/* THE SIDEWAYS SWIPE GUARD (ui/, the domain's UI library): the ONE place that knows where the system's edge gesture is. Defined in ui/docs/tabs.md (the swipe).
   Served at /swipe.js, loaded before any script that has a sideways swipe (/tabs.js, an app's pager).
   A phone's own Back is a swipe in from the left or the right edge of the screen (Android gesture navigation; iOS from the left). A touch that starts there
   belongs to the system: if the app's swipe took it too, the page would slide under the finger before the system goes back (owner 2026-11-26).
     RosterSwipe.fromEdge(x): true when a touch that starts at clientX x is inside the zone on either side, in RTL and LTR alike (the edges are the screen's, not the text's).
     RosterSwipe.size(): the zone's width in px, the token --edge-gesture of ui/css/00-tokens.css (read on :root).
   Every sideways swipe asks fromEdge at its start (touchstart, or pointerdown of a finger or a pen) and does not start when it is true. A mouse is never in it.
   No business names, no framework. */
(function () {
  "use strict";
  function size() {
    var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--edge-gesture"));
    return isFinite(v) && v >= 0 ? v : 0;   /* a page without the kit's tokens has no zone: nothing changes there */
  }
  function fromEdge(x) {
    var z = size(), w = window.innerWidth || document.documentElement.clientWidth;
    return z > 0 && (x < z || x > w - z);
  }
  window.RosterSwipe = { fromEdge: fromEdge, size: size };
})();
