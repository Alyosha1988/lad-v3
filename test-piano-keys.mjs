/**
 * Клавиши: диаграмма без notes не должна ронять UI; detect C–E–G → C.
 * Запуск: node test-piano-keys.mjs
 */
import fs from "fs";
import vm from "vm";

const ctx = { console, module: { exports: {} }, exports: {}, window: {} };
vm.createContext(ctx);
for (const f of ["voicings.js", "detect.js", "fingering.js"]) {
  vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f });
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok:", msg);
  }
}

// 1) renderPianoSvg without item.notes (old crash → only one key stuck in UI)
let threw = null;
let html = "";
try {
  html = ctx.renderPianoSvg({
    symbol: "C",
    midis: [60, 64, 67],
    fingers: ctx.pianoFingers([60, 64, 67]),
  });
} catch (e) {
  threw = e;
}
assert(!threw, `renderPianoSvg without notes does not throw (${threw?.message || "ok"})`);
assert(html.includes("chord-diag-piano"), "piano diagram markup present");
assert(html.includes("C·E·G") || html.includes(">C·E·G<") || /C·E·G/.test(html), `note label derived (${html.match(/<figcaption>[^<]+/)?.[0]})`);

// 2) empty / missing midis → empty string, no throw
threw = null;
try {
  html = ctx.renderPianoSvg({ symbol: "C" });
} catch (e) {
  threw = e;
}
assert(!threw && html === "", "empty midis → empty svg");

// 3) identify C major from midis
const hits = ctx.identifyFromMidis([60, 64, 67]) || [];
assert(hits[0]?.symbol === "C", `CEG detects C (got ${hits[0]?.symbol})`);

// 4) Am
const am = ctx.identifyFromMidis([57, 60, 64]) || [];
assert(am[0]?.symbol === "Am", `ACE detects Am (got ${am[0]?.symbol})`);

// 5) black key left % by white boundaries (same formula as renderPianoBoard)
function blackLeftPct(midi, start = 48, end = 72) {
  const isBlackPc = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
  const whites = [];
  for (let m = start; m <= end; m++) if (!isBlackPc(m)) whites.push(m);
  let before = 0;
  for (const w of whites) {
    if (w < midi) before += 1;
    else break;
  }
  return (before / whites.length) * 100;
}
const oldLinear = (m) => ((m - 48) / (72 - 48)) * 100;
assert(Math.abs(blackLeftPct(49) - 100 / 15) < 0.01, `C# at first white boundary (${blackLeftPct(49).toFixed(2)}%)`);
assert(Math.abs(blackLeftPct(61) - (8 / 15) * 100) < 0.01, `C#4 after C4 = 8/15 (${blackLeftPct(61).toFixed(2)}%)`);
assert(Math.abs(blackLeftPct(49) - oldLinear(49)) > 1, "new layout differs from broken midi-linear for C#3");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
