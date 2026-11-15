/* Student sign-in for the Field Log and Warden Log. A student types the short password their instructor gave them.
   StudentLogin.start("ai"|"cy", function (student) { ... })   runs the callback once signed in.
   student = { id, name, slot, team, scoutId }. The id is also the key of the student's saved log.
   StudentLogin.signOut(badge) forgets this device; StudentLogin.relogin(badge) asks again (for example after the server says 403). */
(function () {
  "use strict";
  var KEYP = "student_login_";
  function read(b) { try { var s = JSON.parse(localStorage.getItem(KEYP + b) || "null"); return s && /^[a-f0-9]{16,32}$/.test(String(s.id)) ? s : null; } catch (e) { return null; } }
  function write(b, s) { try { localStorage.setItem(KEYP + b, JSON.stringify(s)); } catch (e) {} }
  function E(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }

  function ask(badge, done, note) {
    var ov = E("div", "position:fixed;inset:0;z-index:99999;background:#0e0a1c;display:flex;align-items:center;justify-content:center;padding:16px;font:16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#f4f1e8");
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.id = "studentLogin";
    var card = E("form", "width:100%;max-width:380px;background:#241a42;border:1px solid #3f3266;border-radius:14px;padding:22px;box-shadow:0 10px 40px rgba(0,0,0,.5)");
    card.appendChild(E("h2", "margin:0 0 6px;color:#F4B63F;font-size:22px", badge === "cy" ? "Warden Log sign-in" : "Field Log sign-in"));
    card.appendChild(E("p", "margin:0 0 14px;color:#b4aacd;font-size:15px", "Type the password your instructor gave you. It opens your own log on any device."));
    var lab = E("label", "display:block;font-size:14px;color:#b4aacd;font-weight:600;margin:0 0 4px", "Your password"); lab.setAttribute("for", "slPw");
    var inp = E("input", "width:100%;box-sizing:border-box;min-height:52px;font:600 24px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.12em;text-align:center;background:#150f27;color:#f4f1e8;border:1px solid #3f3266;border-radius:10px;padding:8px");
    inp.id = "slPw"; inp.type = "text"; inp.autocomplete = "off"; inp.autocapitalize = "off"; inp.spellcheck = false; inp.maxLength = 14; inp.setAttribute("inputmode", "text");
    var msg = E("p", "min-height:22px;margin:10px 0;font-size:14px;color:" + (note ? "#ff8a9a" : "#b4aacd"), note || ""); msg.setAttribute("role", "status");
    var go = E("button", "width:100%;min-height:48px;border:0;border-radius:10px;background:#F4B63F;color:#17112B;font-weight:800;font-size:17px;cursor:pointer", "Open my log"); go.type = "submit";
    card.appendChild(lab); card.appendChild(inp); card.appendChild(msg); card.appendChild(go);
    ov.appendChild(card); document.body.appendChild(ov); inp.focus();
    card.onsubmit = function (e) {
      e.preventDefault(); var pw = inp.value.trim(); if (!pw) { msg.textContent = "Type your password."; msg.style.color = "#ff8a9a"; return; }
      go.disabled = true; msg.style.color = "#b4aacd"; msg.textContent = "Checking...";
      fetch("/api/login/" + badge, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || "Could not sign in. Try again."); return j; }); })
        .then(function (j) { var s = { id: j.id, name: j.name, slot: j.slot, team: j.team || "", scoutId: j.scoutId || "" }; write(badge, s); ov.remove(); done(s); })
        .catch(function (er) { msg.style.color = "#ff8a9a"; msg.textContent = er.message === "Failed to fetch" ? "No connection. Try again when you have Wi-Fi." : er.message; go.disabled = false; inp.select(); });
    };
  }

  function start(badge, cb) {
    var s = read(badge);
    // Already signed in on this device: quietly refresh the name and team from the roster, then open.
    var run = function () {
      if (!s) { ask(badge, cb); return; }
      var done = false, go = function (x) { if (!done) { done = true; cb(x); } };
      var t = setTimeout(function () { go(s); }, 2500);
      fetch("/api/login/" + badge, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id }) })
        .then(function (r) { return r.status === 404 ? "gone" : r.ok ? r.json() : null; })
        .then(function (j) {
          clearTimeout(t);
          if (j === "gone") { try { localStorage.removeItem(KEYP + badge); } catch (e) {} s = null; if (!done) { done = true; ask(badge, cb, "Your sign-in changed. Type your password again."); } return; }
          if (j && j.id === s.id) { s = { id: j.id, name: j.name, slot: j.slot, team: j.team || "", scoutId: j.scoutId || "" }; write(badge, s); }
          go(s);
        }).catch(function () { clearTimeout(t); go(s); });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
  }
  function signOut(badge) { try { localStorage.removeItem(KEYP + badge); } catch (e) {} location.reload(); }
  function relogin(badge) { try { localStorage.removeItem(KEYP + badge); } catch (e) {} location.reload(); }
  // After sign-in the roster can change a student's team. Refresh the saved copy from the server.
  function refresh(badge, student) { write(badge, student); }
  window.StudentLogin = { start: start, signOut: signOut, relogin: relogin, get: read, save: refresh };
})();
