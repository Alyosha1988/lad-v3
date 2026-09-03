/**
 * PDF + соло над риффом.
 * node test-riff-export.mjs
 */
import fs from "fs";
import vm from "vm";

const ctx = {
  console,
  module: { exports: {} },
  exports: {},
  window: {},
  document: { createElement: () => ({ getContext: () => ({}) }) },
  localStorage: {
    getItem: () => "1",
    setItem: () => {},
    removeItem: () => {},
  },
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ["voicings.js", "detect.js", "theory.js"]) {
  vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f });
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  } else console.log("ok:", msg);
}

const item = { path: ["Am", "G", "C", "F"], start: "Am", mood: "dark", why: "рифф", family: "рифф" };
const sug = ctx.LadTheory.suggestSoloModes(item, { moodId: "dark" });
assert(!!sug?.modes?.length, `solo modes (${sug?.modes?.length})`);
assert(sug.modes.length >= 2 && sug.modes.length <= 4, `2–3 modes (${sug.modes.map((m) => m.id).join(",")})`);
assert(sug.home === "A" || sug.start?.startsWith("A"), `center ${sug.home} / ${sug.start}`);

const itemC = { path: ["C", "G", "Am", "F"], start: "C", mood: "bright" };
const sugC = ctx.LadTheory.suggestSoloModes(itemC, { moodId: "bright" });
assert(!!sugC?.modes?.length, `major path modes (${sugC?.modes?.map((m) => m.id).join(",")})`);

const pass = ctx.LadTheory.passportForPdf(item, { moodId: "dark", start: "Am" });
assert(!!pass.degrees, `passport degrees ${pass.degrees}`);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
