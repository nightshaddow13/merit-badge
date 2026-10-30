// One moment of motion: the home headline decodes once on load.
(function () {
  var el = document.getElementById("decode");
  if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var target = el.getAttribute("data-text");
  var glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&";
  var frame = 0, total = 28;
  el.setAttribute("aria-label", target);
  var timer = setInterval(function () {
    frame++;
    var reveal = Math.floor((frame / total) * target.length);
    var out = "";
    for (var i = 0; i < target.length; i++) {
      var c = target[i];
      out += (i < reveal || c === " " || c === "." ) ? c : glyphs[Math.floor(Math.random() * glyphs.length)];
    }
    el.textContent = out;
    if (frame >= total) { clearInterval(timer); el.textContent = target; el.removeAttribute("aria-label"); }
  }, 40);
})();
