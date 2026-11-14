// Tools open inside the Warden Log with ?embed=1: hide the site header and footer so only the tool shows.
// ?lodge=N (1 to 6) picks the Scout's lodge for them, so the games that need a team select it automatically.
(function () {
  if (/[?&]embed=1\b/.test(location.search)) {
    var s = document.createElement("style");
    s.textContent = "header.top,div.top,.skip,footer,.foot,.hero{display:none!important}body{padding-top:0!important}";
    document.head.appendChild(s);
    document.documentElement.classList.add("embed");
  }
  var m = /[?&]lodge=([1-6])\b/.exec(location.search);
  if (!m) return;
  var want = m[1], noted = false;
  function apply() {
    var sel = document.getElementById("lodge");
    if (!sel) return;
    var has = [].some.call(sel.options, function (o) { return o.value === want; });
    if (!has) return;
    if (sel.value !== want) { sel.value = want; sel.dispatchEvent(new Event("change", { bubbles: true })); }
    sel.disabled = true;
    if (!noted) {
      noted = true;
      var n = document.createElement("small"); n.textContent = "Your lodge comes from your Warden Log."; n.style.cssText = "display:block;opacity:.8;margin-top:4px";
      sel.parentNode.insertBefore(n, sel.nextSibling);
    }
  }
  document.addEventListener("DOMContentLoaded", function () {
    apply();
    var sel = document.getElementById("lodge");
    if (sel) new MutationObserver(apply).observe(sel, { childList: true });
    var tries = 0, t = setInterval(function () { apply(); if (++tries > 40) clearInterval(t); }, 250);
  });
})();
