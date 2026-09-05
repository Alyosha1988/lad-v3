import fs from "fs";
import vm from "vm";

const ctx = { console, module: { exports: {} }, exports: {}, window: {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("voicings.js", "utf8"), ctx);

const { pickVoicingNear, getGuitarVoicings, listVoicingsNear } = ctx;

function sounding(f) {
  return f.filter((x) => x >= 0).length;
}
function contiguous(f) {
  const idx = f.map((x, i) => (x >= 0 ? i : -1)).filter((i) => i >= 0);
  return !idx.length || idx[idx.length - 1] - idx[0] + 1 === idx.length;
}

let failed = 0;
function assert(c, m) {
  if (!c) {
    failed++;
    console.error("FAIL", m);
  } else console.log("ok", m);
}

const amFull = getGuitarVoicings("Am")[0];
const amPartial = { name: "Am без 1", frets: [-1, 0, 2, 2, 1, -1], tags: ["partial"] };
const aFull = pickVoicingNear("Abaug", amFull);
const aPart = pickVoicingNear("Abaug", amPartial);
assert(sounding(aPart.frets) <= sounding(amPartial.frets) + 1, `partial dens ${sounding(aPart.frets)}`);
assert(contiguous(aPart.frets), "partial Abaug contiguous");
assert(sounding(aFull.frets) >= 5, `full dens ${sounding(aFull.frets)}`);

const dm = getGuitarVoicings("Dm")[0];
const e = pickVoicingNear("E7alt", dm);
assert(sounding(e.frets) <= sounding(dm.frets) + 1, `Dm->E7alt dens ${sounding(e.frets)} vs ${sounding(dm.frets)}`);
assert(contiguous(e.frets), "E7alt contiguous");
assert(typeof listVoicingsNear === "function", "listVoicingsNear exported");
assert(listVoicingsNear("Abaug", amPartial, { limit: 2 }).length >= 1, "alts");

const densRef = { frets: amPartial.frets.slice(), tags: ["partial", "shell"] };
const near = listVoicingsNear("Abaug", densRef, { limit: 12 });
const hasSkip = near.some((v) => {
  const idx = v.frets.map((x, i) => (x >= 0 ? i : -1)).filter((i) => i >= 0);
  return idx.length >= 3 && idx[idx.length - 1] - idx[0] + 1 !== idx.length;
});
const hasTriad = near.some((v) => sounding(v.frets) === 3);
assert(hasTriad, "has 3-string shell");
assert(hasSkip, "has skip-one (через одну) shell");

if (failed) process.exit(1);
console.log("\nall passed");
