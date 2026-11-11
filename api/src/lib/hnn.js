"use strict";

// Human Neural Network mystery cards.
//
// The answer key (hnncards.json: id, set, role A/B/trick) lives only here on the server; the public site holds
// just opaque-named SVG files. A card is handed out the first time a Scout reveals it and is never handed out
// again to anyone until staff reset the game. Staff can see the whole key and what is left.
//
// `store` is the usual adapter (get/put/list/remove). `deck` defaults to hnncards.json.

const ID_RE = /^[a-f0-9]{16,32}$/;
const MAX_PER_SCOUT = 15;
const txt = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");
const isInt = (n, lo, hi) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;
const url = (id) => "/ai/hnn/" + id + ".svg";

function createHnn(store, deck, rand) {
  deck = deck || require("./hnncards.json"); rand = rand || Math.random;
  const byId = new Map(deck.cards.map((c) => [c.id, c]));
  async function used() { const m = new Map(); for (const r of await store.list()) if (/^c-/.test(r.rowKey) && r.data) m.set(r.data.card, r.data); return m; }
  const label = (c) => c.role === "trick" ? "Trick card: " + deck.sets[c.set].trick : (c.role === "A" ? "A · " + deck.sets[c.set].a : "B · " + deck.sets[c.set].b);

  // Public. body: { id, set, trick?, name? } -> { card: { id, url } } (no answer).
  async function reveal(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 400, body: { error: "Send a JSON object." } };
    if (typeof body.id !== "string" || !ID_RE.test(body.id)) return { status: 400, body: { error: "Missing agent id." } };
    if (!isInt(body.set, 0, deck.sets.length - 1)) return { status: 400, body: { error: "Pick a card set." } };
    const u = await used(), mine = [...u.values()].filter((x) => x.id === body.id).length;
    if (mine >= MAX_PER_SCOUT) return { status: 409, body: { error: "You have used all your mystery cards. Ask your counselor." } };
    const pool = deck.cards.filter((c) => c.set === body.set && (body.trick === true ? c.role === "trick" : c.role !== "trick") && !u.has(c.id));
    if (!pool.length) return { status: 409, body: { error: "No " + (body.trick === true ? "misleading " : "") + "cards left in this set. Ask your counselor to reset the cards." } };
    const c = pool[Math.floor(rand() * pool.length)];
    await store.put("c-" + c.id, { card: c.id, id: body.id, name: txt(body.name, 30), at: new Date().toISOString() });
    return { status: 200, body: { card: { id: c.id, url: url(c.id), set: c.set, trick: c.role === "trick" } } };
  }

  // Public: the answer to a card this Scout was dealt.
  async function answer(body) {
    if (!body || typeof body.id !== "string" || !ID_RE.test(body.id) || typeof body.card !== "string") return { status: 400, body: { error: "Missing card." } };
    const u = await used(), row = u.get(body.card), c = byId.get(body.card);
    if (!c || !row || row.id !== body.id) return { status: 403, body: { error: "That is not your card." } };
    return { status: 200, body: { answer: label(c), trick: c.role === "trick" } };
  }

  // Staff.
  async function staffView() {
    const u = await used();
    const sets = deck.sets.map((s, i) => {
      const cs = deck.cards.filter((c) => c.set === i), left = (f) => cs.filter((c) => f(c) && !u.has(c.id)).length;
      return { a: s.a, b: s.b, total: cs.length, left: left(() => true), leftTrick: left((c) => c.role === "trick") };
    });
    return { status: 200, body: { total: deck.cards.length, used: u.size, sets,
      cards: deck.cards.map((c) => ({ id: c.id, url: url(c.id), set: c.set, answer: label(c), used: u.has(c.id), by: u.has(c.id) ? u.get(c.id).name || "a Scout" : "" })) } };
  }
  async function reset() {
    for (const r of await store.list()) if (/^c-/.test(r.rowKey)) await store.remove(r.rowKey);
    return { status: 200, body: { cleared: true } };
  }
  return { reveal, answer, staffView, reset };
}

module.exports = { createHnn };
