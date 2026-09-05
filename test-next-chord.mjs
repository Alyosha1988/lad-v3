import fs from "fs";
import vm from "vm";

const ctx = { console, module: { exports: {} }, exports: {}, window: {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("catalog.js", "utf8"), ctx);

const { parseChord, guessKey, degreeMap } = ctx;

function functionalNext(start, last = start) {
  const key = guessKey(parseChord(start));
  const d = degreeMap(key);
  const isMin = key.mode === "minor";
  const roles = isMin
    ? ["V7", "iv", "bVII", "bVI", "bIII", "iim7b5", "v", "IV", "II7", "i"]
    : ["V", "V7", "IV", "vi", "ii", "iii", "bVII", "V7ofV", "V7ofvi", "I"];
  const out = [];
  const seen = new Set();
  for (const deg of roles) {
    const sym = d[deg];
    if (!sym || sym === last || seen.has(sym)) continue;
    seen.add(sym);
    out.push({ deg, sym });
  }
  return { key, out };
}

let failed = 0;
function assert(c, m) {
  if (!c) {
    failed++;
    console.error("FAIL", m);
  } else console.log("ok", m);
}

{
  const { key, out } = functionalNext("Am");
  assert(key.mode === "minor" && key.tonic === "A", "Am → A minor");
  assert(out.length >= 6, `Am next count ${out.length}`);
  const map = Object.fromEntries(out.map((x) => [x.deg, x.sym]));
  assert(map.V7 === "E7", `Am V7=${map.V7}`);
  assert(map.iv === "Dm", `Am iv=${map.iv}`);
  assert(map.bVII === "G", `Am bVII=${map.bVII}`);
  assert(map.bVI === "F", `Am bVI=${map.bVI}`);
  assert(map.bIII === "C", `Am bIII=${map.bIII}`);
}

{
  const { key, out } = functionalNext("C");
  assert(key.mode === "major" && key.tonic === "C", "C → C major");
  assert(out.length >= 6, `C next count ${out.length}`);
  const map = Object.fromEntries(out.map((x) => [x.deg, x.sym]));
  assert(map.V === "G", `C V=${map.V}`);
  assert(map.IV === "F", `C IV=${map.IV}`);
  assert(map.vi === "Am", `C vi=${map.vi}`);
  assert(map.ii === "Dm", `C ii=${map.ii}`);
}

{
  const { out } = functionalNext("Am", "E7");
  assert(!out.some((x) => x.sym === "E7"), "skip current last E7");
  assert(out.some((x) => x.sym === "Dm"), "still offers Dm after E7");
}

assert(typeof degreeMap === "function", "degreeMap exported");

if (failed) process.exit(1);
console.log("\nall passed");
