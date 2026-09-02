/**
 * Рифф — отрисовка аппликатур (гитара / рояль).
 * База постановок — voicings.js (подключать раньше).
 */
const FRET_MUTE = typeof window !== "undefined" && window.FRET_MUTE !== undefined ? window.FRET_MUTE : -1;
const FRET_OPEN = typeof window !== "undefined" && window.FRET_OPEN !== undefined ? window.FRET_OPEN : 0;

function computeBaseFret(frets) {
  const played = frets.filter((f) => f > 0);
  if (!played.length) return 1;
  const min = Math.min(...played);
  const max = Math.max(...played);
  if (max <= 4) return 1;
  return min;
}

function voicingCenter(frets) {
  const played = frets.filter((f) => f >= 0);
  if (!played.length) return 99;
  return played.reduce((a, b) => a + b, 0) / played.length;
}

function pickGuitarSequence(path) {
  const get = typeof getGuitarVoicings === "function" ? getGuitarVoicings : getVoicings;
  return (path || []).map((symbol) => {
    const list = typeof get === "function" ? get(symbol) || [] : [];
    const voicing = list[0] || { name: "—", frets: [-1, -1, -1, -1, -1, -1] };
    return { symbol, voicing };
  });
}

function renderVoicingCard(symbol, voicing, opts = {}) {
  if (!voicing) return "";
  if (voicing.instrument === "piano" || voicing.midis) {
    return renderPianoSvg({ symbol, midis: voicing.midis, fingers: pianoFingers(voicing.midis || []) }, opts);
  }
  const html = renderChordSvg(symbol, voicing, opts);
  // play midis button for piano already in svg; for guitar frets ok
  return html.replace(
    "</figure>",
    `${opts.extraActions || ""}</figure>`
  );
}

function renderChordSvg(symbol, voicing, opts = {}) {
  const frets = voicing.frets;
  const base = voicing.baseFret || computeBaseFret(frets);
  const showFrets = 4;
  const w = opts.width || 84;
  const h = opts.height || 112;
  const padL = 16;
  const padR = 10;
  const padT = 34;
  const padB = 14;
  const gridW = w - padL - padR;
  const gridH = h - padT - padB;
  const stringXs = [0, 1, 2, 3, 4, 5].map((i) => padL + (gridW * i) / 5);
  const fretYs = [0, 1, 2, 3, 4].map((i) => padT + (gridH * i) / 4);

  let marks = "";
  if (base === 1) {
    marks += `<rect x="${padL - 1}" y="${padT - 3}" width="${gridW + 2}" height="3.5" fill="#f0a35a"/>`;
  } else {
    marks += `<text x="${padL - 5}" y="${padT + gridH / 8 + 3}" fill="#c9b59a" font-size="9" font-family="Source Sans 3,sans-serif" text-anchor="end">${base}fr</text>`;
  }

  for (const x of stringXs) {
    marks += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + gridH}" stroke="#f0a35a" stroke-width="1" opacity="0.45"/>`;
  }
  for (const y of fretYs) {
    marks += `<line x1="${padL}" y1="${y}" x2="${padL + gridW}" y2="${y}" stroke="#f0a35a" stroke-width="1" opacity="0.35"/>`;
  }

  const rel = frets.map((f) => (f <= 0 ? f : f - base + 1));
  let barreFret = null;
  let barreFrom = null;
  let barreTo = null;
  for (let f = 1; f <= showFrets; f++) {
    const idxs = [];
    for (let s = 0; s < 6; s++) if (rel[s] === f) idxs.push(s);
    if (idxs.length >= 3 && idxs[idxs.length - 1] - idxs[0] + 1 === idxs.length && idxs[idxs.length - 1] - idxs[0] >= 2) {
      barreFret = f; barreFrom = idxs[0]; barreTo = idxs[idxs.length - 1];
      break;
    }
  }
  if (!barreFret) {
    for (let f = 1; f <= showFrets; f++) {
      const idxs = [];
      for (let s = 0; s < 6; s++) if (rel[s] === f) idxs.push(s);
      if (idxs.length >= 4) {
        barreFret = f; barreFrom = idxs[0]; barreTo = idxs[idxs.length - 1];
        break;
      }
    }
  }

  if (barreFret !== null) {
    const y = padT + ((barreFret - 0.5) * gridH) / 4;
    marks += `<rect x="${stringXs[barreFrom] - 5}" y="${y - 5}" width="${stringXs[barreTo] - stringXs[barreFrom] + 10}" height="10" rx="5" fill="#f0a35a"/>`;
  }

  for (let s = 0; s < 6; s++) {
    const f = frets[s];
    const x = stringXs[s];
    if (f === FRET_MUTE) {
      marks += `<text x="${x}" y="${padT - 10}" fill="#c9b59a" font-size="11" text-anchor="middle" font-family="Source Sans 3,sans-serif">×</text>`;
    } else if (f === FRET_OPEN) {
      marks += `<circle cx="${x}" cy="${padT - 12}" r="3.8" fill="none" stroke="#f0a35a" stroke-width="1.4"/>`;
    } else {
      const relF = f - base + 1;
      if (relF < 1 || relF > showFrets) continue;
      if (barreFret === relF && s > barreFrom && s < barreTo) continue;
      const y = padT + ((relF - 0.5) * gridH) / 4;
      marks += `<circle cx="${x}" cy="${y}" r="5.2" fill="#f0a35a" stroke="#ffc078" stroke-width="1"/>`;
    }
  }

  const step = opts.step != null ? `<span class="diag-step">${opts.step}</span>` : "";
  const sub = voicing.name || "";
  return `
    <figure class="chord-diag">
      ${step}
      <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Аппликатура ${symbol}">
        <text x="${w / 2}" y="14" text-anchor="middle" fill="#f3e6d4" font-size="12" font-weight="600" font-family="Cormorant Garamond,Georgia,serif">${symbol}</text>
        ${marks}
      </svg>
      <button type="button" class="chord-play-btn" data-play-frets="${frets.join(",")}" aria-label="Послушать ${symbol}">▶</button>
      ${sub ? `<figcaption>${sub}</figcaption>` : ""}
    </figure>
  `;
}

