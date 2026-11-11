"use strict";
// Generates the Human Neural Network mystery cards: opaque-named SVG files in ai/hnn/ and the private answer
// key api/src/lib/hnncards.json (set, role, name per card id). Re-run to rebuild; ids are derived from a seed so
// a rebuild produces the same files. Usage: node tools/gen-hnn-cards.js
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const OUT = path.join(__dirname, "..", "ai", "hnn"), KEY = path.join(__dirname, "..", "api", "src", "lib", "hnncards.json");
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith(".svg")) fs.unlinkSync(path.join(OUT, f));

function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const range = (r, lo, hi) => lo + r() * (hi - lo);
const f1 = (n) => Math.round(n * 10) / 10;
const BG = ["#E8F0E8", "#F3EBDD", "#E4EDF5", "#F2E6EA", "#EFEFD9", "#E6E6F2", "#DFF0EE"];
const wrap = (r, body, rot, sc) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="400" height="400" role="img" aria-label="Mystery card"><rect width="200" height="200" fill="${pick(r, BG)}"/><ellipse cx="100" cy="178" rx="${f1(range(r, 50, 64))}" ry="7" fill="#000" opacity=".12"/><g transform="translate(100 100) rotate(${f1(rot)}) scale(${f1(sc)}) translate(-100 -100)">${body}</g></svg>`;
const hl = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" opacity=".38" transform="rotate(-30 ${cx} ${cy})"/>`;

