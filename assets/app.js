// One moment of motion: the home headline decodes once on load.
(function () {
  var el = document.getElementById("decode");
  if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var target = el.getAttribute("data-text");
  var glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&";
  var frame = 0, total = 70;
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
  }, 70);
})();

// Sign-in status in the top bar: who is signed in and with which roles.
(function () {
  var bar = document.querySelector("header.top");
  if (!bar) return;
  var box = document.createElement("div");
  box.className = "who";
  box.setAttribute("role", "status");
  bar.appendChild(box);
  var here = encodeURIComponent(location.pathname + location.search);

  function link(text, href) {
    var a = document.createElement("a");
    a.textContent = text;
    a.href = href;
    return a;
  }
  fetch("/.auth/me", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      var p = j && j.clientPrincipal;
      // Show links marked data-roles="a b" only to signed-in users holding one of those roles.
      var mine = (p && p.userRoles) || [];
      Array.prototype.forEach.call(document.querySelectorAll("[data-roles]"), function (n) {
        if (n.getAttribute("data-roles").split(" ").some(function (r) { return mine.indexOf(r) !== -1; })) n.hidden = false;
      });
      if (p) {
        var roles = (p.userRoles || []).filter(function (r) { return r !== "anonymous" && r !== "authenticated"; });
        box.appendChild(document.createTextNode("Signed in as "));
        var b = document.createElement("strong");
        b.textContent = p.userDetails || "you";
        box.appendChild(b);
        box.appendChild(document.createTextNode(" (" + (roles.length ? roles.join(", ") : "no special roles") + ") · "));
        box.appendChild(link("Sign out", "/.auth/logout?post_logout_redirect_uri=" + here));
      } else {
        box.appendChild(document.createTextNode("Not signed in · "));
        box.appendChild(link("Sign in", "/.auth/login/github?post_login_redirect_uri=" + here));
      }
    })
    .catch(function () { box.remove(); });
})();

// First time a Scout opens a badge from the home page: a scary-looking (but harmless) training alert.
// Shown once per device. If storage is blocked it just shows each time.
(function () {
  var doors = document.querySelectorAll("a.door");
  if (!doors.length) return;
  var KEY = "mbfk_link_alert_seen";
  function seen() { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } }
  function mark() { try { localStorage.setItem(KEY, "1"); } catch (e) {} }
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function show(href, opener) {
    var wrap = document.createElement("div"); wrap.className = "hack"; wrap.setAttribute("role", "alertdialog"); wrap.setAttribute("aria-modal", "true"); wrap.setAttribute("aria-labelledby", "hack-t"); wrap.setAttribute("aria-describedby", "hack-d");
    wrap.innerHTML = '<div class="hack-box"><h2 class="hack-title" id="hack-t">\u26A0 SYSTEM COMPROMISED \u26A0</h2>' +
      '<div class="hack-log" aria-hidden="true"></div>' +
      '<div class="hack-msg" id="hack-d"><p class="hack-step"><b>Just kidding. That was a training alert.</b> Real hackers use scary pop-ups just like this one to scare you into clicking fast.</p>' +
      '<p class="hack-step"><b>Never click random links on the internet.</b> That includes texts, emails, ads, and pop-ups, even if they say your device is in danger or you won a prize. Check who sent it, read the web address, and ask a trusted adult if you are not sure.</p>' +
      '<div class="hack-safe hack-step">\u2714 <b>This link is safe.</b> You are on badge.goss.quest, run by your counselor. You may continue.</div></div>' +
      '<button type="button" class="hack-btn hack-step">I understand. Continue \u2192</button></div>';
    document.body.appendChild(wrap);
    var log = wrap.querySelector(".hack-log"), steps = wrap.querySelectorAll(".hack-step"), btn = wrap.querySelector(".hack-btn");
    var lines = ["> scanning device...", "> 3 threats found!!", "> uploading your files... 100%", "> ...", "> just kidding."];
    function reveal() { steps.forEach(function (s, k) { setTimeout(function () { s.classList.add("on"); }, reduce ? 0 : k * 450); }); }
    if (reduce) { log.textContent = lines.join("\n"); reveal(); }
    else { lines.forEach(function (l, k) { setTimeout(function () { var d = document.createElement("div"); d.textContent = l; log.appendChild(d); }, k * 450); }); setTimeout(reveal, lines.length * 450); }
    btn.focus();
    function close(go) { document.removeEventListener("keydown", key); wrap.remove(); if (go) { mark(); location.href = href; } else if (opener) opener.focus(); }
    function key(e) { if (e.key === "Escape") close(false); else if (e.key === "Tab") { e.preventDefault(); btn.focus(); } }
    document.addEventListener("keydown", key);
    btn.addEventListener("click", function () { close(true); });
  }
  doors.forEach(function (a) { a.addEventListener("click", function (e) { if (seen()) return; e.preventDefault(); show(a.href, a); }); });
})();

// ---- Class countdowns: one red countdown on each badge door (home page) ------------------------
// Both classes are Saturday Nov 14 2026 (Eastern time, EST = UTC-5) and run three hours.
(function () {
  var HOUR = 3600000;
  var CLASSES = [
    { key: "cy", name: "Cybersecurity", start: Date.UTC(2026, 10, 14, 14, 0, 0), label: "Sat Nov 14 · 9:00 AM–12:00 PM ET" },
    { key: "ai", name: "Artificial Intelligence", start: Date.UTC(2026, 10, 14, 18, 0, 0), label: "Sat Nov 14 · 1:00 PM–4:00 PM ET" }
  ];
  CLASSES.forEach(function (c) { c.end = c.start + 3 * HOUR; });
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function left(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (d ? d + "d " : "") + pad(h) + ":" + pad(m) + ":" + pad(x);
  }
  function phase(c, now) { return now < c.start ? "before" : now < c.end ? "live" : "done"; }
  var cds = {};
  CLASSES.forEach(function (c) {
    var door = document.querySelector("a.door." + c.key); if (!door) return;
    var e = document.createElement("span"); e.className = "door-cd";
    e.style.cssText = "display:inline-block;align-self:flex-start;margin-top:6px;padding:6px 12px;border-radius:8px;background:#C1121F;color:#fff;font-weight:700;font-size:15px;font-variant-numeric:tabular-nums";
    door.insertBefore(e, door.querySelector(".door-go")); cds[c.key] = e;
  });
  function tick() {
    var now = Date.now();
    CLASSES.forEach(function (c) {
      var p = phase(c, now), e = cds[c.key];
      if (!e) return;
      e.textContent = p === "before" ? "Starts in " + left(c.start - now) + "  ·  " + c.label : p === "live" ? "In session now · ends in " + left(c.end - now) : "See you next time!";
      e.style.background = p === "done" ? "#2F6F4F" : "#C1121F";
    });
  }
  tick(); setInterval(tick, 1000);
})();
