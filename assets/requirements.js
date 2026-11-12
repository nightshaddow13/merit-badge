// One list of merit badge requirements for both badges, shared by the Scout logs and the counselor dashboards.
// Wording is a short paraphrase of the class tracker (counselor/files/cybersecurity/warden-sign-off-tracker.xlsx);
// confirm the official wording in Scoutbook. `auto` names the log section that checks the requirement by itself
// (Warden Log section key). Everything else is checked off by the counselor.
(function (g) {
  var CY = [
    ["1a", "1 Safety", "Before class", "Watched the Digital Safety video with a parent or guardian."],
    ["1b", "1 Safety", "Hunt for Hidden Doors", "Explained how to protect a digital footprint and showed privacy settings."],
    ["1c", "1 Safety", "Digital safety", "Discussed first aid and prevention for device injuries and safe phone use."],
    ["2a", "2 Ethics", "Scout Law", "Connected three points of the Scout Law to online activities."],
    ["2b", "2 Ethics", "Line of Oaths", "Discussed ethical and unethical online behavior."],
    ["3a", "3 Basics", "Fundamentals", "Described three types of computer systems that need protection."],
    ["3b", "3 Basics", "Three Pillars trial", "Explained the CIA Triad and why it matters."],
    ["4a", "4 Threats", "Threats", "Defined vulnerability, threat and exploit with examples."],
    ["4b", "4 Threats", "Locked Vault", "Explained one type of malware, its harm and a defense."],
    ["4c", "4 Threats", "Public Wi-Fi", "Identified two risks of public Wi-Fi and how to reduce them."],
    ["4d", "4 Threats", "Masked Messengers", "Described spoofing and phishing and how to recognize them.", ""],
    ["4e", "4 Threats", "Herald Dispatch", "Reported on a recent incident and what it cost the victim.", "breach"],
    ["4f", "4 Threats", "Count the Open Gates", "Listed their own cyber attack surface.", "surface"],
    ["5a", "5 Defenses", "Defenses", "Described three technologies that defend a computer or network."],
    ["5b", "5 Defenses", "Updates", "Explained why updates matter and checked for the latest ones."],
    ["5c1", "5 Defenses", "Choose three tasks", "System security task #1, done with permission and discussed."],
    ["5c2", "5 Defenses", "Choose three tasks", "System security task #2."],
    ["5c3", "5 Defenses", "Choose three tasks", "System security task #3."],
    ["6a", "6 Crypto", "Sealed Scroll", "Researched three uses of encryption and why each matters."],
    ["6b", "6 Crypto", "Is it encrypted?", "Showed how to tell if a website connection is encrypted."],
    ["6c", "6 Crypto", "Press the Seal", "Made and compared SHA-256 checksums to show integrity checking.", "seal"],
    ["7", "7 IoT", "Connected Device Draft", "Described four connected devices: benefit, risk and protection.", "objects"],
    ["8", "8 Event", "Cyber Threat Defender", "Took part in a counselor-approved competition."],
    ["9", "9 Jobs", "Homework and class share", "Identified three cybersecurity careers and researched one.", "career"]
  ].map(function (r) { return { code: r[0], group: r[1], when: r[2], text: r[3], auto: r[4] || "" }; });
  var AI = [
    ["1", "Key Concepts", "THE DECODER", "Defined and matched the key AI terms."],
    ["2", "AI Basics", "SLEEPER CELL", "Explained what AI is and is not, and its history."],
    ["3", "Automation", "THE MACHINE ROOM", "Described automation, workflows, triggers and tasks."],
    ["4", "Ethics in AI", "THE MORAL COMPASS", "Discussed bias, privacy and who is responsible when AI is wrong."],
    ["5", "Deepfakes", "MIRROR, MIRROR", "Explained deepfakes and what to do if one targets you."],
    ["6", "AI Skills", "THE INTERROGATION ROOM", "Practiced clear prompts and checking what AI says."],
    ["7", "Train Your Own AI", "THE COUNTER-AGENT", "Planned and shared an AI training project."],
    ["8", "Career Exploration", "THE CHIEF'S BRIEFING", "Explored an AI career and interviewed a professional."]
  ].map(function (r) { return { code: r[0], group: "Req " + r[0], title: r[1], when: r[2], text: r[3], level: +r[0] }; });
  g.MB_REQS = { cy: CY, ai: AI };
  if (typeof module !== "undefined") module.exports = g.MB_REQS;
})(typeof window !== "undefined" ? window : globalThis);
