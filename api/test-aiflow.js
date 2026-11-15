"use strict";
const assert = require("assert");
const fs = require("fs");
const { createAiflow, PAGES, DISCUSSION, MAX_MESSAGE } = require("./src/lib/aiflow");

function mem() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null; },
    async put(k, o) { m.set(k, JSON.parse(JSON.stringify(o))); },
  };
}

(async () => {
  const f = createAiflow(mem());
  let s = (await f.state()).body;
  assert.deepStrictEqual([s.mode, s.page, s.message, s.rev], ["free", PAGES[0], "", 0], "starts free");

  s = (await f.control({ mode: "page", page: "L3.hist" })).body;
  assert.deepStrictEqual([s.mode, s.page, s.rev], ["page", "L3.hist", 1]);
  // hold keeps the page so Resume can go back to it, and takes a message
  s = (await f.control({ mode: "hold", message: "  Eyes up\n front!  " })).body;
  assert.deepStrictEqual([s.mode, s.page, s.message, s.rev], ["hold", "L3.hist", "Eyes up front!", 2]);
  s = (await f.control({ message: "Back in five" })).body;
  assert.deepStrictEqual([s.mode, s.message, s.rev], ["hold", "Back in five", 3]);
  s = (await f.control({ mode: "board" })).body; assert.strictEqual(s.mode, "board");
  s = (await f.control({ mode: "page", page: "send" })).body; assert.deepStrictEqual([s.mode, s.page], ["page", "send"]);
  s = (await f.control({ mode: "free" })).body; assert.strictEqual(s.mode, "free");
  assert.ok(s.updated && !isNaN(new Date(s.updated)));

  // bad input is refused and changes nothing
  const rev = (await f.state()).body.rev;
  for (const bad of [null, [], "x", {}, { mode: "party" }, { page: "nope" }, { page: "__proto__" }, { page: "L3" }, { message: 5 }, { mode: 3 }]) {
    assert.strictEqual((await f.control(bad)).status, 400, JSON.stringify(bad));
  }
  assert.strictEqual((await f.state()).body.rev, rev);

  // message is clamped and stripped of control characters
  s = (await f.control({ message: "x".repeat(500) + "\u0007" })).body;
  assert.strictEqual(s.message.length, MAX_MESSAGE);
  s = (await f.control({ message: "<b>hi</b>" })).body; assert.strictEqual(s.message, "<b>hi</b>", "stored as text; the page shows it with textContent");

  // pages are unique
  assert.strictEqual(new Set(PAGES).size, PAGES.length, "PAGES has no duplicates");

  // every page the Field Log has a tab for is allowed, in the same order
  const log = fs.readFileSync(__dirname + "/../tools/aira-field-log.html", "utf8");
  const pk = log.match(/var PANEKEYS=(\{[^;]*\});/);
  assert.ok(pk, "Field Log declares PANEKEYS");
  const panes = JSON.parse(pk[1].replace(/(\d+):/g, '"$1":'));
  const fromLog = ["L1", "V1"];
  Object.keys(panes).sort((a, b) => a - b).forEach((n) => panes[n].forEach((k) => fromLog.push("L" + n + "." + k)));
  fromLog.push("send");
  assert.deepStrictEqual(fromLog, PAGES.filter((k) => !DISCUSSION.includes(k)), "Field Log tab order matches PAGES (less the discussion pages)");
  DISCUSSION.forEach((k) => assert.ok(PAGES.includes(k) && !fromLog.includes(k), k + " is a page with no Scout tab"));
  // the PANEKEYS for levels 3-8 are the first section key of each in-page tab in PANES, plus the unlock tab
  const lvDef = log.slice(log.indexOf("var LV={"), log.indexOf("function lvNew"));
  // a section the Field Log still has a writing field for must either have a tab or be marked gone (spoken only); no saved key is deleted
  for (const k of DISCUSSION.filter((x) => x !== "L2.ex")) assert.ok(new RegExp('k:"' + k.split(".")[1] + '"').test(lvDef), k + " keeps its saved-data definition");
  const paneDef = log.match(/var PANES=\{([\s\S]*?)\};\nvar paneSel/)[1];
  for (const n of [3, 4, 5, 6, 7, 8]) {
    const line = paneDef.split("\n").find((l) => l.trim().startsWith(n + ":["));
    const firsts = [...line.matchAll(/\["[^"\\]*(?:\\.[^"\\]*)*",\["(\w+)"/g)].map((m) => m[1]);
    assert.deepStrictEqual(panes[n], [...firsts, "unlock"], "Level " + n + " tabs");
  }
  assert.strictEqual((log.match(/el\("div","stephead"\)/g) || []).length, panes[2].length, "Level 2 has one tab per Step");
  // Run the class lists every page in order
  const run = fs.readFileSync(__dirname + "/../ai/scoreboard/run.html", "utf8");
  const runKeys = [...run.match(/var PAGES=\[([\s\S]*?)\n \];/)[1].matchAll(/\["(\w+(?:\.\w+)?)","/g)].map((m) => m[1]);
  assert.deepStrictEqual(runKeys, PAGES, "Run the class lists every page in order");
  DISCUSSION.forEach((k) => assert.ok(new RegExp('\\["' + k + '","[^"]*","[^"]*Scouts see My requirements').test(run), k + " is labelled on the run page"));
  console.log("aiflow tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
