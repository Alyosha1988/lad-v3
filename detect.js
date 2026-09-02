/**
 * Узнать аккорд по форме на грифе или по клавишам рояля.
 */

const GUITAR_OPEN_PC = [4, 9, 2, 7, 11, 4]; // E A D G B e
const GUITAR_OPEN_MIDI = [40, 45, 50, 55, 59, 64];

const DETECT_QUALITIES = [
  { id: "", intervals: [0, 4, 7], label: "мажор" },
  { id: "m", intervals: [0, 3, 7], label: "минор" },
  { id: "7", intervals: [0, 4, 7, 10], label: "доминантсепт" },
  { id: "maj7", intervals: [0, 4, 7, 11], label: "maj7" },
  { id: "m7", intervals: [0, 3, 7, 10], label: "m7" },
  { id: "m7b5", intervals: [0, 3, 6, 10], label: "ø" },
  { id: "dim", intervals: [0, 3, 6], label: "dim" },
  { id: "dim7", intervals: [0, 3, 6, 9], label: "dim7" },
  { id: "sus2", intervals: [0, 2, 7], label: "sus2" },
  { id: "sus4", intervals: [0, 5, 7], label: "sus4" },
  { id: "7sus4", intervals: [0, 5, 7, 10], label: "7sus4" },
  { id: "add9", intervals: [0, 4, 7, 2], label: "add9" },
  { id: "madd9", intervals: [0, 3, 7, 2], label: "madd9" },
  { id: "6", intervals: [0, 4, 7, 9], label: "6" },
  { id: "m6", intervals: [0, 3, 7, 9], label: "m6" },
  { id: "9", intervals: [0, 4, 7, 10, 2], label: "9" },
  { id: "m9", intervals: [0, 3, 7, 10, 2], label: "m9" },
  { id: "5", intervals: [0, 7], label: "power" },
];

function fretsToMidiNotes(frets) {
  const notes = [];
  for (let s = 0; s < 6; s++) {
    const f = frets[s];
    if (f == null || f < 0) continue;
    notes.push(GUITAR_OPEN_MIDI[s] + f);
  }
  return notes;
}

function fretsToPitchClasses(frets) {
  const set = new Set();
  for (let s = 0; s < 6; s++) {
    const f = frets[s];
    if (f == null || f < 0) continue;
    set.add((GUITAR_OPEN_PC[s] + f) % 12);
  }
  return [...set].sort((a, b) => a - b);
}

function fretsBassPc(frets) {
  for (let s = 0; s < 6; s++) {
    const f = frets[s];
    if (f == null || f < 0) continue;
    return (GUITAR_OPEN_PC[s] + f) % 12;
  }
  return null;
}

function midisToPitchClasses(midis) {
  return [...new Set(midis.map((m) => ((m % 12) + 12) % 12))].sort((a, b) => a - b);
}

function pcsEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function fretsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function symbolForRootQuality(rootPc, qualityId) {
  const root = (typeof PC_NAMES !== "undefined" ? PC_NAMES : ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"])[rootPc];
  return `${root}${qualityId}`;
}

function scoreQualityMatch(pcs, rootPc, intervals) {
  if (!pcs.length) return -Infinity;
  const needed = new Set(intervals.map((iv) => (rootPc + iv) % 12));
  const have = new Set(pcs);
  let hit = 0;
  needed.forEach((pc) => {
    if (have.has(pc)) hit += 1;
  });
  if (hit < Math.min(2, needed.size)) return -Infinity;
  const missing = needed.size - hit;
  let extra = 0;
  have.forEach((pc) => {
    if (!needed.has(pc)) extra += 1;
  });
  // Prefer complete matches with few extras
  return hit * 12 - missing * 8 - extra * 3 + (hit === needed.size ? 6 : 0);
}

function librarySymbols() {
  const set = new Set();
  if (typeof OPEN_VOICINGS !== "undefined") {
    Object.keys(OPEN_VOICINGS).forEach((s) => set.add(s));
  }
  if (typeof listKnownQualities === "function") {
    // точные попадания по формам: все корни × базовые качества
    const qs = ["", "m", "7", "maj7", "m7", "sus2", "sus4", "5", "9", "m9", "add9"];
    ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"].forEach((r) => {
      qs.forEach((q) => set.add(r + q));
    });
  }
  return [...set];
}

function exactVoicingHits(frets) {
  if (typeof getVoicings !== "function") return [];
  const hits = [];
  librarySymbols().forEach((sym) => {
    const list = (typeof getGuitarVoicings === "function" ? getGuitarVoicings(sym) : getVoicings(sym)) || [];
    list.forEach((v) => {
      if (fretsEqual(v.frets, frets)) {
        hits.push({
          symbol: sym,
          score: 120,
          reason: v.name ? `точная форма · ${v.name}` : "точная форма",
        });
      }
    });
  });
  return hits;
}

function theoryHitsFromPcs(pcs, bassPc) {
  if (!pcs.length) return [];
  const hits = [];
  const roots = bassPc != null ? [bassPc, ...pcs.filter((p) => p !== bassPc)] : pcs.slice();
  // unique roots preserving bass-first order
  const seen = new Set();
  const orderedRoots = [];
  roots.forEach((r) => {
    if (!seen.has(r)) {
      seen.add(r);
      orderedRoots.push(r);
    }
  });

  orderedRoots.forEach((rootPc) => {
    DETECT_QUALITIES.forEach((q) => {
      const score = scoreQualityMatch(pcs, rootPc, q.intervals);
      if (score < 0) return;
      let final = score;
      if (bassPc != null && rootPc === bassPc) final += 4;
      hits.push({
        symbol: symbolForRootQuality(rootPc, q.id),
        score: final,
        reason: q.label,
      });
    });
  });
  return hits;
}

function dedupeHits(hits) {
  const best = new Map();
  hits.forEach((h) => {
    const prev = best.get(h.symbol);
    if (!prev || h.score > prev.score) best.set(h.symbol, h);
  });
  return [...best.values()].sort((a, b) => b.score - a.score);
}

function identifyFromFrets(frets) {
  const sounding = (frets || []).filter((f) => f != null && f >= 0);
  if (sounding.length < 2) return [];
  const pcs = fretsToPitchClasses(frets);
  const bass = fretsBassPc(frets);
  return dedupeHits([...exactVoicingHits(frets), ...theoryHitsFromPcs(pcs, bass)]).slice(0, 6);
}

function identifyFromMidis(midis) {
  const list = [...new Set(midis || [])].sort((a, b) => a - b);
  if (list.length < 2) return [];
  const pcs = midisToPitchClasses(list);
  const bass = ((list[0] % 12) + 12) % 12;
  return dedupeHits(theoryHitsFromPcs(pcs, bass)).slice(0, 6);
}

function emptyGuitarFrets() {
  return [-1, -1, -1, -1, -1, -1];
}

if (typeof window !== "undefined") {
  window.identifyFromFrets = identifyFromFrets;
  window.identifyFromMidis = identifyFromMidis;
  window.fretsToMidiNotes = fretsToMidiNotes;
  window.emptyGuitarFrets = emptyGuitarFrets;
  window.GUITAR_OPEN_MIDI = GUITAR_OPEN_MIDI;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    identifyFromFrets,
    identifyFromMidis,
    fretsToPitchClasses,
    fretsToMidiNotes,
    emptyGuitarFrets,
  };
}
