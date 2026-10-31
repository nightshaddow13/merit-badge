// Shared helpers for the scoreboard and scorekeeper pages.
(function () {
  var SLOTS = 6;

  function getJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(url + " returned " + r.status);
      return r.json();
    });
  }

  function loadActivities() {
    return getJson("/scoreboard/activities.json");
  }

  // Live data from the API; falls back to the static snapshot in the repo.
  function loadScores() {
    return getJson("/api/scores")
      .then(function (d) { d.source = "live"; return normalize(d); })
      .catch(function () {
        return getJson("/data/scoreboard.json").then(function (d) { d.source = "snapshot"; return normalize(d); });
      });
  }

  function normalize(d) {
    var lodges = [];
    for (var i = 0; i < SLOTS; i++) lodges.push(String((d.lodges || [])[i] || ""));
    return { lodges: lodges, scores: d.scores || {}, updated: d.updated || null, source: d.source };
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

  function cellValue(data, actId, i) {
    var row = data.scores[actId];
    var v = row ? row[i] : null;
    return typeof v === "number" ? v : null;
  }

  function totals(data, acts) {
    var t = [];
    for (var i = 0; i < SLOTS; i++) {
      var sum = 0;
      acts.forEach(function (a) { sum += cellValue(data, a.id, i) || 0; });
      t.push(sum);
    }
    return t;
  }

  // Named lodges only, highest total first. Ties keep lodge order (same as the spreadsheet).
  function standings(data, acts) {
    var t = totals(data, acts);
    var list = [];
    data.lodges.forEach(function (name, i) { if (name) list.push({ name: name, idx: i, total: t[i] }); });
    list.sort(function (a, b) { return b.total - a.total || a.idx - b.idx; });
    return list;
  }

  var ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th"];

  function timeText(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  }

  window.Cup = { SLOTS: SLOTS, ORD: ORD, loadActivities: loadActivities, loadScores: loadScores, normalize: normalize,
    el: el, cellValue: cellValue, totals: totals, standings: standings, timeText: timeText };
})();
