"use strict";
// Builds ../index.html: template.html with zxcvbn.js pasted inline, so the page
// has no external scripts. Run:  node build.js
const fs = require("fs");
const path = require("path");
const dir = __dirname;
let lib = fs.readFileSync(path.join(dir, "zxcvbn.js"), "utf8").replace(/\/\/# sourceMappingURL=.*$/m, "");
if (/<\/script/i.test(lib)) throw new Error("zxcvbn.js contains </script - cannot inline");
const tpl = fs.readFileSync(path.join(dir, "template.html"), "utf8");
if (!tpl.includes("/*ZXCVBN*/")) throw new Error("template.html is missing the /*ZXCVBN*/ marker");
const out = tpl.replace("/*ZXCVBN*/", () => lib);
fs.writeFileSync(path.join(dir, "..", "index.html"), out);
console.log("built index.html", Math.round(out.length / 1024) + " KB");
