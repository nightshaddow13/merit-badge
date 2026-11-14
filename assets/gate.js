/* Keeps a badge's Scout pages closed while the badge is off or outside its open window.
   Put in <head> (not deferred): <script src="/assets/gate.js" data-badge="cy"></script>
   Staff (counselor or scorekeeper) always get in and see a note. If the schedule cannot be read, the page opens.
   This is a front-door lock for the Scout pages, not a security wall: the counselor-only files and tools are
   still protected by sign-in on the server. */
(function () {
  "use strict";
  var me = document.currentScript, badge = me && me.getAttribute("data-badge");
  if (!badge || !window.MBSchedule) return;
  var hide = document.createElement("style"); hide.id = "gate-hide"; hide.textContent = "html{visibility:hidden}";
  document.head.appendChild(hide);
  var unhide = function () { if (hide.parentNode) hide.parentNode.removeChild(hide); };
  Promise.all([MBSchedule.load(), MBSchedule.isStaff()]).then(function (r) {
    var cfg = r[0].badges[badge], st = MBSchedule.status(cfg, Date.now() + r[0].skew);
    if (st.open) return unhide();
    if (r[1]) {
      unhide();
      document.addEventListener("DOMContentLoaded", function () {
        if (window.top !== window) return; // inside an embedded tool: no banner
        var n = document.createElement("div"); n.setAttribute("role", "status");
        n.style.cssText = "background:#FFE08A;color:#4a3300;padding:10px 16px;font:700 15px/1.3 system-ui,sans-serif;text-align:center";
        n.textContent = "Closed to Scouts (" + (st.reason === "off" ? "badge turned off" : st.reason === "before" ? "opens " + MBSchedule.when(st.opensAt) : "closed " + MBSchedule.when(st.closesAt)) + "). You can see it because you are signed in as staff.";
        document.body.insertBefore(n, document.body.firstChild);
      });
      return;
    }
    location.replace("/closed.html?badge=" + badge);
  }).catch(unhide);
  setTimeout(unhide, 5000);
})();
