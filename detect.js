/**
 * Узнать аккорд по форме на грифе или по клавишам рояля.
 * Трезвучия важнее «power»: при 3+ высотах «5» не выигрывает.
 */

const GUITAR_OPEN_PC = [4, 9, 2, 7, 11, 4]; // E A D G B e
const GUITAR_OPEN_MIDI = [40, 45, 50, 55, 59, 64];

/** Чем меньше rank — тем предпочтительнее при равном покрытии. */
const DETECT_QUALITIES = [
  { id: "", intervals: [0, 4, 7], label: "мажор", rank: 1, kind: "triad" },
  { id: "m", intervals: [0, 3, 7], label: "минор", rank: 1, kind: "triad" },
  { id: "dim", intervals: [0, 3, 6], label: "dim", rank: 2, kind: "triad" },
  { id: "aug", intervals: [0, 4, 8], label: "aug", rank: 2, kind: "triad" },
  { id: "sus2", intervals: [0, 2, 7], label: "sus2", rank: 3, kind: "triad" },
  { id: "sus4", intervals: [0, 5, 7], label: "sus4", rank: 3, kind: "triad" },
  { id: "7", intervals: [0, 4, 7, 10], label: "доминантсепт", rank: 4, kind: "seventh" },
  { id: "maj7", intervals: [0, 4, 7, 11], label: "maj7", rank: 4, kind: "seventh" },
  { id: "m7", intervals: [0, 3, 7, 10], label: "m7", rank: 4, kind: "seventh" },
  { id: "m7b5", intervals: [0, 3, 6, 10], label: "ø", rank: 5, kind: "seventh" },
  { id: "dim7", intervals: [0, 3, 6, 9], label: "dim7", rank: 5, kind: "seventh" },
  { id: "7sus4", intervals: [0, 5, 7, 10], label: "7sus4", rank: 5, kind: "seventh" },
  { id: "6", intervals: [0, 4, 7, 9], label: "6", rank: 6, kind: "color" },
  { id: "m6", intervals: [0, 3, 7, 9], label: "m6", rank: 6, kind: "color" },
  { id: "add9", intervals: [0, 4, 7, 2], label: "add9", rank: 6, kind: "color" },
  { id: "madd9", intervals: [0, 3, 7, 2], label: "madd9", rank: 6, kind: "color" },
  { id: "9", intervals: [0, 4, 7, 10, 2], label: "9", rank: 7, kind: "color" },
  { id: "m9", intervals: [0, 3, 7, 10, 2], label: "m9", rank: 7, kind: "color" },
  { id: "5", intervals: [0, 7], label: "power", rank: 9, kind: "power" },
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

function fretsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function symbolForRootQuality(rootPc, qualityId) {
  const root = (typeof PC_NAMES !== "undefined"
    ? PC_NAMES
    : ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"])[rootPc];
  return `${root}${qualityId}`;
}

/**
 * Оценка качества относительно набора высот.
 * — полное покрытие нужных интервалов важнее;
 * — лишние ноты штрафуются;
 * — power при 3+ высотах сильно штрафуется / отбрасывается.
 */
function scoreQualityMatch(pcs, rootPc, q) {
  if (!pcs.length) return -Infinity;
  const intervals = q.intervals;
  const needed = intervals.map((iv) => (rootPc + iv) % 12);
  const needSet = new Set(needed);
  const have = new Set(pcs);

  let hit = 0;
  needed.forEach((pc) => {
    if (have.has(pc)) hit += 1;
  });

  // для трезвучия допускаем 2/3 (с штрафом); для септ — минимум 3; power — обе
  let minHit = 2;
  if (q.kind === "triad") minHit = 2;
  else if (q.kind === "seventh" || q.kind === "color") minHit = Math.min(3, needed.length);
  else if (q.kind === "power") minHit = 2;
  if (hit < minHit) return -Infinity;

  const missing = needed.length - hit;
  let extra = 0;
  have.forEach((pc) => {
    if (!needSet.has(pc)) extra += 1;
  });

  // power только если все звучащие высоты ⊆ {1, 5}
  if (q.kind === "power") {
    const onlyPowerPcs = [...have].every((pc) => needSet.has(pc));
    if (!onlyPowerPcs) return -Infinity;
  }

  let score = hit * 20 - missing * 14 - extra * 6;
  if (hit === needed.length) score += 18;
  // полное трезвучие сильно важнее неполного и power
  if (q.kind === "triad" && hit === 3) score += 12;
  if (q.kind === "triad" && hit === 2) score -= 8;
  const sizeGap = Math.abs(pcs.length - needed.length);
  score -= sizeGap * 4;
  score -= (q.rank || 5) * 0.5;

  return score;
}

function librarySymbols() {
  const set = new Set();
  if (typeof OPEN_VOICINGS !== "undefined") {
    Object.keys(OPEN_VOICINGS).forEach((s) => set.add(s));
  }
  if (typeof listKnownQualities === "function") {
    const qs = ["", "m", "7", "maj7", "m7", "sus2", "sus4", "dim", "aug", "5", "9", "m9", "add9"];
    ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"].forEach((r) => {
      qs.forEach((q) => set.add(r + q));
    });
  }
  return [...set];
}