/* ---------- Piano ---------- */

function chordPitchClasses(symbol) {
  const parsed = splitChordSymbol(symbol);
  if (!parsed) return [0];
  const root = rootIndex(parsed.root);
  const q = normalizeQuality(parsed.quality);
  const intervals = {
    "": [0, 4, 7],
    m: [0, 3, 7],
    "7": [0, 4, 7, 10],
    maj7: [0, 4, 7, 11],
    m7: [0, 3, 7, 10],
    m7b5: [0, 3, 6, 10],
    dim: [0, 3, 6],
    dim7: [0, 3, 6, 9],
    sus2: [0, 2, 7],
    sus4: [0, 5, 7],
    "7sus4": [0, 5, 7, 10],
    add9: [0, 4, 7, 14],
    madd9: [0, 3, 7, 14],
    "6": [0, 4, 7, 9],
    m6: [0, 3, 7, 9],
    "9": [0, 4, 7, 10, 14],
    maj9: [0, 4, 7, 11, 14],
    m9: [0, 3, 7, 10, 14],
    "13": [0, 4, 7, 10, 21],
    "5": [0, 7],
    "7alt": [0, 4, 10, 13], // 7#9-ish
    "m(maj7)": [0, 3, 7, 11],
  };
  const ints = intervals[q] || intervals[""];
  return ints.map((iv) => (root + iv) % 12);
}

function buildCloseVoicing(pcs, preferMidi = 60) {
  // Place each pitch class near preferMidi, sorted low→high, within ~1 octave+
  const tones = [];
  for (const pc of pcs.slice(0, 4)) {
    let midi = preferMidi - ((preferMidi - pc) % 12);
    if (midi > preferMidi + 6) midi -= 12;
    if (midi < preferMidi - 6) midi += 12;
    tones.push(midi);
  }
  tones.sort((a, b) => a - b);
  // ensure ascending unique
  for (let i = 1; i < tones.length; i++) {
    while (tones[i] <= tones[i - 1]) tones[i] += 12;
  }
  // compress if span too wide
  while (tones[tones.length - 1] - tones[0] > 14 && tones.length > 2) {
    tones[tones.length - 1] -= 12;
    tones.sort((a, b) => a - b);
  }
  return tones;
}

