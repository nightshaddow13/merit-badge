// Full screen mode: hides everything except the top contenders and makes them big enough to read from across a room.
// The page itself goes full screen (so score pop-ups still show). On phones that cannot do real full screen (iPhone)
// the same big layout is used inside the browser.
(function () {
  var C = window.Cup, root = document.documentElement;
  var btn = document.getElementById("fsbtn");
  var params = new URLSearchParams(location.search);
  var TOP = Math.max(1, Math.min(8, parseInt(params.get("top"), 10) || 3));
  var on = false, refresh = function () {};

  function set(next) {
    if (on === next) return;
    on = next;
    if (!on && C.tv) C.tv.real = false;
    root.classList.toggle("tv-mode", on);
    if (btn) { btn.setAttribute("aria-pressed", String(on)); btn.textContent = on ? "Exit full screen" : "Full screen"; }
    refresh();
  }

  function enter() {
    set(true);
    var go = root.requestFullscreen || root.webkitRequestFullscreen;
    if (go) { try { var p = go.call(root); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
  }
  function leave() {
    set(false);
    var out = document.exitFullscreen || document.webkitExitFullscreen;
    if (out && (document.fullscreenElement || document.webkitFullscreenElement)) { try { var p = out.call(document); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
  }

  // Esc or the browser's own exit gesture leaves real full screen; follow it.
  function sync() { if (on && !(document.fullscreenElement || document.webkitFullscreenElement) && C.tv.real) set(false); else if (document.fullscreenElement || document.webkitFullscreenElement) C.tv.real = true; }
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("webkitfullscreenchange", sync);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && on) leave(); });

  // Small exit button in the corner, faint until hovered or focused (Esc works too).
  var exit = document.createElement("button");
  exit.type = "button"; exit.className = "tv-exit"; exit.textContent = "Exit full screen";
  exit.addEventListener("click", leave);
  document.body.appendChild(exit);

  if (btn) btn.addEventListener("click", function () { on ? leave() : enter(); });
  if (params.get("tv") === "1") set(true);   // a link that opens straight into the big view (no browser full screen without a click)

  C.tv = {
    real: false,
    isOn: function () { return on; },
    top: function () { return TOP; },
    onChange: function (fn) { refresh = fn; }
  };
})();
