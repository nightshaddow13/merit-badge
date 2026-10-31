"use strict";
const crypto = require("crypto");

const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32(s) {
  let bits = "";
  for (const ch of s.toUpperCase().replace(/[^A-Z2-7]/g, "")) bits += A.indexOf(ch).toString(2).padStart(5, "0");
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}

// RFC 6238 / 4226 (SHA-1, 6 digits, 30-second step), same as the class QR cards.
function totp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", b32(secret)).update(buf).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, "0");
}

// Accepts the current 30-second window plus one either side. Returns the matching counter or null.
function matchWindow(secret, entered, nowMs) {
  const c = Math.floor(nowMs / 30000);
  for (const d of [0, -1, 1]) if (totp(secret, c + d) === entered) return c + d;
  return null;
}

module.exports = { totp, matchWindow };