function voiceLeadPiano(prevMidis, pcs) {
  const uniquePcs = [...new Set(pcs.map((p) => ((p % 12) + 12) % 12))];
  if (!prevMidis || !prevMidis.length) {
    return buildCloseVoicing(uniquePcs, 60);
  }

  const center = Math.round(prevMidis.reduce((a, b) => a + b, 0) / prevMidis.length);
  const next = [];
  const usedPc = new Set();

  // Keep common tones / move each previous voice to nearest chord tone
  for (const m of prevMidis) {
    let best = null;
    let bestDist = 99;
    for (const pc of uniquePcs) {
      let cand = pc;
      // bring near m
      while (cand < m - 6) cand += 12;
      while (cand > m + 6) cand -= 12;
      const d = Math.abs(cand - m);
      if (d < bestDist && !usedPc.has(pc)) {
        bestDist = d;
        best = cand;
      }
    }
    if (best != null) {
      next.push(best);
      usedPc.add(((best % 12) + 12) % 12);
    }
  }

  // Add missing chord tones near center
  for (const pc of uniquePcs) {
    if (usedPc.has(pc)) continue;
    let cand = pc;
    while (cand < center - 6) cand += 12;
    while (cand > center + 8) cand -= 12;
    next.push(cand);
    usedPc.add(pc);
  }

  next.sort((a, b) => a - b);
  const dedup = [];
  for (const n of next) {
    if (!dedup.length || dedup[dedup.length - 1] !== n) dedup.push(n);
  }
  return dedup.slice(0, Math.min(4, Math.max(3, uniquePcs.length)));
}

function pianoFingers(midis) {
  // Right-hand style numbering low→high: 1 2 3 5 or 1 2 3 4 5
  const map = {
    1: [1],
    2: [1, 3],
    3: [1, 3, 5],
    4: [1, 2, 3, 5],
    5: [1, 2, 3, 4, 5],
  };
  return map[midis.length] || midis.map((_, i) => i + 1);
}

function pickPianoSequence(path) {
  const seq = [];
  let prev = null;
  for (const sym of path) {
    const pcs = chordPitchClasses(sym);
    const midis = voiceLeadPiano(prev, pcs);
    const fingers = pianoFingers(midis);
    seq.push({ symbol: sym, midis, fingers, notes: midis.map((m) => PC_NAMES[((m % 12) + 12) % 12]) });
    prev = midis;
  }
  return seq;
}

