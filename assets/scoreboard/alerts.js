// Score pop-ups: when a team's points change between two live refreshes, show a short pop-up that says who scored,
// how many points and what for. Shared by the Cybersecurity and A.I.R.A. scoreboards.
(function () {
  var C = window.Cup, B = C.B;
  var prev = null;        // last live scores we looked at (null until the first one, so opening the page never pops)
  var queue = [], showing = 0;
  var MAX_SHOWN = 3, SHOW_MS = 7000, MAX_EVENTS = 8;
  var host = null;

  // Everything that changed between two score sets, one entry per team and activity.
  function diff(a, b, rows) {
    var out = [];
    rows.forEach(function (row) {
      b.lodges.forEach(function (name, i) {
        if (!name) return;
        var was = C.cellValue(a, row.id, i), now = C.cellValue(b, row.id, i);
        var delta = (now || 0) - (was || 0);
        if (delta !== 0) out.push({ name: name, idx: i, what: row.name, delta: delta });
      });
    });
    return out;
  }

  function fmt(n) { return (n > 0 ? "+" : "−") + Math.abs(n); }

  function ensureHost() {
    if (host) return host;
    host = C.el("div", { "class": "toasts", role: "status", "aria-live": "polite" });
    document.body.appendChild(host);
    return host;
  }

  function pump() {
    while (showing < MAX_SHOWN && queue.length) {
      var e = queue.shift();
      showing++;
      var t = C.el("div", { "class": "toast" + (e.delta < 0 ? " neg" : ""), role: "presentation" }, [
        C.el("span", { "class": "toast-pts", text: fmt(e.delta) + " " + (e.delta === 1 || e.delta === -1 ? "pt" : B.unit === "XP" ? "XP" : "pts") }),
        C.el("span", { "class": "toast-who", text: e.name }),
        C.el("span", { "class": "toast-for", text: e.what })
      ]);
      // Only the text is read out; the visual pop-up itself is decoration.
      t.setAttribute("aria-label", e.name + " " + fmt(e.delta) + " for " + e.what);
      ensureHost().appendChild(t);
      (function (node) {
        setTimeout(function () {
          node.classList.add("out");
          setTimeout(function () { node.remove(); showing--; pump(); }, 400);
        }, SHOW_MS);
      })(t);
    }
  }

  // Call with every fresh scores payload. Only live data counts; a saved snapshot never triggers a pop-up.
  function update(data, rows) {
    if (data.source !== "live") return;
    var before = prev;
    prev = data;
    if (!before || document.hidden) return;
    var list = diff(before, data, rows);
    if (!list.length) return;
    if (list.length > MAX_EVENTS) {
      // A reset or a bulk edit: one note instead of a wall of pop-ups.
      var t = C.el("div", { "class": "toast", role: "presentation" }, [
        C.el("span", { "class": "toast-who", text: "Scores updated" }),
        C.el("span", { "class": "toast-for", text: list.length + " changes" })
      ]);
      ensureHost().appendChild(t);
      setTimeout(function () { t.remove(); }, SHOW_MS);
      return;
    }
    // Biggest swing first so the most exciting one is on top.
    list.sort(function (x, y) { return Math.abs(y.delta) - Math.abs(x.delta); });
    list.forEach(function (e) { queue.push(e); });
    pump();
  }

  C.alerts = { update: update, diff: diff };
})();
