// Animated badge intro: types the terminal lines, then reveals the Enter button.
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var term = document.getElementById("term"), go = document.getElementById("go"), art = document.getElementById("art");
  var lines = JSON.parse(document.getElementById("lines").textContent);
  var done = false;
  function finish() {
    if (done) return; done = true;
    if (art) art.classList.add("open");
    go.classList.add("on"); go.focus({ preventScroll: true });
  }
  if (reduce) {
    lines.forEach(function (l) { var p = document.createElement("p"); p.textContent = l.t; if (l.ok) p.className = "ok"; term.appendChild(p); });
    finish();
  } else {
    var li = 0, ci = 0, p = null;
    (function tick() {
      if (done) return;
      if (li >= lines.length) { finish(); return; }
      var l = lines[li];
      if (!p) { p = document.createElement("p"); if (l.ok) p.className = "ok"; term.querySelectorAll(".cursor").forEach(function (c) { c.classList.remove("cursor"); }); p.classList.add("cursor"); term.appendChild(p); }
      ci += 2; p.textContent = l.t.slice(0, ci);
      if (ci >= l.t.length) { li++; ci = 0; p = null; setTimeout(tick, l.pause || 260); } else setTimeout(tick, 22);
    })();
  }
  document.getElementById("skip").addEventListener("click", function (e) {
    e.preventDefault(); location.href = this.getAttribute("href");
  });
  // Background: falling characters (cyber) or drifting network nodes (ai). Skipped for reduced motion.
  var cv = document.getElementById("bg");
  if (cv && !reduce) {
    var cx = cv.getContext("2d"), W, H, kind = document.body.classList.contains("ai") ? "ai" : "cy", cols, drops, nodes;
    var acc = getComputedStyle(document.body).getPropertyValue("--acc").trim() || "#34E08A";
    function size() { W = cv.width = innerWidth; H = cv.height = innerHeight; cols = Math.floor(W / 18); drops = Array.from({ length: cols }, function () { return Math.random() * H / 18; });
      nodes = Array.from({ length: 36 }, function () { return { x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .5, vy: (Math.random() - .5) * .5 }; }); }
    size(); addEventListener("resize", size);
    (function frame() {
      if (!document.hidden) {
        cx.fillStyle = "rgba(0,0,0," + (kind === "cy" ? .12 : .25) + ")"; cx.fillRect(0, 0, W, H);
        if (kind === "cy") {
          cx.fillStyle = acc; cx.font = "16px monospace";
          for (var i = 0; i < cols; i++) { cx.fillText("01"[Math.random() * 2 | 0], i * 18, drops[i] * 18); if (drops[i] * 18 > H && Math.random() > .975) drops[i] = 0; drops[i] += .5; }
        } else {
          cx.strokeStyle = acc; cx.fillStyle = acc;
          nodes.forEach(function (n) { n.x += n.vx; n.y += n.vy; if (n.x < 0 || n.x > W) n.vx *= -1; if (n.y < 0 || n.y > H) n.vy *= -1; cx.fillRect(n.x, n.y, 3, 3); });
          for (var a = 0; a < nodes.length; a++) for (var b = a + 1; b < nodes.length; b++) { var d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y); if (d < 140) { cx.globalAlpha = 1 - d / 140; cx.beginPath(); cx.moveTo(nodes[a].x, nodes[a].y); cx.lineTo(nodes[b].x, nodes[b].y); cx.stroke(); cx.globalAlpha = 1; } }
        }
      }
      requestAnimationFrame(frame);
    })();
  }
})();