function renderPianoSvg(item, opts = {}) {
  const midis = item.midis;
  const minM = Math.min(...midis);
  const maxM = Math.max(...midis);
  // window of white keys covering the voicing + padding
  let start = minM - 1;
  while ([1, 3, 6, 8, 10].includes(((start % 12) + 12) % 12)) start--; // land on white
  let end = maxM + 1;
  while ([1, 3, 6, 8, 10].includes(((end % 12) + 12) % 12)) end++;

  const isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
  const whites = [];
  for (let m = start; m <= end; m++) if (!isBlack(m)) whites.push(m);

  const whiteW = 14;
  const w = Math.max(120, whites.length * whiteW + 16);
  const h = 100;
  const padL = 8;
  const padT = 28;
  const whiteH = 58;
  const blackH = 36;
  const blackW = 9;

  const active = new Set(midis);
  const fingerOf = {};
  midis.forEach((m, i) => {
    fingerOf[m] = item.fingers[i];
  });

  let svg = "";
  // white keys
  whites.forEach((m, i) => {
    const x = padL + i * whiteW;
    const on = active.has(m);
    svg += `<rect x="${x}" y="${padT}" width="${whiteW - 1.2}" height="${whiteH}" rx="1.5" fill="${on ? "#f0a35a" : "#fff8ee"}" stroke="#3d2e22" stroke-width="1"/>`;
    if (on && fingerOf[m]) {
      svg += `<text x="${x + (whiteW - 1.2) / 2}" y="${padT + whiteH - 8}" text-anchor="middle" fill="#1a120c" font-size="10" font-weight="700" font-family="Source Sans 3,sans-serif">${fingerOf[m]}</text>`;
    }
  });

  // black keys
  whites.forEach((m, i) => {
    const nextBlack = m + 1;
    if (nextBlack <= end && isBlack(nextBlack)) {
      const x = padL + i * whiteW + whiteW - blackW / 2 - 0.6;
      const on = active.has(nextBlack);
      svg += `<rect x="${x}" y="${padT}" width="${blackW}" height="${blackH}" rx="1" fill="${on ? "#f0a35a" : "#1c1917"}" stroke="#0d0a08" stroke-width="0.5"/>`;
      if (on && fingerOf[nextBlack]) {
        svg += `<text x="${x + blackW / 2}" y="${padT + blackH - 6}" text-anchor="middle" fill="#1a120c" font-size="9" font-weight="700" font-family="Source Sans 3,sans-serif">${fingerOf[nextBlack]}</text>`;
      }
    }
  });

  const noteLabel = item.notes.join("·");
  const step = opts.step != null ? `<span class="diag-step">${opts.step}</span>` : "";
  const playNotes = midis.join(",");

  return `
    <figure class="chord-diag chord-diag-piano">
      ${step}
      <svg viewBox="0 0 ${w} ${h}" width="${Math.min(w, 200)}" height="${h}" role="img" aria-label="Рояль ${item.symbol}">
        <text x="${w / 2}" y="14" text-anchor="middle" fill="#f3e6d4" font-size="12" font-weight="600" font-family="Cormorant Garamond,Georgia,serif">${item.symbol}</text>
        ${svg}
      </svg>
      <button type="button" class="chord-play-btn" data-play-notes="${playNotes}" aria-label="Послушать ${item.symbol}">▶</button>
      <figcaption>${noteLabel}</figcaption>
    </figure>
  `;
}

function currentDiagramInstrument() {
  if (typeof getInstrument === "function") return getInstrument();
  try {
    return localStorage.getItem("lad-instrument") || "acoustic";
  } catch (_) {
    return "acoustic";
  }
}

function renderPathDiagrams(path) {
  const instrument = currentDiagramInstrument();
  const isPiano = instrument === "piano";

  const hint = isPiano
    ? "Последовательность для рояля · цифры — пальцы правой руки (1=большой)"
    : "Удобная последовательность на грифе · формы подобраны с малым сдвигом руки";

  let body = "";
  if (isPiano) {
    const seq = pickPianoSequence(path);
    body = seq
      .map((item, i) => {
        const arrow = i < seq.length - 1 ? `<span class="diag-arrow" aria-hidden="true">→</span>` : "";
        return `${renderPianoSvg(item, { step: i + 1 })}${arrow}`;
      })
      .join("");
  } else {
    const seq = pickGuitarSequence(path);
    body = seq
      .map((item, i) => {
        const arrow = i < seq.length - 1 ? `<span class="diag-arrow" aria-hidden="true">→</span>` : "";
        return `${renderChordSvg(item.symbol, item.voicing, { step: i + 1 })}${arrow}`;
      })
      .join("");
  }

  return `
    <div class="diag-block" data-path="${path.join("|")}">
      <p class="diag-hint">${hint}</p>
      <div class="diag-row diag-sequence">${body}</div>
    </div>
  `;
}

function refreshAllPathDiagrams() {
  document.querySelectorAll(".diag-block[data-path]").forEach((block) => {
    const path = block.dataset.path.split("|").filter(Boolean);
    if (!path.length) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = renderPathDiagrams(path);
    const next = tmp.firstElementChild;
    if (next) block.replaceWith(next);
  });
  document.querySelectorAll(".scale-diag-block[data-scale-notes]").forEach((block) => {
    const notes = block.dataset.scaleNotes.split("|").filter(Boolean);
    const root = block.dataset.scaleRoot || notes[0] || "";
    const label = block.dataset.scaleLabel || "";
    const midis = block.dataset.scaleMidis || "";
    if (!notes.length) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = renderScaleDiagrams(notes, {
      root,
      label,
      midis: midis ? midis.split(",").map((n) => parseInt(n, 10)) : null,
    });
    const next = tmp.firstElementChild;
    if (next) block.replaceWith(next);
  });
}

