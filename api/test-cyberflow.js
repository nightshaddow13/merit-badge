"use strict";
const assert = require("assert");
const { createCyberflow, PAGES, MAX_MESSAGE } = require("./src/lib/cyberflow");

function mem() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null; },
    async put(k, o) { m.set(k, JSON.parse(JSON.stringify(o))); },
  };
}

(async () => {
  const f = createCyberflow(mem());
  let s = (await f.state()).body;
  assert.deepStrictEqual([s.mode, s.page, s.message, s.rev], ["free", "career", "", 0], "starts free");

  // pick a page
  s = (await f.control({ mode: "page", page: "surface" })).body;
  assert.deepStrictEqual([s.mode, s.page, s.rev], ["page", "surface", 1]);
  // hold keeps the page so Resume can go back to it, and takes a message
  s = (await f.control({ mode: "hold", message: "  Eyes up\n front!  " })).body;
  assert.deepStrictEqual([s.mode, s.page, s.message, s.rev], ["hold", "surface", "Eyes up front!", 2]);
  // a message alone changes nothing else
  s = (await f.control({ message: "Back in five" })).body;
  assert.deepStrictEqual([s.mode, s.message, s.rev], ["hold", "Back in five", 3]);
  s = (await f.control({ mode: "board" })).body; assert.strictEqual(s.mode, "board");
  s = (await f.control({ mode: "page", page: "objects" })).body; assert.deepStrictEqual([s.mode, s.page], ["page", "objects"]);
  s = (await f.control({ mode: "free" })).body; assert.strictEqual(s.mode, "free");
  assert.ok(s.updated && !isNaN(new Date(s.updated)));

  // bad input is refused and changes nothing
  const rev = (await f.state()).body.rev;
  for (const bad of [null, [], "x", {}, { mode: "party" }, { page: "nope" }, { page: "__proto__" }, { message: 5 }, { mode: 3 }]) {
    assert.strictEqual((await f.control(bad)).status, 400, JSON.stringify(bad));
  }
  assert.strictEqual((await f.state()).body.rev, rev);

  // message is clamped and stripped of control characters
  s = (await f.control({ message: "x".repeat(500) + "\u0007" })).body;
  assert.strictEqual(s.message.length, MAX_MESSAGE);
  s = (await f.control({ message: "<b>hi</b>" })).body; assert.strictEqual(s.message, "<b>hi</b>", "stored as text; the page shows it with textContent");

  // every page the Warden Log has a tab for is allowed
  const log = require("fs").readFileSync(__dirname + "/../tools/warden-log.html", "utf8");
  PAGES.forEach((p) => assert.ok(log.includes('k:"' + p + '"'), "Warden Log has a " + p + " tab"));
  // tab order: Warden Log SPEC order == API order == Run the class buttons
  const specKeys = [...log.slice(log.indexOf("var SPEC=["), log.indexOf("function has(")).matchAll(/^ \{k:"(\w+)",n:/gm)].map((m) => m[1]);
  assert.deepStrictEqual([...specKeys, "board"], PAGES, "Warden Log tab order matches PAGES");
  const run = require("fs").readFileSync(__dirname + "/../cybersecurity/scoreboard/run.html", "utf8");
  const runKeys = [...run.match(/var PAGES=\[(.*)\];/)[1].matchAll(/\["(\w+)","/g)].map((m) => m[1]);
  assert.deepStrictEqual(runKeys, PAGES.filter((p) => p !== "board"), "Run the class lists every page in order (the Scoreboard button is its own mode, not a page)");
  console.log("cyberflow tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
