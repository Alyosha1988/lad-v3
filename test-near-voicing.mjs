import fs from "fs";
import vm from "vm";

const ctx = { console, module: { exports: {} }, exports: {}, window: {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("voicings.js", "utf8"), ctx);

const { getGuitarVoicings, pickVoicingNear, pickVoicingChain, scoreVoicingNear } = ctx;

let failed = 0;
function assert(c, m) {
  if (!c) {
    failed++;
    console.error("FAIL", m);
  } else console.log("ok", m);
}

const amOpen = getGuitarVoicings("Am")[0];
const amBarre = getGuitarVoicings("Am").find((v) => v.frets?.[0] === 5);
assert(amOpen && amBarre, "Am open + barre exist");

const dmOpenSide = pickVoicingNear("Dm", amOpen);
const dmBarreSide = pickVoicingNear("Dm", amBarre);
assert(dmOpenSide.frets.join() !== dmBarreSide.frets.join(), "Dm near open ≠ Dm near barre");
assert(
  scoreVoicingNear(dmBarreSide, amBarre) <= scoreVoicingNear(dmOpenSide, amBarre),
  "barre Am prefers nearby Dm"
);
assert(
  scoreVoicingNear(dmOpenSide, amOpen) <= scoreVoicingNear(dmBarreSide, amOpen),
  "open Am prefers nearby Dm"
);

const chain = pickVoicingChain(["Am", "Dm", "E7"], amBarre);
assert(chain.length === 3, "chain length 3");
assert(chain[0].frets && chain[1].frets && chain[2].frets, "chain has frets");

if (failed) process.exit(1);
console.log("\nall passed");
