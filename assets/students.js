/* Students and teams manager (counselor or scorekeeper). One page per badge:
   <html data-badge="cy|ai">. Talks to /api/roster/<badge>. Passwords are shown here because the instructor hands them out. */
(function () {
  "use strict";
  var BADGE = document.documentElement.getAttribute("data-badge"), BASE = "/api/roster/" + BADGE;
  var WORD = BADGE === "cy" ? "lodge" : "squad";
  var $ = function (i) { return document.getElementById(i); };
  var teams = [], students = [], max = 80, slots = 6, filter = "";

  function E(tag, cls, t) { var e = document.createElement(tag); if (cls) e.className = cls; if (t != null) e.textContent = t; return e; }
  function say(t, kind) { var m = $("msg"); m.textContent = t; m.className = "msg" + (kind ? " " + kind : ""); }
  function api(path, body) {
    return fetch(BASE + path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Sign in as a counselor or scorekeeper to manage students." : (j.error || "Request failed (" + r.status + ")"));
        return j;
      });
    });
  }
  function teamName(slot) { if (slot === null || slot === undefined) return "Not on a team"; var t = teams.filter(function (x) { return x.slot === slot; })[0]; return t ? t.name : "(no team)"; }
  function slotVal(v) { return v === "" ? null : +v; }
  function pretty(pw) { return String(pw || "").replace(/(.{3})(?=.)/g, "$1 "); }
  function countOn(slot) { return students.filter(function (s) { return s.slot === slot; }).length; }

  function load() {
    return api("").then(function (j) { teams = j.teams || []; students = j.students || []; max = j.max || 80; slots = j.slots || 6; paint(); }).catch(function (e) { say(e.message, "err"); });
  }

  function teamSelect(id, value, includeAll) {
    var s = document.createElement("select"); if (id) s.id = id;
    s.appendChild(new Option(includeAll ? "All teams" : "Not on a team", ""));
    teams.forEach(function (t) { s.appendChild(new Option(t.name, String(t.slot))); });
    s.value = value === undefined || value === null ? "" : String(value);
    return s;
  }

  function paintTeams() {
    var box = $("teams"); box.textContent = "";
    if (!teams.length) {
      box.appendChild(E("p", "hint", "No teams yet. Create your first " + WORD + " to get started, then add students to it."));
    }
    teams.forEach(function (t) {
      var row = E("div", "trow");
      var inp = document.createElement("input"); inp.type = "text"; inp.maxLength = 30; inp.value = t.name; inp.setAttribute("aria-label", "Team name");
      var n = countOn(t.slot);
      var save = E("button", "btn ghost", "Rename"); save.type = "button"; save.disabled = true;
      inp.oninput = function () { save.disabled = !inp.value.trim() || inp.value.trim() === t.name; };
      save.onclick = function () { save.disabled = true; api("/team-rename", { slot: t.slot, name: inp.value }).then(function () { say("Renamed to " + inp.value.trim() + ".", "ok"); return load(); }).catch(function (e) { say(e.message, "err"); save.disabled = false; }); };
      var rm = E("button", "btn ghost", "Remove"); rm.type = "button";
      rm.onclick = function () {
        if (n) { say("Move or remove the " + n + " student" + (n === 1 ? "" : "s") + " on " + t.name + " first.", "err"); return; }
        if (!confirm("Remove " + t.name + "? Its points on the scoreboard are cleared too.")) return;
        api("/team-remove", { slot: t.slot, confirm: true }).then(function () { say("Removed " + t.name + ".", "ok"); return load(); }).catch(function (e) { say(e.message, "err"); });
      };
      row.appendChild(inp); row.appendChild(E("span", "cnt", n + " student" + (n === 1 ? "" : "s"))); row.appendChild(save); row.appendChild(rm);
      box.appendChild(row);
    });
    var full = teams.length >= slots;
    $("newTeam").disabled = full; $("addTeam").disabled = full;
    $("teamHint").textContent = full ? "This badge holds up to " + slots + " teams." : "You can add up to " + (slots - teams.length) + " more.";
    if (!teams.length && !$("newTeam").value) $("newTeam").placeholder = "e.g. " + (BADGE === "cy" ? "Lodge 1" : "Squad 1");
  }

  function paintAdd() {
    var sel = $("addTeamSel"), keep = sel.value; sel.textContent = ""; sel.appendChild(new Option("Not on a team yet (assign below)", ""));
    teams.forEach(function (t) { sel.appendChild(new Option(t.name, String(t.slot))); });
    if (keep && teams.some(function (t) { return String(t.slot) === keep; })) sel.value = keep;
    $("addBtn").disabled = false;
    $("addNote").textContent = "";
  }

  function paintStudents() {
    var box = $("students"); box.textContent = "";
    var fsel = $("flt"), keep = fsel.value; fsel.textContent = ""; fsel.appendChild(new Option("All teams", "")); fsel.appendChild(new Option("Not on a team", "none"));
    teams.forEach(function (t) { fsel.appendChild(new Option(t.name, String(t.slot))); });
    fsel.value = keep === "none" || teams.some(function (t) { return String(t.slot) === keep; }) ? keep : ""; filter = fsel.value;
    var un = students.filter(function (s) { return s.slot === null; }).length;
    $("count").textContent = students.length + " of " + max + " students" + (un ? " \u00b7 " + un + " not on a team yet" : "");
    var rows = students.filter(matches);
    if (!rows.length) { box.appendChild(E("p", "hint", students.length ? "No students match that filter." : "No students yet. Add some below, then assign each one a team here.")); return; }
    var t = E("table", "grid"), h = E("thead"), hr = E("tr");
    ["Name", "Scout ID", "Team", "Password", ""].forEach(function (x) { var th = E("th", null, x); th.scope = "col"; hr.appendChild(th); });
    h.appendChild(hr); t.appendChild(h);
    var b = E("tbody");
    rows.forEach(function (s) {
      var tr = E("tr");
      var nm = document.createElement("input"); nm.type = "text"; nm.maxLength = 40; nm.value = s.name; nm.setAttribute("aria-label", "Name");
      nm.onchange = function () { var v = nm.value.trim(); if (!v || v === s.name) { nm.value = s.name; return; } api("/update", { id: s.id, name: v }).then(function () { say("Renamed " + s.name + " to " + v + ".", "ok"); return load(); }).catch(function (e) { say(e.message, "err"); nm.value = s.name; }); };
      var td1 = E("td"); td1.appendChild(nm); tr.appendChild(td1);
      var sid = document.createElement("input"); sid.type = "text"; sid.maxLength = 20; sid.value = s.scoutId || ""; sid.placeholder = "optional"; sid.setAttribute("aria-label", "Scouting ID for " + s.name);
      sid.onchange = function () { var v = sid.value.trim(); if (v === (s.scoutId || "")) return; api("/update", { id: s.id, scoutId: v }).then(function (j) { say("Saved the scouting ID for " + s.name + ".", "ok"); sid.value = j.student.scoutId; s.scoutId = j.student.scoutId; }).catch(function (e) { say(e.message, "err"); sid.value = s.scoutId || ""; }); };
      var tdi = E("td"); tdi.appendChild(sid); tr.appendChild(tdi);
      var ts = teamSelect("", s.slot); ts.setAttribute("aria-label", "Team for " + s.name);
      if (s.slot === null) tr.className = "unassigned";
      ts.onchange = function () { var v = slotVal(ts.value); api("/update", { id: s.id, slot: v }).then(function () { say(s.name + (v === null ? " is not on a team." : " is now on " + teamName(v) + "."), "ok"); return load(); }).catch(function (e) { say(e.message, "err"); ts.value = s.slot === null ? "" : String(s.slot); }); };
      var td2 = E("td"); td2.appendChild(ts); tr.appendChild(td2);
      var td3 = E("td"); var pw = E("code", "pw", pretty(s.password)); td3.appendChild(pw); tr.appendChild(td3);
      var td4 = E("td", "acts");
      var rs = E("button", "btn ghost", "New password"); rs.type = "button";
      rs.onclick = function () { if (!confirm("Give " + s.name + " a new password? The old one stops working.")) return; api("/update", { id: s.id, resetPassword: true }).then(function (j) { say(s.name + "'s new password is " + pretty(j.student.password) + ".", "ok"); return load(); }).catch(function (e) { say(e.message, "err"); }); };
      var rm = E("button", "btn ghost", "Remove"); rm.type = "button";
      rm.onclick = function () { if (!confirm("Remove " + s.name + "? Their password stops working. Their saved log stays for you to read and export.")) return; api("/remove", { id: s.id, confirm: true }).then(function () { say("Removed " + s.name + ".", "ok"); return load(); }).catch(function (e) { say(e.message, "err"); }); };
      td4.appendChild(rs); td4.appendChild(rm); tr.appendChild(td4); b.appendChild(tr);
    });
    t.appendChild(b); var w = E("div", "tablewrap"); w.appendChild(t); box.appendChild(w);
  }

  function matches(s) { return filter === "" || (filter === "none" ? s.slot === null : String(s.slot) === filter); }
  function paint() { paintTeams(); paintAdd(); paintStudents(); }

  // ---- print / export ----
  function printList(list, title) {
    var pv = $("pv"); pv.textContent = "";
    pv.appendChild(E("h1", null, title));
    pv.appendChild(E("p", null, "Type the password at the Warden Log / Field Log sign-in. Keep it to yourself."));
    var byTeam = {};
    list.forEach(function (s) { (byTeam[s.slot] = byTeam[s.slot] || []).push(s); });
    Object.keys(byTeam).sort(function (a, b) { return (a === "null" ? -1 : +a) - (b === "null" ? -1 : +b); }).forEach(function (k) {
      var sec = E("section"); sec.appendChild(E("h2", null, teamName(k === "null" ? null : +k)));
      byTeam[k].forEach(function (s) { var c = E("div", "card"); c.appendChild(E("span", null, s.name)); c.appendChild(E("b", null, pretty(s.password))); sec.appendChild(c); });
      pv.appendChild(sec);
    });
    window.print();
  }
  function csv() {
    var q = function (v) { v = v == null ? "" : String(v); if (/^([=+@\t\r]|-(?!\d))/.test(v)) v = "'" + v; return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var rows = [["Name", "Scout ID", "Team", "Password"]].concat(students.map(function (s) { return [s.name, s.scoutId || "", s.slot === null ? "" : teamName(s.slot), s.password]; }));
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + rows.map(function (r) { return r.map(q).join(","); }).join("\r\n") + "\r\n"], { type: "text/csv" }));
    a.download = (BADGE === "cy" ? "Cybersecurity" : "AI") + "-students.csv"; document.body.appendChild(a); a.click(); a.remove();
    say("Downloaded the student list. It has passwords in it, so keep it private.", "ok");
  }

  // ---- wiring ----
  $("addTeamForm").onsubmit = function (e) {
    e.preventDefault(); var name = $("newTeam").value.trim(); if (!name) { say("Type a team name.", "err"); return; }
    $("addTeam").disabled = true;
    api("/team-add", { name: name }).then(function () { $("newTeam").value = ""; say("Created " + name + ".", "ok"); return load(); }).catch(function (er) { say(er.message, "err"); $("addTeam").disabled = false; });
  };
  $("addForm").onsubmit = function (e) {
    e.preventDefault(); var names = $("names").value; if (!names.trim()) { say("Type at least one name, one per line.", "err"); return; }
    $("addBtn").disabled = true;
    api("/add", { names: names, slot: slotVal($("addTeamSel").value) }).then(function (j) {
      $("names").value = ""; var out = $("fresh"); out.textContent = ""; out.hidden = false;
      out.appendChild(E("h3", null, "New students and passwords"));
      var ul = E("ul", "plainpw"); j.added.forEach(function (s) { var li = E("li"); li.appendChild(E("span", null, s.name + " ")); li.appendChild(E("code", "pw", pretty(s.password))); ul.appendChild(li); }); out.appendChild(ul);
      var pr = E("button", "btn", "Print these"); pr.type = "button"; pr.onclick = function () { printList(j.added, "New students"); }; out.appendChild(pr);
      say("Added " + j.added.length + " student" + (j.added.length === 1 ? "" : "s") + ".", "ok"); return load();
    }).catch(function (er) { say(er.message, "err"); }).then(function () { paintAdd(); });
  };
  $("flt").onchange = function () { filter = this.value; paintStudents(); };
  $("print").onclick = function () { if (!students.length) { say("No students to print yet.", "err"); return; } printList(students.filter(matches), "Student passwords"); };
  $("csv").onclick = function () { if (!students.length) { say("No students yet.", "err"); return; } csv(); };
  load(); setInterval(function () { if (!document.hidden && !document.activeElement.matches("input,select,textarea")) load(); }, 20000);
})();
