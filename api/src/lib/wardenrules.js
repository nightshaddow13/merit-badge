// Shared by the Warden Log page, the counselor dashboard and the API: when is a worksheet section started or finished?
// Only the career worksheet (req 9) and the attack surface list (req 4f) ask a Scout to write anything.
(function (g) {
  function has(v) { return typeof v === "string" && v.trim().length > 0; }
  function none() { return false; }
  var R = {
    career: { need: function(d){return d.careers.every(has)&&["chosen","education","certs","experience","expenses","prospects","salary","advancement"].every(function(k){return has(d[k])})}, any: function(d){return d.careers.some(has)||["chosen","daily","why","education","certs","experience","expenses","prospects","salary","advancement","sources","learned"].some(function(k){return has(d[k])})} },
    surface: { need: function(d){return d.items.some(has)}, any: function(d){return d.items.some(has)} },
    // Nothing here has to be written: the requirement is discussed or demonstrated and the counselor signs it off.
    // These stay in the list (with no work to check) so older saved logs and the class grid keep working.
    breach: { need: none, any: none },
    seal: { need: none, any: none },
    objects: { need: none, any: none },
    forgery: { need: none, any: none },
    reflect: { need: none, any: none },
  };
  // 0 not started, 1 in progress, 2 done, for every section.
  function states(data) { var o = {}; Object.keys(R).forEach(function (k) { var d = (data || {})[k]; o[k] = d ? (R[k].need(d) ? 2 : R[k].any(d) ? 1 : 0) : 0; }); return o; }
  g.WARDEN_RULES = { rules: R, states: states, has: has };
  if (typeof module !== "undefined") module.exports = g.WARDEN_RULES;
})(typeof window !== "undefined" ? window : globalThis);
