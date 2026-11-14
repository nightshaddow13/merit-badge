// Cybersecurity scoreboard: while a live game is on (started from the scoring dashboard), the game takes over the
// page, the same way the A.I.R.A. games do. When the counselor ends the game the standings come back.
(function () {
  var box = document.getElementById("gameLive"), wrap = document.getElementById("boardWrap");
  if (!box || !wrap) return;
  var names = [], LABELS = ["Too guessable", "Very guessable", "Somewhat guessable", "Safely unguessable", "Very unguessable"], ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
  function E(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function lname(n) { return names[n - 1] || "Lodge " + n; }
  function named() { var k = 0; for (var i = 0; i < 6; i++) if (names[i]) k++; return k || 6; }
  function loadNames() {
    return fetch("/api/scores/cybersecurity", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.lodges) names = d.lodges.map(String); }).catch(function () {});
  }
  function forge(j) {
    var f = j.forge, r = f.round, base = r.mode === "break" && r.starter ? r.starter.log10 : 0;
    box.appendChild(E("div", "rd", "Live game · Passphrase Forge"));
    box.appendChild(E("h2", null, r.mode === "break" ? "Break the weak one" : "Forge the strongest passphrase"));
    box.appendChild(E("p", "pr", r.mode === "break"
      ? "Improve the starter. The biggest jump in strength wins." + (r.starter ? " Starter: " + r.starter.preview + " (" + LABELS[r.starter.score] + ")." : " Waiting for the starter.")
      : "Forge a passphrase in your Warden Log and submit it for your lodge. Only strength is sent, never the passphrase."));
    if (r.banned && r.banned.length) box.appendChild(E("p", "pr", "Banned words: " + r.banned.join(", ")));
    box.appendChild(E("p", "wait", f.ranked.length + " of " + named() + " lodges submitted" + (r.open ? "." : ". Submissions are closed.")));
    var max = Math.max.apply(null, [1].concat(f.ranked.map(function (e) { return Math.max(0, e.log10 - base); })));
    f.ranked.forEach(function (e) {
      var row = E("div", "gl-row"), pct = Math.max(4, Math.round(Math.max(0, e.log10 - base) / max * 100));
      row.appendChild(E("div", "gl-name", ORD[e.place - 1] + " · " + lname(e.lodge)));
      var bar = E("div", "gl-bar"), fill = E("div", "gl-fill"); fill.style.width = pct + "%"; bar.appendChild(fill); row.appendChild(bar);
      row.appendChild(E("div", "gl-note", LABELS[e.score] + " · " + e.length + " characters" + (base ? " · +" + e.gain.toFixed(1) + " over the starter" : "")));
      box.appendChild(row);
    });
  }
  function twokey(j) {
    var t = j.twokey;
    box.appendChild(E("div", "rd", "Live game · Two-Key Rite"));
    box.appendChild(E("h2", null, "Race to two codes"));
    box.appendChild(E("p", "pr", "Type two different codes from your authenticator. Points go to the first lodges to finish: 1st +3, 2nd +2, everyone after +1."));
    var done = t.entries.filter(function (e) { return e.place; }).length;
    box.appendChild(E("p", "wait", done + " of " + named() + " lodges finished."));
    t.entries.forEach(function (e) {
      if (!names[e.lodge - 1] && !e.codes && !e.place) return;
      var row = E("div", "gl-row");
      row.appendChild(E("div", "gl-name", lname(e.lodge)));
      var pips = E("div", "gl-pips");
      for (var k = 0; k < t.needed; k++) pips.appendChild(E("span", "gl-pip" + (k < e.codes ? " on" : ""), k < e.codes ? "✓" : ""));
      row.appendChild(pips);
      row.appendChild(E("div", "gl-note", e.place ? "Finished " + ORD[e.place - 1] + " · +" + e.points : (e.codes ? "One code in" : "Waiting")));
      box.appendChild(row);
    });
  }
  var last = "";
  function paint(j) {
    var live = !!j.active; wrap.hidden = live; box.hidden = !live;
    var key = JSON.stringify(j); if (key === last) return; last = key;
    box.textContent = "";
    if (!live) return;
    if (j.active === "forge" && j.forge) forge(j); else if (j.active === "twokey" && j.twokey) twokey(j);
  }
  function poll() { fetch("/api/cybergame", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j) paint(j); }).catch(function () {}); }
  loadNames().then(function () { poll(); setInterval(poll, 4000); setInterval(loadNames, 60000); });
})();