/* ---------- Scale boxes / позиции ---------- */

const SCALE_OPEN_MIDI = [40, 45, 50, 55, 59, 64]; // E A D G B E
const SCALE_OPEN_PC = SCALE_OPEN_MIDI.map((m) => m % 12);

function scaleNotePc(note) {
  const m = String(note || "")
    .trim()
    .match(/^([A-G][b#]?)/i);
  if (!m) return -1;
  return rootIndex(canonicalRoot(m[1]));
}

function findScaleBoxBases(rootPc) {
  const candidates = [];
  for (let fret = 0; fret <= 12; fret++) {
    for (let s = 0; s <= 1; s++) {
      if ((SCALE_OPEN_PC[s] + fret) % 12 === rootPc) {
        const windowBase = fret <= 1 ? 0 : fret;
        if (!candidates.includes(windowBase)) candidates.push(windowBase);
      }
    }
  }
  candidates.sort((a, b) => a - b);
  const first = candidates[0] ?? 0;
  const second = candidates.find((b) => b >= first + 4) ?? first + 5;
  const out = [first];
  if (second <= 12 && second !== first) out.push(second);
  return out.slice(0, 2);
}

function renderScaleBoxSvg(pcs, rootPc, baseFret, opts = {}) {
  const showFrets = 5;
  const w = opts.width || 118;
  const h = opts.height || 132;
  const padL = 16;
  const padR = 10;
  const padT = 28;
  const padB = 12;
  const gridW = w - padL - padR;
  const gridH = h - padT - padB;
  const stringXs = [0, 1, 2, 3, 4, 5].map((i) => padL + (gridW * i) / 5);
  const fretYs = [0, 1, 2, 3, 4, 5].map((i) => padT + (gridH * i) / 5);
  const pcSet = new Set(pcs.map((p) => ((p % 12) + 12) % 12));
  const fromFret = baseFret <= 1 ? 0 : baseFret;
  const toFret = baseFret <= 1 ? 5 : baseFret + 4;

  let marks = "";
  if (baseFret <= 1) {
    marks += `<rect x="${padL - 1}" y="${padT - 3}" width="${gridW + 2}" height="3.5" fill="#f0a35a"/>`;
  } else {
    marks += `<text x="${padL - 5}" y="${padT + gridH / 10 + 3}" fill="#c9b59a" font-size="9" font-family="Source Sans 3,sans-serif" text-anchor="end">${baseFret}fr</text>`;
  }

  for (const x of stringXs) {
    marks += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + gridH}" stroke="#f0a35a" stroke-width="1" opacity="0.45"/>`;
  }
  for (const y of fretYs) {
    marks += `<line x1="${padL}" y1="${y}" x2="${padL + gridW}" y2="${y}" stroke="#f0a35a" stroke-width="1" opacity="0.35"/>`;
  }

  for (let s = 0; s < 6; s++) {
    for (let fretNum = fromFret; fretNum <= toFret; fretNum++) {
      const pc = (SCALE_OPEN_PC[s] + fretNum) % 12;
      if (!pcSet.has(pc)) continue;
      const x = stringXs[s];
      const isRoot = pc === rootPc;
      if (fretNum === 0) {
        marks += `<circle cx="${x}" cy="${padT - 11}" r="${isRoot ? 4.4 : 3.4}" fill="${isRoot ? "#f0a35a" : "none"}" stroke="#f0a35a" stroke-width="1.4"/>`;
        continue;
      }
      const relF = baseFret <= 1 ? fretNum : fretNum - baseFret + 1;
      if (relF < 1 || relF > showFrets) continue;
      const y = padT + ((relF - 0.5) * gridH) / 5;
      if (isRoot) {
        marks += `<circle cx="${x}" cy="${y}" r="6" fill="#f0a35a" stroke="#ffc078" stroke-width="1.2"/>`;
        marks += `<text x="${x}" y="${y + 3.2}" text-anchor="middle" fill="#1a120c" font-size="8" font-weight="700" font-family="Source Sans 3,sans-serif">R</text>`;
      } else {
        marks += `<circle cx="${x}" cy="${y}" r="4.6" fill="#2a2118" stroke="#f0a35a" stroke-width="1.1"/>`;
      }
    }
  }

  const title = opts.title || (baseFret <= 1 ? "Бокс 1" : `Бокс · ${baseFret}fr`);
  return `
    <figure class="chord-diag scale-box-diag">
      <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Бокс ${title}">
        <text x="${w / 2}" y="14" text-anchor="middle" fill="#f3e6d4" font-size="11" font-weight="600" font-family="Cormorant Garamond,Georgia,serif">${title}</text>
        ${marks}
      </svg>
      <figcaption>${title}</figcaption>
    </figure>
  `;
}

function renderScalePianoStrip(notes, rootNote, opts = {}) {
  const pcs = notes.map(scaleNotePc).filter((n) => n >= 0);
  const rootPc = scaleNotePc(rootNote);
  const white = [0, 2, 4, 5, 7, 9, 11];
  // две октавы от C3-ish visual
  let keys = "";
  for (let oct = 0; oct < 2; oct++) {
    for (let i = 0; i < 12; i++) {
      const pc = i;
      const on = pcs.includes(pc);
      const isRoot = on && pc === rootPc;
      const isBlack = !white.includes(pc);
      if (isBlack) continue;
      keys += `<span class="scale-key ${on ? "is-on" : ""} ${isRoot ? "is-root" : ""}" data-pc="${pc}"></span>`;
    }
  }
  // black keys overlay simplified as note chips instead — clearer on mobile
  const chips = notes
    .map((n) => {
      const root = scaleNotePc(n) === rootPc;
      return `<span class="scale-note-chip ${root ? "is-root" : ""}">${n}</span>`;
    })
    .join("");
  return `
    <div class="scale-piano-strip">
      <p class="diag-hint">Ноты лада на клавишах · корень выделен</p>
      <div class="scale-note-chips">${chips}</div>
    </div>
  `;
}

function renderScaleDiagrams(notes, opts = {}) {
  const list = (notes || []).filter(Boolean);
  if (!list.length) return "";
  const root = opts.root || list[0];
  const rootPc = scaleNotePc(root);
  const pcs = list.map(scaleNotePc).filter((n) => n >= 0);
  const midis = opts.midis || null;
  const playAttr =
    midis && midis.length
      ? `data-play-melody="${midis.join(",")}"`
      : "";
  const instrument = currentDiagramInstrument();
  const isPiano = instrument === "piano";

  let body = "";
  if (isPiano) {
    body = renderScalePianoStrip(list, root, opts);
  } else {
    const bases = findScaleBoxBases(rootPc);
    body = bases
      .map((b, i) =>
        renderScaleBoxSvg(pcs, rootPc, b, {
          title: i === 0 ? (b <= 1 ? "Бокс 1" : `Бокс · ${b}fr`) : `Бокс · ${b}fr`,
        })
      )
      .join("");
  }

  const label = opts.label ? `<p class="diag-hint">${opts.label}</p>` : "";
  return `
    <div class="scale-diag-block diag-block"
         data-scale-notes="${list.join("|")}"
         data-scale-root="${root}"
         data-scale-label="${opts.label || ""}"
         data-scale-midis="${midis ? midis.join(",") : ""}">
      ${label}
      <div class="diag-row diag-sequence scale-boxes">${body}</div>
      ${
        playAttr
          ? `<button type="button" class="btn btn-glow btn-tiny scale-play-btn" ${playAttr} aria-label="Проиграть лад">▶ Проиграть лад</button>`
          : ""
      }
    </div>
  `;
}

if (typeof window !== "undefined") {
  window.refreshAllPathDiagrams = refreshAllPathDiagrams;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getVoicings,
    renderPathDiagrams,
    renderScaleDiagrams,
    pickGuitarSequence,
    pickPianoSequence,
    normalizeQuality,
    splitChordSymbol,
    chordPitchClasses,
  };
}
