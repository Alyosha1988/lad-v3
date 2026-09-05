import fs from "fs";
import vm from "vm";

class Ctx {
  constructor() {
    this.font = "";
    this.fillStyle = "";
    this.strokeStyle = "";
    this.lineWidth = 1;
    this.textAlign = "left";
  }
  fillRect() {}
  strokeRect() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  fill() {}
  arc() {}
  closePath() {}
  fillText() {}
  measureText(t) {
    return { width: String(t).length * 7 };
  }
  arcTo() {}
}

const document = {
  createElement: () => ({
    getContext: () => new Ctx(),
    width: 0,
    height: 0,
    toDataURL: () => "data:image/jpeg;base64,xx",
  }),
};
const localStorage = {
  store: { "lad-riff-solo-phrase-flavor": "simple" },
  getItem(k) {
    return this.store[k] ?? null;
  },
  setItem(k, v) {
    this.store[k] = String(v);
  },
  removeItem(k) {
    delete this.store[k];
  },
};

const state = {
  slots: [
    { symbol: "Am", voicing: { name: "Am open", frets: [-1, 0, 2, 2, 1, 0] } },
    { symbol: "Dm", voicing: { name: "Dm", frets: [-1, -1, 0, 2, 3, 1] } },
    { symbol: "E7", voicing: { name: "E7", frets: [0, 2, 0, 1, 0, 0] } },
  ],
  soloPhraseFlavor: "simple",
};

const ctx = {
  console,
  document,
  localStorage,
  state,
  window: {},
  module: { exports: {} },
  exports: {},
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);

for (const f of ["voicings.js", "fingering.js", "theory.js", "export.js"]) {
  vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f });
}

let failed = 0;
function assert(c, m) {
  if (!c) {
    failed++;
    console.error("FAIL", m);
  } else console.log("ok", m);
}

const mapped = ctx.mapMelodyToNeck([57, 60, 64], { preferCenter: 2 });
assert(!!mapped?.positions?.length, "mapMelodyToNeck positions");
assert(mapped.positions.every((p) => p.step >= 1), "steps numbered");
assert(typeof ctx.renderPhraseFingering([57, 60, 64], { title: "t" }) === "string", "svg fingering");
assert(ctx.renderPhraseFingering([57, 60, 64], { title: "t" }).includes("<svg"), "svg markup");

const data = ctx.collectRiffExportData();
assert(!!data.solo?.slots?.length, "solo export present");
assert(data.solo.slots.length === 3, "solo slots match path");
assert(
  data.solo.slots.every((s) => s.phrases?.length === 2 && s.phrases.every((p) => p.mapped?.positions?.length)),
  "each phrase has neck map"
);

const canvas = ctx.drawSongExportCanvas(data);
assert(canvas.height > 1500, `canvas tall enough for phrases (${canvas.height})`);

if (failed) process.exit(1);
console.log("\nall passed");
