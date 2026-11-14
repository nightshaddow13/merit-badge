/* Export every backed-up Field Log (counselor dashboards only).
   The data comes from the same staff-only endpoints the dashboards already use, so a signed-out
   visitor gets nothing. Nothing is stored or changed: this only reads.
   window.MBExport.run({ badge, base, label, groupLabel, groupKey, reqs, kind, say }) */
(function () {
  "use strict";

  function getJSON(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Sign in as a counselor or scorekeeper to export." : (j.error || "Request failed (" + r.status + ")"));
        return j;
      });
    });
  }

  // Fetch every full log, a few at a time. A log that fails is listed in `failed` instead of stopping the export.
  function fetchAll(base, onProgress) {
    return getJSON(base + "/logs").then(function (j) {
      var list = j.logs || [], out = new Array(list.length), failed = [], next = 0, done = 0;
      function worker() {
        if (next >= list.length) return Promise.resolve();
        var i = next++, l = list[i];
        return getJSON(base + "/log?id=" + encodeURIComponent(l.id)).then(function (full) {
          out[i] = full;
        }).catch(function () {
          failed.push(l.name || l.id); out[i] = null;
        }).then(function () { onProgress && onProgress(++done, list.length); return worker(); });
      }
      var pool = []; for (var k = 0; k < Math.min(4, list.length); k++) pool.push(worker());
      return Promise.all(pool).then(function () { return { logs: out.filter(Boolean), failed: failed, listed: list.length }; });
    });
  }

  // { a: { b: [1, 2] } } becomes { "a.b.1": 1, "a.b.2": 2 }
  function flatten(v, prefix, out) {
    if (v === null || v === undefined || v === "") return out;
    if (Array.isArray(v)) { v.forEach(function (x, i) { flatten(x, prefix ? prefix + "." + (i + 1) : String(i + 1), out); }); return out; }
    if (typeof v === "object") { Object.keys(v).forEach(function (k) { flatten(v[k], prefix ? prefix + "." + k : k, out); }); return out; }
    out[prefix] = v; return out;
  }

  // A Scout's text must never run as a spreadsheet formula when a counselor opens the CSV, so a leading = + @ (or - before a non-digit) gets a quote in front.
  function csvCell(v) { v = v == null ? "" : String(v); if (/^([=+@\t\r]|-(?!\d))/.test(v)) v = "'" + v; return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function dashed(id) { return String(id || "").replace(/(.{4})/g, "$1-").replace(/-$/, ""); }

  function toCSV(cfg, logs) {
    var reqs = cfg.reqs; // [[key, label], ...] in display order
    var rows = logs.map(function (j) {
      var m = j.meta || {}, flat = flatten(j.state || {}, "", {}), r = {};
      r["Name"] = m.name || ""; r[cfg.groupLabel] = m[cfg.groupKey] || "";
      r["Scouting America ID"] = m.memberId || (j.state && j.state.memberId) || "";
      r["Recovery code"] = dashed(m.id); r["Last updated"] = m.updated || "";
      if (m.editedAt) { r["Counselor edited"] = m.editedAt; r["Counselor edited by"] = m.editedBy || ""; }
      var signed = j.signed || {}, waive = cfg.kind === "ai" ? j.overrides || {} : j.waive || {};
      reqs.forEach(function (q) {
        var s = signed[q[0]]; r["Req " + q[1] + " signed"] = s ? "Yes" : "No";
        r["Req " + q[1] + " signed by"] = s ? s.by || "" : ""; r["Req " + q[1] + " signed at"] = s ? s.at || "" : "";
        var w = waive[q[0]]; r[(cfg.kind === "ai" ? "Level " : "Req ") + q[1] + " waiver"] = w ? w.status || "" : "";
      });
      Object.keys(flat).forEach(function (k) { r["log." + k] = flat[k]; });
      return r;
    });
    var seen = {}, head = [];
    rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (!seen[k]) { seen[k] = 1; head.push(k); } }); });
    // fixed columns first, written answers last in a stable order
    var fixed = head.filter(function (k) { return k.indexOf("log.") !== 0; }), answers = head.filter(function (k) { return k.indexOf("log.") === 0; }).sort();
    head = fixed.concat(answers);
    return "﻿" + [head].concat(rows.map(function (r) { return head.map(function (k) { return r[k]; }); })).map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n";
  }

  function save(name, type, text) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function stamp() { var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()); }

  // format: "json" (every log in full, loadable and complete) or "csv" (one row per Scout, one column per written answer)
  function run(cfg, format) {
    var say = cfg.say || function () {};
    say("Collecting every Field Log…");
    return fetchAll(cfg.base, function (n, total) { say("Collecting Field Logs: " + n + " of " + total + "…"); }).then(function (res) {
      if (!res.listed) { say("No Field Logs are backed up yet, so there is nothing to export."); return; }
      var logs = res.logs;
      if (cfg.filter) logs = logs.filter(cfg.filter);
      var file = cfg.file + "-" + stamp();
      if (format === "csv") save(file + ".csv", "text/csv", toCSV(cfg, logs));
      else save(file + ".json", "application/json", JSON.stringify({ app: "merit-badge-export", badge: cfg.badge, exported: new Date().toISOString(), count: logs.length, logs: logs }, null, 2));
      say("Exported " + logs.length + " Field Log" + (logs.length === 1 ? "" : "s") + " as ." + format + "." + (res.failed.length ? " Could not read: " + res.failed.join(", ") + ". Try again for those." : ""));
    }).catch(function (e) { say(e.message); });
  }

  var api = { run: run, toCSV: toCSV, flatten: flatten, fetchAll: fetchAll };
  if (typeof window !== "undefined") window.MBExport = api;
  if (typeof module !== "undefined") module.exports = api;
})();
