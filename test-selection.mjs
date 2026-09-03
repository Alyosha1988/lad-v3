/**
 * Логика выбора постановки — без DOM.
 * Запуск: node test-selection.mjs
 */
import fs from "fs";
import vm from "vm";

const ctx = { console, module: { exports: {} }, exports: {}, window: {} };
vm.createContext(ctx);
for (const f of ["voicings.js", "detect.js"]) {
  vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f });
}

const state = {
  inputMode: "guitar",
  frets: [-1, -1, -1, -1, -1, -1],
  piano: [],
  detected: null,
  detectHits: [],
  preferredSymbol: null,
  preferredReason: null,
  selectedVoicingId: null,
  voicingPinned: false,
};

function fretsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((f, i) => Number(f) === Number(b[i]));
}

function boardGripVoicing(symbol) {
  if (!symbol || state.inputMode !== "guitar") return null;
  const frets = state.frets.slice();
  if (!frets.some((f) => f >= 0)) return null;
  return {
    id: `board-gtr-${frets.join(",")}`,
    frets,
    tags: ["board"],
    name: "Ваш захват",
  };
}

function detectNow() {
  const hits = ctx.identifyFromFrets(state.frets) || [];
  state.detectHits = hits;
  const preferred = state.preferredSymbol;
  const prevSym = state.detected?.symbol;
  if (preferred) {
    const hit = hits.find((h) => h.symbol === preferred);
    state.detected = hit || { symbol: preferred, reason: "выбор", score: 0 };
  } else if (prevSym && hits.some((h) => h.symbol === prevSym)) {
    state.detected = hits.find((h) => h.symbol === prevSym) || hits[0] || null;
  } else {
    state.detected = hits[0] || null;
  }
}

function currentVoicings() {
  const sym = state.detected?.symbol;
  if (!sym) return [];
  const list = ctx.getGuitarVoicings(sym).slice();
  const grip = boardGripVoicing(sym);
  if (!grip) return list;
  if (list.find((v) => fretsEqual(v.frets, grip.frets))) return list;
  return [grip, ...list];
}

function resolveSelectedVoicingId(list) {
  if (!list.length) return null;
  if (state.voicingPinned && state.selectedVoicingId) {
    const pinned = list.find((v) => v.id === state.selectedVoicingId);
    if (pinned) return pinned.id;
  }
  const hit = list.find((v) => v.frets && fretsEqual(v.frets, state.frets));
  if (hit) return hit.id;
  const board = list.find((v) => (v.tags || []).includes("board"));
  if (board) return board.id;
  if (state.selectedVoicingId && list.some((v) => v.id === state.selectedVoicingId)) {
    return state.selectedVoicingId;
  }
  return list[0].id;
}

function renderPass() {
  detectNow();
  const list = currentVoicings();
  state.selectedVoicingId = resolveSelectedVoicingId(list);
  return list.find((v) => v.id === state.selectedVoicingId);
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  } else {
    console.log("ok:", msg);
  }
}

// 1) open C → first pass picks matching open C, not random later shape
state.frets = [-1, 3, 2, 0, 1, 0];
let v = renderPass();
assert(v && fretsEqual(v.frets, state.frets), `open C matches grip (${v?.name})`);

// 2) pin second voicing, re-render must keep it (old bug wiped to list[0])
const list = currentVoicings();
assert(list.length >= 2, `enough voicings (${list.length})`);
const second = list[1];
state.selectedVoicingId = second.id;
state.voicingPinned = true;
v = renderPass();
assert(v?.id === second.id, `pinned voicing survives re-detect (${v?.id} vs ${second.id})`);

// 3) add two different voicings to path simulation
const slots = [];
slots.push({ symbol: "C", voicing: { ...v, frets: v.frets.slice() } });
state.voicingPinned = true;
state.selectedVoicingId = list[0].id;
v = renderPass();
slots.push({ symbol: "C", voicing: { ...v, frets: v.frets.slice() } });
assert(slots[0].voicing.id !== slots[1].voicing.id, "path can hold two different C voicings");
assert(!fretsEqual(slots[0].voicing.frets, slots[1].voicing.frets), "their frets differ");

// 4) preferred detect alt survives re-render
state.voicingPinned = false;
state.preferredSymbol = "Cmaj7";
v = renderPass();
assert(state.detected?.symbol === "Cmaj7", `preferred detect kept (${state.detected?.symbol})`);

// 5) custom grip not in DB → board card selected
state.preferredSymbol = null;
state.detected = null;
state.frets = [-1, 3, 2, 0, 1, 3]; // odd grip
v = renderPass();
assert(v?.tags?.includes("board") || fretsEqual(v?.frets, state.frets), `custom grip selected (${v?.name})`);

// 6) Am open
state.frets = [-1, 0, 2, 2, 1, 0];
state.voicingPinned = false;
state.selectedVoicingId = null;
v = renderPass();
assert(state.detected?.symbol === "Am" || state.detectHits[0]?.symbol === "Am", `Am detect (${state.detected?.symbol})`);
assert(fretsEqual(v.frets, state.frets), `Am grip matched (${v?.name})`);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