// ---- Set 0: Apple (A) vs Tomato (B), trick: red ball ----
function apple(r) {
  const col = pick(r, [["#C8282D", "#8E1417"], ["#D93A2B", "#9A1F14"], ["#7FB539", "#4F7F1E"], ["#E8B923", "#C4561E"], ["#B01E2E", "#6E0F1B"]]);
  const stem = `<path d="M100 60 C 100 45, 104 35, 112 28" stroke="#5B3A1E" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  const leaf = `<path d="M106 40 C 118 24, 140 26, 146 34 C 136 46, 118 48, 106 40Z" fill="#4C9A2A"/>`;
  return `<defs><radialGradient id="g" cx=".38" cy=".35" r=".8"><stop offset="0" stop-color="${col[0]}"/><stop offset="1" stop-color="${col[1]}"/></radialGradient></defs>` +
    `<path d="M100 64 C 62 40, 26 72, 36 118 C 46 168, 84 188, 100 174 C 116 188, 154 168, 164 118 C 174 72, 138 40, 100 64Z" fill="url(#g)"/>${stem}${r() < .8 ? leaf : ""}${hl(70, 88, 12, 22)}`;
}
function tomato(r) {
  const col = pick(r, [["#E03A22", "#A8200F"], ["#D8301F", "#8F1A0E"], ["#EA5A28", "#B23A12"], ["#C92A24", "#8A150F"], ["#E8B42A", "#C47A12"]]);
  const n = 5 + Math.floor(r() * 3); let star = "";
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + range(r, -.2, .2); const x = 100 + Math.cos(a) * 34, y = 68 + Math.sin(a) * 14; star += `<path d="M100 70 Q ${f1((100 + x) / 2)} ${f1(58 + (y - 58) * .4)} ${f1(x)} ${f1(y)} Q ${f1((100 + x) / 2)} ${f1(80 + (y - 70) * .3)} 100 70Z" fill="#3E8B2A"/>`; }
  return `<defs><radialGradient id="g" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="${col[0]}"/><stop offset="1" stop-color="${col[1]}"/></radialGradient></defs>` +
    `<ellipse cx="100" cy="112" rx="${f1(range(r, 68, 76))}" ry="${f1(range(r, 56, 64))}" fill="url(#g)"/>${star}<rect x="97" y="52" width="6" height="16" rx="3" fill="#3A7A22"/>${hl(70, 96, 10, 18)}`;
}
function redBall(r) {
  const kind = Math.floor(r() * 3), c = pick(r, ["#D62828", "#E0302A", "#C41E3A"]);
  if (kind === 0) return `<defs><radialGradient id="g" cx=".38" cy=".35" r=".8"><stop offset="0" stop-color="#FF6B5E"/><stop offset="1" stop-color="${c}"/></radialGradient></defs><circle cx="100" cy="102" r="66" fill="url(#g)"/>${hl(74, 76, 12, 22)}`;
  if (kind === 1) return `<defs><radialGradient id="g" cx=".38" cy=".35" r=".8"><stop offset="0" stop-color="#FF6B5E"/><stop offset="1" stop-color="${c}"/></radialGradient></defs><ellipse cx="100" cy="86" rx="52" ry="62" fill="url(#g)"/><path d="M94 146 L106 146 L100 156Z" fill="${c}"/><path d="M100 156 C 90 168, 112 176, 100 188" stroke="#555" stroke-width="2" fill="none"/>${hl(78, 62, 9, 18)}`;
  return `<circle cx="100" cy="102" r="66" fill="${c}"/><path d="M42 80 Q100 50 158 80" stroke="#fff" stroke-width="8" fill="none" opacity=".85"/><path d="M36 112 Q100 140 164 112" stroke="#fff" stroke-width="8" fill="none" opacity=".85"/>${hl(76, 78, 12, 20)}`;
}

// ---- Set 1: Cat (A) vs Dog (B), trick: fox ----
function furs(r) { return pick(r, [["#C9A27A", "#8A6A48"], ["#E39A4B", "#B8691F"], ["#6E6E73", "#45454A"], ["#2E2E33", "#17171A"], ["#F1ECE4", "#C9C2B6"], ["#8B5A3C", "#5C3720"], ["#D9C8A9", "#A8946E"]]); }
const eye = (x, y, r0, col, slit) => `<ellipse cx="${x}" cy="${y}" rx="${r0}" ry="${slit ? r0 + 2 : r0}" fill="${col}"/>${slit ? `<ellipse cx="${x}" cy="${y}" rx="2" ry="${r0 + 1}" fill="#111"/>` : `<circle cx="${x}" cy="${y}" r="${f1(r0 / 2)}" fill="#111"/><circle cx="${x + 2}" cy="${y - 2}" r="1.8" fill="#fff"/>`}`;
function cat(r) {
  const [c1, c2] = furs(r), ec = pick(r, ["#8FD14F", "#F2C94C", "#6FB7E9"]);
  let s = `<path d="M44 78 L52 24 L88 56Z" fill="${c1}"/><path d="M156 78 L148 24 L112 56Z" fill="${c1}"/><path d="M54 64 L57 40 L76 56Z" fill="#E8A0AE"/><path d="M146 64 L143 40 L124 56Z" fill="#E8A0AE"/><ellipse cx="100" cy="108" rx="60" ry="54" fill="${c1}"/>`;
  if (r() < .6) s += `<path d="M96 56 L96 76 M84 58 L86 72 M108 58 L106 72" stroke="${c2}" stroke-width="5" stroke-linecap="round"/>`;
  s += eye(78, 100, 9, ec, true) + eye(122, 100, 9, ec, true) + `<path d="M94 118 L106 118 L100 126Z" fill="#E8798F"/><path d="M100 126 Q100 136 90 136 M100 126 Q100 136 110 136" stroke="#333" stroke-width="2" fill="none"/>`;
  s += `<path d="M70 124 L30 116 M70 130 L30 134 M130 124 L170 116 M130 130 L170 134" stroke="#fff" stroke-width="2" opacity=".85"/>`;
  return s;
}
function dog(r) {
  const [c1, c2] = furs(r);
  let s = `<ellipse cx="46" cy="96" rx="22" ry="44" fill="${c2}" transform="rotate(14 46 96)"/><ellipse cx="154" cy="96" rx="22" ry="44" fill="${c2}" transform="rotate(-14 154 96)"/><ellipse cx="100" cy="104" rx="56" ry="54" fill="${c1}"/>`;
  if (r() < .5) s += `<ellipse cx="${r() < .5 ? 76 : 124}" cy="92" rx="22" ry="24" fill="${c2}" opacity=".85"/>`;
  s += `<ellipse cx="100" cy="132" rx="30" ry="22" fill="${c1 === "#F1ECE4" ? "#E4DCCD" : "#F1E3CC"}"/>` + eye(80, 96, 7, "#4A2E14", false) + eye(120, 96, 7, "#4A2E14", false) +
    `<ellipse cx="100" cy="122" rx="12" ry="9" fill="#1B1B1E"/><path d="M100 131 L100 140 M100 140 Q90 148 82 140 M100 140 Q110 148 118 140" stroke="#222" stroke-width="2.5" fill="none"/>`;
  if (r() < .5) s += `<path d="M92 142 Q100 164 108 142Z" fill="#E8798F"/>`;
  return s;
}
function fox(r) {
  const o = pick(r, ["#E4702A", "#D9611E", "#EA8236"]);
  return `<path d="M40 82 L48 22 L88 56Z" fill="${o}"/><path d="M160 82 L152 22 L112 56Z" fill="${o}"/><path d="M45 44 L48 22 L64 36Z" fill="#222"/><path d="M155 44 L152 22 L136 36Z" fill="#222"/>` +
    `<path d="M40 90 Q100 40 160 90 Q150 150 100 176 Q50 150 40 90Z" fill="${o}"/><path d="M40 100 Q80 112 100 150 Q120 112 160 100 Q150 150 100 176 Q50 150 40 100Z" fill="#FBF3E8"/>` +
    eye(76, 98, 6, "#F2B84B", true) + eye(124, 98, 6, "#F2B84B", true) + `<ellipse cx="100" cy="160" rx="8" ry="6" fill="#1B1B1E"/>`;
}

