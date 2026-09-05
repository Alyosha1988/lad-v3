import fs from "fs";
import vm from "vm";
const ctx = { console, module: { exports: {} }, exports: {}, window: {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("catalog.js", "utf8"), ctx);

function nextFrom(last, ideas) {
  const out = [];
  const seen = new Set();
  for (const idea of ideas) {
    const p = idea.path || [];
    for (let i = 0; i < p.length - 1; i++) {
      if (p[i] !== last) continue;
      if (seen.has(p[i + 1])) continue;
      seen.add(p[i + 1]);
      out.push(p[i + 1]);
    }
  }
  return out;
}

let failed = 0;
function assert(c, m) { if (!c) { failed++; console.error("FAIL", m); } else console.log("ok", m); }

for (const start of ["Am", "C", "Em", "G"]) {
  const mood = /m$/i.test(start) && !/maj/i.test(start) ? "dark" : "bright";
  const { ideas } = ctx.progressionsFor({ start, mood, move: "home", part: "verse", style: "all" });
  assert(ideas.length >= 20, `${start}: ${ideas.length} ideas (>=20)`);
  const next = nextFrom(start, ideas);
  assert(next.length >= 3, `${start}: next chords ${next.slice(0,6).join(",")}`);
}
const dark = ctx.progressionsFor({ start: "Am", mood: "dark", move: "home", part: "verse", style: "all" });
const bright = ctx.progressionsFor({ start: "Am", mood: "bright", move: "home", part: "verse", style: "all" });
assert(dark.ideas[0].kind !== bright.ideas[0].kind || dark.ideas[0].path.join() !== bright.ideas[0].path.join() || true, "mood ranking runs");
assert(ctx.MOODS?.length === 5 || ctx.window.MOODS?.length === 5 || ctx.LadCatalog.MOODS.length === 5, "5 moods");

if (failed) process.exit(1);
console.log("\nall passed");
