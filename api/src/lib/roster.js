"use strict";

// Teams and students for one badge ("cy" = Cybersecurity lodges, "ai" = A.I.R.A. squads). Each badge has its own roster.
//
// Teams are the named slots on that badge's scoreboard (board.lodges[i]); a team exists when its name is not empty. The
// scoreboards and live games already work in those slots, so creating, renaming or removing a team just edits the
// names on the scoreboard. Students belong to a team (by slot). Each student has a short password the instructor hands
// out; the student types only that to open their log. The student's `id` is the private key their log is saved under, and
// it is only ever handed back by a correct password (login) or to staff.
//
// stores: students (small store: get/put/list/remove), tries (small store, for login throttling), board ({ load, save }).

const crypto = require("crypto");

const MAX_STUDENTS = 80;           // same as the log backup cap
const MAX_NAME = 40;               // a student's name
const TEAM_NAME = 30;              // matches the scoreboard's name limit (lib/scores.js)
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i
const PW_LEN = 6;
const MAX_BAD_LOGINS_PER_MIN = 40;
const cleanScoutId = (v) => (typeof v === "string" || typeof v === "number" ? String(v).replace(/[^A-Za-z0-9-]/g, "").slice(0, 20) : "");
// "Sam K, 1234567" -> name + optional scouting id (a trailing comma part that contains a digit)
const splitLine = (line) => { const m = typeof line === "string" ? line.match(/^(.*?)[,\t]\s*([A-Za-z0-9-]*\d[A-Za-z0-9-]*)\s*$/) : null; return m ? { name: m[1], scoutId: cleanScoutId(m[2]) } : { name: line, scoutId: "" }; };
const clean = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const normPw = (v) => (typeof v === "string" ? v.toLowerCase().replace(/[\s-]/g, "") : "");
const isInt = (n, lo, hi) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;

function newPassword(taken) {
  for (;;) {
    let pw = "";
    for (let i = 0; i < PW_LEN; i++) pw += ALPHABET[crypto.randomInt(ALPHABET.length)];
    if (!taken.has(pw)) return pw;
  }
}
const newId = () => crypto.randomBytes(8).toString("hex");