// ---- Set 2: Soccer ball (A) vs Basketball (B), trick: tennis ball ----
function pent(cx, cy, rad, rot) { let d = ""; for (let i = 0; i < 5; i++) { const a = rot + i * 2 * Math.PI / 5 - Math.PI / 2; d += (i ? "L" : "M") + f1(cx + Math.cos(a) * rad) + " " + f1(cy + Math.sin(a) * rad); } return d + "Z"; }
function soccer(r) {
  const c = pick(r, ["#1B1B1E", "#1B1B1E", "#1D4ED8", "#B91C1C", "#15803D"]), bg = pick(r, ["#FFFFFF", "#F7F7F2", "#FFF8E7"]);
  let s = `<defs><radialGradient id="g" cx=".38" cy=".33" r=".85"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${bg}"/></radialGradient><clipPath id="k"><circle cx="100" cy="102" r="66"/></clipPath></defs><circle cx="100" cy="102" r="66" fill="url(#g)" stroke="#999" stroke-width="1.5"/><g clip-path="url(#k)"><path d="${pent(100, 102, 20, 0)}" fill="${c}"/>`;
  for (let i = 0; i < 5; i++) { const a = i * 2 * Math.PI / 5 - Math.PI / 2, x = 100 + Math.cos(a) * 62, y = 102 + Math.sin(a) * 62; s += `<path d="${pent(x, y, 18, a + Math.PI / 5)}" fill="${c}"/><path d="M${f1(100 + Math.cos(a) * 20)} ${f1(102 + Math.sin(a) * 20)} L${f1(100 + Math.cos(a) * 46)} ${f1(102 + Math.sin(a) * 46)}" stroke="${c}" stroke-width="2.5"/>`; }
  return s + `</g>${hl(74, 76, 10, 20)}`;
}
function basket(r) {
  const o = pick(r, [["#E8772E", "#B8501A"], ["#D9661F", "#A04012"], ["#EE8A3A", "#C25E1E"]]);
  return `<defs><radialGradient id="g" cx=".38" cy=".33" r=".85"><stop offset="0" stop-color="${o[0]}"/><stop offset="1" stop-color="${o[1]}"/></radialGradient><clipPath id="k"><circle cx="100" cy="102" r="66"/></clipPath></defs><circle cx="100" cy="102" r="66" fill="url(#g)"/><g clip-path="url(#k)" stroke="#2A1A10" stroke-width="3.2" fill="none"><path d="M100 36 V168"/><path d="M34 102 H166"/><path d="M52 52 Q100 102 52 152"/><path d="M148 52 Q100 102 148 152"/></g>${hl(74, 76, 10, 20)}`;
}
function tennis(r) {
  const y = pick(r, ["#D9E021", "#CBD81C", "#E4EA3A"]);
  return `<defs><radialGradient id="g" cx=".38" cy=".33" r=".85"><stop offset="0" stop-color="#F0F36A"/><stop offset="1" stop-color="${y}"/></radialGradient><clipPath id="k"><circle cx="100" cy="102" r="60"/></clipPath></defs><circle cx="100" cy="102" r="60" fill="url(#g)"/><g clip-path="url(#k)" stroke="#fff" stroke-width="5" fill="none"><path d="M30 60 Q100 100 30 150"/><path d="M170 60 Q100 100 170 150"/></g>${hl(76, 78, 9, 18)}`;
}

const SETS = [
  { a: "Apple", b: "Tomato", draw: [apple, tomato, redBall], trick: "a red ball (it is neither!)" },
  { a: "Cat", b: "Dog", draw: [cat, dog, fox], trick: "a fox (it is neither!)" },
  { a: "Soccer ball", b: "Basketball", draw: [soccer, basket, tennis], trick: "a tennis ball (it is neither!)" },
];
const PER = [22, 22, 12]; // A, B, trick per set
const cards = [];
SETS.forEach((st, si) => {
  [0, 1, 2].forEach((k) => {
    for (let n = 0; n < PER[k]; n++) {
      const r = rng(1000 * si + 100 * k + n + 7);
      const body = st.draw[k](r), svg = wrap(r, body, range(r, -9, 9), range(r, .92, 1.06));
      const id = "m" + crypto.createHash("sha256").update("hnn:" + si + ":" + k + ":" + n).digest("hex").slice(0, 12);
      fs.writeFileSync(path.join(OUT, id + ".svg"), svg);
      cards.push({ id, set: si, role: k === 0 ? "A" : k === 1 ? "B" : "trick" });
    }
  });
});
fs.writeFileSync(KEY, JSON.stringify({ sets: SETS.map((s) => ({ a: s.a, b: s.b, trick: s.trick })), cards }, null, 1) + "\n");
console.log(cards.length + " cards written");
