// One place to read the app's source files from.
//
// The settings window used to be a single 243 KB file, so every test read
// settings.html and searched it for markup, styles and logic alike. It is now
// three files, and a test that means "is this control in the markup" should not
// pass because the string appears in a comment in the script.
//
// Normalised to LF: Windows checks the repo out with CRLF and the extractors
// below match on line ends.

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const DIR = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(DIR, name), "utf8").replace(/\r\n/g, "\n");

const MAIN = read("main.cjs");
const PRELOAD = read("preload.cjs");
const HTML = read("settings.html");
const JS = read("settings.js");
const CSS = read("settings.css");

// Pull a top-level `function name(...) { ... }` out of a source by brace
// matching. The parameter list is skipped first: a destructured or defaulted
// parameter has braces of its own, and a naive search lands inside it. That has
// bitten this suite twice.
function extractFrom(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `could not find function ${name}`);
  let i = src.indexOf("(", start);
  let parens = 0;
  for (; i < src.length; i++) {
    if (src[i] === "(") parens++;
    else if (src[i] === ")") { parens--; if (parens === 0) { i++; break; } }
  }
  const open = src.indexOf("{", i);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

function extractConstFrom(src, name) {
  const m = new RegExp("const " + name + " = ([\\s\\S]*?);\\n", "m").exec(src);
  assert.ok(m, `could not find const ${name}`);
  return `const ${name} = ${m[1]};`;
}

module.exports = { DIR, read, MAIN, PRELOAD, HTML, JS, CSS, extractFrom, extractConstFrom };
