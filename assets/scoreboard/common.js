// Shared helpers for the scoreboard and scorekeeper pages.
// Each page sets window.BOARD before this file loads:
//   { id, entity, slots, rowsUrl, snapshotUrl, boardUrl, editUrl, unit, levels }
(function () {
  var B = window.BOARD;

  function getJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(url + " returned " + r.status);
      return r.json();
    });
  }

  function loadRows() { return getJson(B.rowsUrl); }

  // Live data from the API; falls back to the static snapshot in the repo.
  function loadScores() {
    return getJson("/api/scores/" + B.id)
      .then(function (d) { d.source = "live"; return normalize(d); })
      .catch(function () {
        return getJson(B.snapshotUrl).then(function (d) { d.source = "snapshot"; return normalize(d); });
      });
  }

  function normalize(d) {
    var names = [];
    for (var i = 0; i < B.slots; i++) names.push(String((d.lodges || [])[i] || ""));
    var lv = typeof d.levels === "number" ? d.levels : 0;
    return { lodges: names, scores: d.scores || {}, levels: lv, updated: d.updated || null, source: d.source };
  }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  function cellValue(data, rowId, i) {
    var row = data.scores[rowId];
    var v = row ? row[i] : null;
    return typeof v === "number" ? v : null;
  }

  function totals(data, rows) {
    var t = [];
    for (var i = 0; i < B.slots; i++) {
      var sum = 0;
      rows.forEach(function (r) { sum += cellValue(data, r.id, i) || 0; });
      t.push(sum);
    }
    return t;
  }

  // Named entries only, highest total first. Ties keep list order (same as the spreadsheets).
  function standings(data, rows) {
    var t = totals(data, rows);
    var list = [];
    data.lodges.forEach(function (name, i) { if (name) list.push({ name: name, idx: i, total: t[i] }); });
    list.sort(function (a, b) { return b.total - a.total || a.idx - b.idx; });
    return list;
  }

  var ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

  function timeText(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  }

  // Resolves true only for a signed-in user with the scorekeeper role.
  function isScorekeeper() {
    return fetch("/.auth/me", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var p = j && j.clientPrincipal;
        return !!(p && p.userRoles && p.userRoles.indexOf("scorekeeper") !== -1);
      })
      .catch(function () { return false; });
  }

  var CODE = "VERIFIED";
  function accessCode(levels) {
    var out = [];
    for (var i = 0; i < CODE.length; i++) out.push(i < levels ? CODE.charAt(i) : "_");
    return out.join(" ");
  }

  window.Cup = { B: B, ORD: ORD, loadRows: loadRows, loadScores: loadScores, normalize: normalize, el: el,
    cellValue: cellValue, totals: totals, standings: standings, timeText: timeText,
    isScorekeeper: isScorekeeper, accessCode: accessCode };
})();
