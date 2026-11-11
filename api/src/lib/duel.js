"use strict";

// Prompt Duel (Level 6). Squads each submit one rewritten prompt and the output it produced; staff reveal them
// without squad names, the room votes (one vote per Scout, never for your own squad), and staff show the result.
//
// phases: off -> write (squads submit) -> vote (entries shown anonymously, numbered) -> results (tally + squad names)
// `store` is the usual adapter (get/put/list/remove).

const ID_RE = /^[a-f0-9]{16,32}$/;
const NAME_RE = /^[A-Za-z][A-Za-z'.\- ]{0,22}[A-Za-z.]$/;
const SLOTS = 4;
const META = "meta";
const isInt = (n, lo, hi) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;
const txt = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, max) : "");

function createDuel(store, rand) {
  rand = rand || Math.random;
  async function meta() { return (await store.get(META)) || { phase: "off", order: [], gid: 0 }; }
  async function rows(prefix) { return (await store.list()).filter((r) => r.rowKey.startsWith(prefix) && r.data).map((r) => r.data); }

  // Public. body: { id, slot 1-4, name, prompt, output } during the write phase. One entry per squad (last one wins).
  async function submit(body, names) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 400, body: { error: "Send a JSON object." } };
    if (typeof body.id !== "string" || !ID_RE.test(body.id)) return { status: 400, body: { error: "Missing agent id." } };
    if (!isInt(body.slot, 1, SLOTS)) return { status: 400, body: { error: "Choose your squad first." } };
    if (!names[body.slot - 1]) return { status: 409, body: { error: "That squad is not set up yet. Ask your counselor." } };
    const name = txt(body.name, 30);
    if (!NAME_RE.test(name)) return { status: 400, body: { error: "Use your first name and last initial only (like Sam K)." } };
    const prompt = txt(body.prompt, 800), output = txt(body.output, 2000);
    if (prompt.length < 10) return { status: 400, body: { error: "Write your squad’s prompt." } };
    if (output.length < 3) return { status: 400, body: { error: "Paste the output the AI gave you." } };
    const m = await meta();
    if (m.phase !== "write") return { status: 409, body: { error: m.phase === "off" ? "No prompt duel is running right now." : "Submissions are closed." } };
    await store.put("e-" + (body.slot - 1), { slot: body.slot - 1, by: name, prompt, output, at: new Date().toISOString() });
    return { status: 200, body: { saved: true } };
  }

  // Public. body: { id, slot 1-4, vote: the number shown on the card }
  async function vote(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 400, body: { error: "Send a JSON object." } };
    if (typeof body.id !== "string" || !ID_RE.test(body.id)) return { status: 400, body: { error: "Missing agent id." } };
    if (!isInt(body.slot, 1, SLOTS)) return { status: 400, body: { error: "Choose your squad first." } };
    const m = await meta();
    if (m.phase !== "vote") return { status: 409, body: { error: "Voting is not open." } };
    if (!isInt(body.vote, 1, m.order.length)) return { status: 400, body: { error: "Pick one of the numbered outputs." } };
    const target = m.order[body.vote - 1];
    if (target === body.slot - 1) return { status: 409, body: { error: "You cannot vote for your own squad’s output." } };
    if (await store.get("v-" + body.id + "-" + m.gid)) return { status: 409, body: { error: "You already voted." } };
    await store.put("v-" + body.id + "-" + m.gid, { id: body.id, gid: m.gid, slot: body.slot - 1, n: body.vote, at: new Date().toISOString() });
    return { status: 200, body: { voted: body.vote } };
  }

  // Public state (scoreboard page and Field Logs). id/slot optional: they add this Scout's own entry, vote and "your" number.
  async function state(id, slot, names) {
    const m = await meta(), out = { phase: m.phase, gid: m.gid };
    if (m.phase === "off") return { status: 200, body: out };
    const entries = await rows("e-"); out.submitted = entries.length;
    const s = Number.isInteger(slot) && slot >= 1 && slot <= SLOTS ? slot - 1 : -1;
    if (m.phase === "write") {
      const mine = entries.find((e) => e.slot === s); if (mine) out.mine = { prompt: mine.prompt, output: mine.output, by: mine.by };
      out.squads = entries.map((e) => names[e.slot] || "").filter(Boolean);
      return { status: 200, body: out };
    }
    const votes = (await rows("v-")).filter((v) => v.gid === m.gid);
    const tally = m.order.map(() => 0);
    for (const v of votes) if (isInt(v.n, 1, m.order.length)) tally[v.n - 1]++;
    out.entries = m.order.map((slotIdx, i) => {
      const e = entries.find((x) => x.slot === slotIdx) || { prompt: "", output: "" };
      const o = { n: i + 1, prompt: e.prompt, output: e.output, own: slotIdx === s };
      if (m.phase === "results") Object.assign(o, { squad: names[slotIdx] || "", by: e.by, votes: tally[i] });
      return o;
    });
    out.votes = votes.length;
    if (typeof id === "string" && ID_RE.test(id)) { const mv = votes.find((v) => v.id === id); if (mv) out.myVote = mv.n; }
    if (m.phase === "results") { const top = Math.max(0, ...tally); out.winners = top ? out.entries.filter((e) => e.votes === top).map((e) => e.n) : []; }
    return { status: 200, body: out };
  }

  async function staffView(names) {
    const m = await meta(), entries = await rows("e-"), votes = (await rows("v-")).filter((v) => v.gid === m.gid), body = (await state("", 0, names)).body;
    const tally = m.order.map(() => 0); for (const v of votes) if (isInt(v.n, 1, m.order.length)) tally[v.n - 1]++;
    return { status: 200, body: { phase: m.phase, gid: m.gid, votes: votes.length, tally, order: m.order.map((s) => names[s] || ""),
      entries: entries.map((e) => ({ squad: names[e.slot] || "Squad " + (e.slot + 1), by: e.by, prompt: e.prompt, output: e.output })), public: body } };
  }

  // body: { action: start | reveal | results | end }
  async function control(body, names) {
    const act = body && body.action, m = await meta(), save = (o) => store.put(META, Object.assign(o, { at: new Date().toISOString() }));
    if (act === "start") {
      for (const r of await store.list()) if (/^[ev]-/.test(r.rowKey)) await store.remove(r.rowKey);
      await save({ phase: "write", order: [], gid: (m.gid || 0) + 1 });
    } else if (m.phase === "off" && act !== "reset") return { status: 409, body: { error: "No prompt duel is running." } };
    else if (act === "reveal") {
      if (m.phase !== "write") return { status: 409, body: { error: "Start a duel first." } };
      const slots = (await rows("e-")).map((e) => e.slot);
      if (slots.length < 2) return { status: 409, body: { error: "At least two squads need to submit before you can reveal." } };
      for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
      await save({ phase: "vote", order: slots, gid: m.gid });
    } else if (act === "results") {
      if (m.phase !== "vote") return { status: 409, body: { error: "Reveal the outputs and let the room vote first." } };
      await save({ phase: "results", order: m.order, gid: m.gid });
    } else if (act === "end") await save({ phase: "off", order: [], gid: m.gid });
    else if (act === "reset") { for (const r of await store.list()) if (/^[ev]-/.test(r.rowKey)) await store.remove(r.rowKey); await save({ phase: "off", order: [], gid: m.gid }); }
    else return { status: 400, body: { error: "Unknown action." } };
    return { status: 200, body: (await state("", 0, names)).body };
  }
  return { submit, vote, state, staffView, control };
}

module.exports = { createDuel };
