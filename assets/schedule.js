/* Class schedule for the whole site: which badges are active, when each class is, and when each badge is open.
   The counselor sets it on /counselor/schedule.html (saved through /api/schedule). If the schedule cannot be
   loaded, the built-in defaults below apply, so the site never locks itself by accident.
   Keep DEFAULTS in step with api/src/lib/schedule.js (api/test-schedule.js and test-schedule-client.js check). */
(function (root) {
  "use strict";
  var DEFAULTS = {
    cy: { active: true, start: "2026-11-14T14:00:00.000Z", minutes: 180, showFrom: "", showUntil: "" },
    ai: { active: true, start: "2026-11-14T18:00:00.000Z", minutes: 180, showFrom: "", showUntil: "" }
  };
  var NAMES = { cy: "Cybersecurity", ai: "Artificial Intelligence" };
  var TZ = "America/New_York";

  function ms(v) { var t = Date.parse(v); return isFinite(t) ? t : NaN; }

  // Is this badge open to Scouts at `now` (ms)? reason: "" when open, else "off" | "before" | "after".
  // Also the class phase: "before" | "live" | "done".
  function status(cfg, now) {
    var start = ms(cfg.start), end = start + cfg.minutes * 60000;
    var from = cfg.showFrom ? ms(cfg.showFrom) : NaN, until = cfg.showUntil ? ms(cfg.showUntil) : NaN;
    var reason = "";
    if (!cfg.active) reason = "off";
    else if (isFinite(from) && now < from) reason = "before";
    else if (isFinite(until) && now >= until) reason = "after";
    return { open: !reason, reason: reason, phase: now < start ? "before" : now < end ? "live" : "done", start: start, end: end, opensAt: isFinite(from) ? from : NaN, closesAt: isFinite(until) ? until : NaN };
  }

  function fmt(t, opts) { return new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: TZ }, opts)).format(new Date(t)); }
  // "Sat Nov 14 · 9:00 AM–12:00 PM ET"
  function label(cfg) {
    var s = ms(cfg.start), e = s + cfg.minutes * 60000;
    var day = fmt(s, { weekday: "short", month: "short", day: "numeric" }).replace(",", "");
    var t = { hour: "numeric", minute: "2-digit" };
    var sameDay = fmt(s, { day: "numeric" }) === fmt(e, { day: "numeric" });
    return day + " · " + fmt(s, t) + "–" + (sameDay ? "" : fmt(e, { weekday: "short", month: "short", day: "numeric" }).replace(",", "") + " ") + fmt(e, t) + " ET";
  }
  function when(t) { return fmt(t, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(",", "") + " ET"; }

  // Eastern wall-clock time -> UTC ISO string (handles daylight saving). y, m(1-12), d, hh, mm.
  function etToIso(y, m, d, hh, mm) {
    var guess = Date.UTC(y, m - 1, d, hh, mm);
    for (var i = 0; i < 3; i++) {
      var p = {}; new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess)).forEach(function (x) { p[x.type] = +x.value; });
      var shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
      var want = Date.UTC(y, m - 1, d, hh, mm);
      if (shown === want) break;
      guess += want - shown;
    }
    return new Date(guess).toISOString();
  }
  // UTC instant -> { date: "YYYY-MM-DD", time: "HH:MM" } on the Eastern wall clock
  function isoToEt(iso) {
    if (!iso) return { date: "", time: "" };
    var p = {}; new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso)).forEach(function (x) { p[x.type] = x.value; });
    return { date: p.year + "-" + p.month + "-" + p.day, time: p.hour + ":" + p.minute };
  }

  // Resolves { badges, skew, fromServer }. skew = server clock minus this device's clock, so a wrong device clock cannot open or close a badge.
  var loading = null;
  function load() {
    if (loading) return loading;
    var fallback = { badges: JSON.parse(JSON.stringify(DEFAULTS)), skew: 0, fromServer: false };
    loading = new Promise(function (resolve) {
      var done = false, finish = function (v) { if (!done) { done = true; resolve(v); } };
      setTimeout(function () { finish(fallback); }, 4000);
      try {
        fetch("/api/schedule", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
          if (!j || !j.badges) return finish(fallback);
          var out = { badges: {}, skew: isFinite(ms(j.now)) ? ms(j.now) - Date.now() : 0, fromServer: true, updated: j.updated || "" };
          Object.keys(DEFAULTS).forEach(function (k) { out.badges[k] = Object.assign({}, DEFAULTS[k], j.badges[k] || {}); });
          finish(out);
        }).catch(function () { finish(fallback); });
      } catch (e) { finish(fallback); }
    });
    return loading;
  }

  // Resolves true for a signed-in counselor or scorekeeper. Anything else, including no sign-in service, is false.
  var staffP = null;
  function isStaff() {
    if (staffP) return staffP;
    staffP = new Promise(function (resolve) {
      setTimeout(function () { resolve(false); }, 4000);
      try {
        fetch("/.auth/me", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
          var roles = (j && j.clientPrincipal && j.clientPrincipal.userRoles) || [];
          resolve(roles.indexOf("counselor") >= 0 || roles.indexOf("scorekeeper") >= 0);
        }).catch(function () { resolve(false); });
      } catch (e) { resolve(false); }
    });
    return staffP;
  }

  var api = { DEFAULTS: DEFAULTS, NAMES: NAMES, status: status, label: label, when: when, etToIso: etToIso, isoToEt: isoToEt, load: load, isStaff: isStaff };
  root.MBSchedule = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
