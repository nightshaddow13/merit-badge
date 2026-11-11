"use strict";

// Clears every AI-class game and scorecard in one go: Scouts and their Field Log averages, Class Race,
// What Would You Do, Prompt Duel, Human Neural Network cards, and every manually entered score and the
// "Levels completed" number on the AI scoreboard. Squad names are kept. With opts.logs it also deletes
// every backed-up Field Log and waiver. The Cybersecurity scoreboard is never touched.
async function resetAll({ sb, airalog, hv, wwyd, hnn, duel, fieldlog }, opts) {
  opts = opts || {};
  const data = await sb.load();
  await sb.save(Object.assign({}, data, { scores: {}, levels: 0 }));
  await airalog.reset(sb); // also empties the automatic Field Log rows
  await hv.reset(sb);
  await wwyd.clear();
  await hnn.reset();
  await duel.control({ action: "reset" }, data.lodges || []);
  let logs = 0;
  if (opts.logs && fieldlog) {
    const all = (await fieldlog.list()).body.logs || [];
    for (const l of all) { await fieldlog.remove({ id: l.id }); logs++; }
  }
  return { status: 200, body: { cleared: true, logs } };
}

module.exports = { resetAll };