function createRoster(stores) {
  const students = stores.students, tries = stores.tries, board = stores.board;

  async function all() {
    const rows = (await students.list()).map((r) => r.data);
    rows.sort((a, b) => ((a.slot === null ? -1 : a.slot) - (b.slot === null ? -1 : b.slot)) || a.name.localeCompare(b.name) || (a.created < b.created ? -1 : 1));
    return rows;
  }
  const teamsOf = (data) => (data.lodges || []).map((name, i) => ({ slot: i, name: String(name || "") })).filter((t) => t.name);
  const publicStudent = (s) => ({ id: s.id, name: s.name, slot: s.slot, password: s.password, scoutId: s.scoutId || "", created: s.created });

  // ---- staff ----
  async function list() {
    const data = await board.load();
    const rows = await all();
    return { status: 200, body: { teams: teamsOf(data), slots: (data.lodges || []).length, students: rows.map(publicStudent), max: MAX_STUDENTS } };
  }

  async function addTeam(body) {
    const name = clean(body && body.name, TEAM_NAME);
    if (!name) return { status: 400, body: { error: "Give the team a name." } };
    const data = await board.load();
    if ((data.lodges || []).some((n) => String(n).toLowerCase() === name.toLowerCase())) return { status: 409, body: { error: "There is already a team with that name." } };
    const slot = (data.lodges || []).findIndex((n) => !String(n || "").trim());
    if (slot < 0) return { status: 409, body: { error: "This badge already has the most teams it can hold (" + (data.lodges || []).length + ")." } };
    data.lodges[slot] = name;
    await board.save(data);
    return { status: 200, body: { team: { slot, name } } };
  }

  async function renameTeam(body) {
    const data = await board.load();
    if (!body || !isInt(body.slot, 0, (data.lodges || []).length - 1) || !String(data.lodges[body.slot] || "").trim()) return { status: 404, body: { error: "No such team." } };
    const name = clean(body.name, TEAM_NAME);
    if (!name) return { status: 400, body: { error: "Give the team a name." } };
    if (data.lodges.some((n, i) => i !== body.slot && String(n).toLowerCase() === name.toLowerCase())) return { status: 409, body: { error: "There is already a team with that name." } };
    data.lodges[body.slot] = name;
    await board.save(data);
    return { status: 200, body: { team: { slot: body.slot, name } } };
  }

  // A team can only be removed once it has no students. Its points are cleared too, so a new team that later takes the
  // same slot does not inherit them. body: { slot, confirm: true }
  async function removeTeam(body) {
    const data = await board.load();
    if (!body || !isInt(body.slot, 0, (data.lodges || []).length - 1) || !String(data.lodges[body.slot] || "").trim()) return { status: 404, body: { error: "No such team." } };
    if (body.confirm !== true) return { status: 400, body: { error: "Confirm removing the team." } };
    if ((await all()).some((s) => s.slot === body.slot)) return { status: 409, body: { error: "Move or remove the students on this team first." } };
    data.lodges[body.slot] = "";
    Object.keys(data.scores || {}).forEach((id) => { if (Array.isArray(data.scores[id])) data.scores[id][body.slot] = null; });
    await board.save(data);
    return { status: 200, body: { removed: true } };
  }

  // body: { names: [..] or "one per line", slot }. Adds each name with a fresh password and returns them.
  async function addStudents(body) {
    if (!body || typeof body !== "object") return { status: 400, body: { error: "Send a JSON object." } };
    const data = await board.load();
    const slot = body.slot === undefined || body.slot === null || body.slot === "" ? null : body.slot;
    if (slot !== null && (!isInt(slot, 0, (data.lodges || []).length - 1) || !String(data.lodges[slot] || "").trim())) return { status: 400, body: { error: "No such team." } };
    const raw = Array.isArray(body.names) ? body.names : typeof body.names === "string" ? body.names.split(/\r?\n/) : [];
    const parsed = raw.map(splitLine).map((p) => ({ name: clean(p.name, MAX_NAME), scoutId: p.scoutId })).filter((p) => p.name);
    const names = parsed;
    if (!names.length) return { status: 400, body: { error: "Type at least one name." } };
    const rows = await all();
    if (rows.length + names.length > MAX_STUDENTS) return { status: 409, body: { error: "A badge holds up to " + MAX_STUDENTS + " students. You have " + rows.length + "." } };
    const taken = new Set(rows.map((s) => s.password)), added = [];
    for (const { name, scoutId } of names) {
      const s = { id: newId(), name, scoutId, slot, password: newPassword(taken), created: new Date().toISOString() };
      taken.add(s.password);
      await students.put("s-" + s.id, s);
      added.push(publicStudent(s));
    }
    return { status: 200, body: { added } };
  }

  // body: { id, name?, slot?, resetPassword?: true }
  async function updateStudent(body) {
    if (!body || typeof body.id !== "string") return { status: 400, body: { error: "Missing student." } };
    const s = await students.get("s-" + body.id);
    if (!s) return { status: 404, body: { error: "No such student." } };
    if (body.name !== undefined) { const n = clean(body.name, MAX_NAME); if (!n) return { status: 400, body: { error: "A student needs a name." } }; s.name = n; }
    if (body.scoutId !== undefined) s.scoutId = cleanScoutId(body.scoutId); // optional; empty clears it
    if (body.slot !== undefined) {
      if (body.slot === null) s.slot = null; // not on a team yet
      else {
        const data = await board.load();
        if (!isInt(body.slot, 0, (data.lodges || []).length - 1) || !String(data.lodges[body.slot] || "").trim()) return { status: 400, body: { error: "No such team." } };
        s.slot = body.slot;
      }
    }
    if (body.resetPassword === true) s.password = newPassword(new Set((await all()).map((x) => x.password)));
    await students.put("s-" + s.id, s);
    return { status: 200, body: { student: publicStudent(s) } };
  }

  // Removes the student and their password. Their saved log is kept by the log code (it stays readable by staff).
  async function removeStudent(body) {
    if (!body || typeof body.id !== "string") return { status: 400, body: { error: "Missing student." } };
    if (body.confirm !== true) return { status: 400, body: { error: "Confirm removing the student." } };
    await students.remove("s-" + body.id);
    return { status: 200, body: { removed: true } };
  }

  // ---- public ----
  // body: { password }. Returns { id, name, slot, team } for a correct password. Wrong guesses are counted per minute
  // (for the whole badge) so the short password cannot be guessed by a script.
  async function login(body) {
    // A device that already signed in can refresh who it is (name, team) by id; the id is as private as the log it opens.
    if (body && typeof body.id === "string" && /^[a-f0-9]{16,32}$/.test(body.id)) {
      const me = await find(body.id);
      return me ? { status: 200, body: me } : { status: 404, body: { error: "That sign-in is no longer valid. Type your password again." } };
    }
    const pw = normPw(body && body.password);
    if (pw.length < 4 || pw.length > 12) return { status: 400, body: { error: "Type the password your instructor gave you." } };
    const bucket = "m" + Math.floor(Date.now() / 60000);
    const t = (await tries.get(bucket)) || { n: 0 };
    if (t.n >= MAX_BAD_LOGINS_PER_MIN) return { status: 429, body: { error: "Too many wrong passwords. Wait a minute and try again." } };
    const s = (await all()).find((x) => x.password === pw);
    if (!s) { t.n += 1; await tries.put(bucket, t); return { status: 401, body: { error: "That password is not right. Check it with your instructor." } }; }
    const data = await board.load();
    return { status: 200, body: { id: s.id, name: s.name, slot: s.slot, scoutId: s.scoutId || "", team: (s.slot === null ? "" : String((data.lodges || [])[s.slot] || "")) } };
  }

  // For the log code: who is this student id (or null), and what is their team called?
  async function find(id) {
    if (typeof id !== "string") return null;
    const s = await students.get("s-" + id);
    if (!s) return null;
    const data = await board.load();
    return { id: s.id, name: s.name, slot: s.slot, scoutId: s.scoutId || "", team: (s.slot === null ? "" : String((data.lodges || [])[s.slot] || "")) };
  }

  // For dashboards: every student with their current team name (no passwords).
  async function directory() {
    const data = await board.load(), out = new Map();
    for (const s of await all()) out.set(s.id, { id: s.id, name: s.name, slot: s.slot, scoutId: s.scoutId || "", team: (s.slot === null ? "" : String((data.lodges || [])[s.slot] || "")) });
    return out;
  }

  return { list, addTeam, renameTeam, removeTeam, addStudents, updateStudent, removeStudent, login, find, all, directory };
}

module.exports = { createRoster, MAX_STUDENTS, PW_LEN, ALPHABET };