function exactVoicingHits(frets) {
  const getter =
    typeof getGuitarVoicings === "function"
      ? getGuitarVoicings
      : typeof getVoicings === "function"
        ? getVoicings
        : null;
  if (!getter) return [];
  const hits = [];
  librarySymbols().forEach((sym) => {
    const list = getter(sym) || [];
    list.forEach((v) => {
      if (!v.frets || !fretsEqual(v.frets, frets)) return;
      // точная форма power не перебивает трезвучие, если в грифе ≥3 разных высоты
      const pcs = fretsToPitchClasses(frets);
      const isPowerSym = /5$/.test(sym) && !/sus|maj|m|dim|aug|7|9|6|add/i.test(sym.replace(/^[A-G][b#]?/, ""));
      // simpler: symbol ends with quality 5 only
      const quality = sym.replace(/^[A-G][b#]?/, "");
      let score = 120;
      if (quality === "5" && pcs.length >= 3) score = 40; // ниже полного трезвучия
      hits.push({
        symbol: sym,
        score,
        reason: v.name ? `точная форма · ${v.name}` : "точная форма",
      });
    });
  });
  return hits;
}

function theoryHitsFromPcs(pcs, bassPc) {
  if (!pcs.length) return [];
  const hits = [];
  const roots = bassPc != null ? [bassPc, ...pcs.filter((p) => p !== bassPc)] : pcs.slice();
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
      const score = scoreQualityMatch(pcs, rootPc, q);
      if (!Number.isFinite(score) || score < 0) return;
      let final = score;
      if (bassPc != null && rootPc === bassPc) final += 5;
      // бас = терция/квинта — лёгкий штраф к «странному» корню уже учтён порядком
      hits.push({
        symbol: symbolForRootQuality(rootPc, q.id),
        score: final,
        reason: q.label,
        quality: q.id,
        kind: q.kind,
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
  return [...best.values()].sort((a, b) => b.score - a.score || String(a.symbol).localeCompare(b.symbol));
}

function identifyFromFrets(frets) {
  const sounding = (frets || []).filter((f) => f != null && f >= 0);
  if (sounding.length < 2) return [];
  const pcs = fretsToPitchClasses(frets);
  const bass = fretsBassPc(frets);
  return dedupeHits([...exactVoicingHits(frets), ...theoryHitsFromPcs(pcs, bass)]).slice(0, 8);
}

function identifyFromMidis(midis) {
  const list = [...new Set(midis || [])].sort((a, b) => a - b);
  if (list.length < 2) return [];
  const pcs = midisToPitchClasses(list);
  const bass = ((list[0] % 12) + 12) % 12;
  return dedupeHits(theoryHitsFromPcs(pcs, bass)).slice(0, 8);
}

function emptyGuitarFrets() {
  return [-1, -1, -1, -1, -1, -1];
}

if (typeof window !== "undefined") {
  window.identifyFromFrets = identifyFromFrets;
  window.identifyFromMidis = identifyFromMidis;
  window.fretsToMidiNotes = fretsToMidiNotes;
  window.fretsToPitchClasses = fretsToPitchClasses;
  window.emptyGuitarFrets = emptyGuitarFrets;
  window.GUITAR_OPEN_MIDI = GUITAR_OPEN_MIDI;
  window.DETECT_QUALITIES = DETECT_QUALITIES;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    identifyFromFrets,
    identifyFromMidis,
    fretsToPitchClasses,
    fretsToMidiNotes,
    emptyGuitarFrets,
    scoreQualityMatch,
    theoryHitsFromPcs,
    DETECT_QUALITIES,
  };
}
