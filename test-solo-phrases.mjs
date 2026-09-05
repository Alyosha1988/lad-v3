import fs from "fs";
import vm from "vm";

const ctx = { console, module: { exports: {} }, exports: {}, window: {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("theory.js", "utf8"), ctx);

const T = ctx.LadTheory;
let failed = 0;
function assert(c, m) {
  if (!c) {
    failed++;
    console.error("FAIL", m);
  } else console.log("ok", m);
}

assert(typeof T.suggestSoloPhrases === "function", "suggestSoloPhrases exported");
assert(typeof T.soloPhraseTitle === "function", "soloPhraseTitle exported");

const modes = T.suggestSoloModes({ path: ["Am", "Dm", "E7"], start: "Am", mood: "dark" });
assert(modes?.modes?.length >= 1, "modes for Am path");
const top = modes.modes[0];

const simple = T.suggestSoloPhrases({ path: ["Am", "Dm", "E7"], start: "Am" }, top, {
  flavor: "simple",
});
assert(simple?.slots?.length === 3, "3 slots");
assert(simple.slots.every((s) => s.phrases?.length === 2), "2 phrases per slot");
assert((simple.pathMidis || []).length >= 9, "path midis from lead phrases");
assert(
  simple.slots.every((s) =>
    s.phrases.every((p) => p.midis.length >= 3 && p.notes.length === p.midis.length)
  ),
  "phrase notes/midis"
);
assert(
  simple.slots.every((s) => s.phrases.every((p) => Math.max(...p.midis) <= 81 && Math.min(...p.midis) >= 50)),
  "midi range"
);

const spicy = T.suggestSoloPhrases({ path: ["Am", "Dm", "E7"], start: "Am" }, top, {
  flavor: "spicy",
});
assert(spicy.flavor === "spicy", "spicy flavor");
assert(
  spicy.slots[0].phrases.some((p) => /обход|краск|enclosure|color/i.test(p.titlePlain + p.titlePro)),
  "spicy titles"
);

const title = T.soloPhraseTitle(simple.slots[0].phrases[0], "plain");
assert(!!title && !title.includes("undefined"), "phrase title plain");

if (failed) process.exit(1);
console.log("\nall passed");
