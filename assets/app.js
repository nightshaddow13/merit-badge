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
