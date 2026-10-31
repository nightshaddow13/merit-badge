"use strict";

// One entry per scoreboard. `rule(rowId)` returns the allowed point range for a
// row, or null if the row id is not part of that board. Keep this in step with
// each board's rows.json (api/test.js checks that they match).
const BOARDS = {
  cybersecurity: {
    rowKey: "current", // kept as "current" so scores saved before the AI board existed still load
    slots: 6,
    levels: false,
    rule: (id) => (/^[a-z0-9-]{1,50}$/.test(id) ? { min: -50, max: 100 } : null),
  },
  ai: {
    rowKey: "ai",
    slots: 4,
    levels: true,
    rule: (id) => {
      let m = /^l([1-8])-boss$/.exec(id);
      if (m) return { min: 0, max: m[1] === "7" ? 100 : 50 };
      if (/^l[1-8]-style$/.test(id)) return { min: 0, max: 10 };
      if (id === "side-bonus") return { min: 0, max: 200 };
      if (id === "code-word-bonus") return { min: 0, max: 10 };
      return null;
    },
  },
};

module.exports = { BOARDS };
