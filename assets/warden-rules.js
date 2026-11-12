// Shared by the Warden Log page, the counselor dashboard and the API: when is a worksheet section started or finished?
(function (g) {
  function has(v) { return typeof v === "string" && v.trim().length > 0; }
  var R = {
    career: { need: function(d){return d.careers.every(has)&&["chosen","daily","why","education","certs","experience","expenses","prospects","salary","advancement","sources","learned"].every(function(k){return has(d[k])})}, any: function(d){return d.careers.some(has)||["chosen","daily","why","education","certs","experience","expenses","prospects","salary","advancement","sources","learned"].some(function(k){return has(d[k])})} },
    surface: { need: function(d){return d.items.some(has)&&has(d.risk)&&has(d.protect)}, any: function(d){return d.items.some(has)||has(d.risk)||has(d.riskText)||has(d.protect)} },
    breach: { need: function(d){return ["headline","what","how","cost","stop","oneline"].every(function(k){return has(d[k])})}, any: function(d){return ["headline","url","what","how","cost","stop","oneline"].some(function(k){return has(d[k])})} },
    seal: { need: function(d){return has(d.tool)&&["msgA","hashA","msgB","hashB","match","changed","whichChar","told","hashVsEnc"].every(function(k){return has(d[k])})}, any: function(d){return ["tool","msgA","hashA","msgB","hashB","match","changed","whichChar","told","hashVsEnc"].some(function(k){return has(d[k])})} },
    objects: { need: function(d){return d.rows.filter(function(r){return has(r.device)&&has(r.why)&&has(r.risk)&&has(r.protect)}).length>=2&&has(d.list)&&has(d.share)&&has(d.shareProtect)}, any: function(d){return has(d.list)||has(d.share)||has(d.shareProtect)||d.rows.some(function(r){return has(r.device)||has(r.why)||has(r.risk)||has(r.protect)})} },
    forgery: { need: function(d){return has(d.fake)&&has(d.how)}, any: function(d){return has(d.fake)||has(d.how)} },
    reflect: { need: function(d){return has(d.learned)&&has(d.lodge)&&has(d.next)}, any: function(d){return has(d.learned)||has(d.lodge)||has(d.next)} },
  };
  // 0 not started, 1 in progress, 2 done, for every section.
  function states(data) { var o = {}; Object.keys(R).forEach(function (k) { var d = (data || {})[k]; o[k] = d ? (R[k].need(d) ? 2 : R[k].any(d) ? 1 : 0) : 0; }); return o; }
  g.WARDEN_RULES = { rules: R, states: states, has: has };
  if (typeof module !== "undefined") module.exports = g.WARDEN_RULES;
})(typeof window !== "undefined" ? window : globalThis);
