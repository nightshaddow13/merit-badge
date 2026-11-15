/* CSV cell quoting that defuses spreadsheet formula injection. A cell that starts with = + - @ (or a tab / carriage return)
   would be run as a formula by Excel and Sheets, so it gets a leading apostrophe. Used by the students page (and unit tested). */
(function (root) {
  "use strict";
  function cell(v) {
    v = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function toCsv(rows) { return rows.map(function (r) { return r.map(cell).join(","); }).join("\r\n") + "\r\n"; }
  var api = { cell: cell, toCsv: toCsv };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.CsvSafe = api;
})(typeof window !== "undefined" ? window : this);
