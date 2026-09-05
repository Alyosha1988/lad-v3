/**
 * Export song track chord sequences to a downloadable PDF.
 * Draws a light print sheet on canvas (Cyrillic-safe) and wraps it as PDF.
 */

function songExportFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const startRaw = state.slots?.[0]?.symbol || state.start || "riff";
  const start = String(startRaw).replace(/[^A-Za-z0-9#b]/g, "") || "riff";
  return `lad-riff-${start}-${stamp}.pdf`;
}

function exportInstrument() {
  if (typeof currentDiagramInstrument === "function") return currentDiagramInstrument();
  if (typeof getInstrument === "function") return getInstrument();
  try {
    return localStorage.getItem("lad-instrument") || "acoustic";
  } catch (_) {
    return "acoustic";
  }
}

function diagramsForRiffSlots(slots) {
  const items = (slots || []).map((slot) => {
    const v = slot.voicing || {};
    if (v.midis?.length) {
      return {
        kind: "piano",
        symbol: slot.symbol,
        midis: v.midis.slice(),
        fingers: typeof pianoFingers === "function" ? pianoFingers(v.midis) : [],
        notes: [],
        name: v.name || "",
      };
    }
    return {
      kind: "guitar",
      symbol: slot.symbol,
      voicing: {
        ...v,
        frets: v.frets ? v.frets.slice() : [-1, -1, -1, -1, -1, -1],
        name: v.name || "",
      },
    };
  });
  const pianoN = items.filter((i) => i.kind === "piano").length;
  const kind = pianoN && pianoN === items.length ? "piano" : "guitar";
  return { kind, items, mixed: pianoN > 0 && pianoN < items.length };
}

function collectSongExportData() {
  return collectRiffExportData();
}


function resolveExportPhraseFlavor() {
  try {
    if (typeof resolveSoloPhraseFlavor === "function") return resolveSoloPhraseFlavor();
    if (typeof state !== "undefined" && state?.soloPhraseFlavor === "spicy") return "spicy";
    const raw = localStorage.getItem("lad-riff-solo-phrase-flavor");
    return raw === "spicy" ? "spicy" : "simple";
  } catch (_) {
    return "simple";
  }
}

function collectSoloPhraseExport(slots, path) {
  if (typeof LadTheory === "undefined" || typeof LadTheory.suggestSoloModes !== "function") return null;
  if (!path?.length) return null;
  const item = {
    path: path.slice(),
    start: path[0],
    mood: inferRiffMood(path[0]),
  };
  const suggestion = LadTheory.suggestSoloModes(item, { moodId: item.mood });
  const mode = suggestion?.modes?.[0];
  if (!mode) return null;
  const flavor = resolveExportPhraseFlavor();
  if (typeof LadTheory.suggestSoloPhrases !== "function") return null;
  const pack = LadTheory.suggestSoloPhrases(item, mode, { flavor });
  if (!pack?.slots?.length) return null;
  const voice = typeof LadTheory.getVoice === "function" ? LadTheory.getVoice() : "plain";
  const isPiano = exportInstrument() === "piano";
  const phraseSlots = pack.slots.map((slot, i) => {
    const grip = slots[i]?.voicing?.frets || null;
    const prefer = typeof preferNeckCenter === "function" ? preferNeckCenter(grip) : 5;
    const phrases = (slot.phrases || []).map((phrase) => {
      const title =
        typeof LadTheory.soloPhraseTitle === "function"
          ? LadTheory.soloPhraseTitle(phrase, voice)
          : phrase.titlePlain || "";
      const why =
        typeof LadTheory.soloPhraseWhy === "function"
          ? LadTheory.soloPhraseWhy(phrase, voice)
          : phrase.whyPlain || "";
      const mapped =
        !isPiano && typeof mapMelodyToNeck === "function"
          ? mapMelodyToNeck(phrase.midis, { preferCenter: prefer })
          : null;
      return {
        id: phrase.id,
        title,
        why,
        notes: (phrase.notes || []).slice(),
        midis: (phrase.midis || []).slice(),
        mapped,
      };
    });
    return {
      index: slot.index,
      symbol: slot.symbol,
      voicing: slots[i]?.voicing || null,
      phrases,
    };
  });
  return {
    title: "Соло · фразы",
    modeId: pack.modeId,
    modeName: voice === "pro" ? pack.modeNamePro : pack.modeNamePlain,
    flavor: pack.flavor,
    home: pack.home,
    slots: phraseSlots,
    isPiano,
  };
}

function collectRiffExportData() {
  const instrument = exportInstrument();
  const instrumentLabel =
    instrument === "piano" ? "фортепиано" : instrument === "distortion" ? "гитара · дисторшн" : "гитара · акустика";
  const slots = state.slots || [];
  const path = slots.map((s) => s.symbol);
  const diagrams = diagramsForRiffSlots(slots);
  const theory = slots
    .map((s) => (s.voicing?.name ? `${s.symbol}: ${s.voicing.name}` : s.symbol))
    .join(" · ");
  const pass =
    typeof LadTheory !== "undefined" && path.length
      ? LadTheory.passportForPdf(
          { path, start: path[0], mood: inferRiffMood(path[0]) },
          { moodId: inferRiffMood(path[0]), start: path[0] }
        )
      : null;

  return {
    brand: "Лад",
    tagline: "Рифф",
    moodTitle: "",
    start: path[0] || "",
    instrumentLabel,
    parts: path.length
      ? [
          {
            title: "Ход",
            path,
            route: path.join(" → "),
            family: "",
            kind: pass?.degrees || "",
            moodTitle: "",
            theory: pass
              ? [pass.degrees, pass.functions, pass.modeLine, pass.summary, pass.cadence, theory]
                  .filter(Boolean)
                  .join(" · ")
              : theory,
            diagrams,
          },
        ]
      : [],
    solo: collectSoloPhraseExport(slots, path),
    createdAt: new Date().toLocaleString("ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function inferRiffMood(symbol) {
  const s = String(symbol || "");
  if (/m(?!aj)/i.test(s.replace(/maj/gi, ""))) return "dark";
  if (/7/.test(s)) return "pulse";
  return "bright";
}

function computeExportBaseFret(frets) {
  if (typeof computeBaseFret === "function") return computeBaseFret(frets);
  const played = frets.filter((f) => f > 0);
  if (!played.length) return 1;
  const min = Math.min(...played);
  const max = Math.max(...played);
  if (max <= 4) return 1;
  return min;
}

/** Draw one guitar chord diagram; returns used height. */
function drawGuitarDiagram(ctx, originX, originY, symbol, voicing) {
  const w = 92;
  const h = 118;
  const frets = voicing?.frets || [-1, -1, -1, -1, -1, -1];
  const base = voicing?.baseFret || computeExportBaseFret(frets);
  const showFrets = 4;
  const padL = 16;
  const padR = 10;
  const padT = 34;
  const padB = 14;
  const gridW = w - padL - padR;
  const gridH = h - padT - padB;
  const stringXs = [0, 1, 2, 3, 4, 5].map((i) => originX + padL + (gridW * i) / 5);
  const fretYs = [0, 1, 2, 3, 4].map((i) => originY + padT + (gridH * i) / 4);

  ctx.fillStyle = "#fffdf8";
  ctx.strokeStyle = "rgba(26,18,12,0.18)";
  ctx.lineWidth = 1;
  roundRect(ctx, originX, originY, w, h, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#1a120c";
  ctx.font = "600 12px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText(symbol, originX + w / 2, originY + 16);
  ctx.textAlign = "left";

  if (base === 1) {
    ctx.fillStyle = "#b45a3c";
    ctx.fillRect(originX + padL - 1, originY + padT - 3, gridW + 2, 3.5);
  } else {
    ctx.fillStyle = "#7a7166";
    ctx.font = "500 9px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${base}fr`, originX + padL - 5, originY + padT + gridH / 8 + 3);
    ctx.textAlign = "left";
  }

  ctx.strokeStyle = "rgba(122,113,102,0.75)";
  ctx.lineWidth = 1;
  stringXs.forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, originY + padT);
    ctx.lineTo(x, originY + padT + gridH);
    ctx.stroke();
  });
  fretYs.forEach((y) => {
    ctx.beginPath();
    ctx.moveTo(originX + padL, y);
    ctx.lineTo(originX + padL + gridW, y);
    ctx.stroke();
  });

  const mute = typeof FRET_MUTE === "number" ? FRET_MUTE : -1;
  const open = typeof FRET_OPEN === "number" ? FRET_OPEN : 0;
  const rel = frets.map((f) => (f <= 0 ? f : f - base + 1));

  let barreFret = null;
  let barreFrom = null;
  let barreTo = null;
  for (let f = 1; f <= showFrets; f++) {
    const idxs = [];
    for (let s = 0; s < 6; s++) if (rel[s] === f) idxs.push(s);
    if (idxs.length >= 3 && idxs[idxs.length - 1] - idxs[0] + 1 === idxs.length && idxs[idxs.length - 1] - idxs[0] >= 2) {
      barreFret = f;
      barreFrom = idxs[0];
      barreTo = idxs[idxs.length - 1];
      break;
    }
  }
  if (barreFret == null) {
    for (let f = 1; f <= showFrets; f++) {
      const idxs = [];
      for (let s = 0; s < 6; s++) if (rel[s] === f) idxs.push(s);
      if (idxs.length >= 4) {
        barreFret = f;
        barreFrom = idxs[0];
        barreTo = idxs[idxs.length - 1];
        break;
      }
    }
  }

  if (barreFret != null) {
    const y = originY + padT + ((barreFret - 0.5) * gridH) / 4;
    ctx.fillStyle = "#b45a3c";
    roundRect(ctx, stringXs[barreFrom] - 5, y - 5, stringXs[barreTo] - stringXs[barreFrom] + 10, 10, 5);
    ctx.fill();
  }

  for (let s = 0; s < 6; s++) {
    const f = frets[s];
    const x = stringXs[s];
    if (f === mute) {
      ctx.fillStyle = "#7a7166";
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("×", x, originY + padT - 8);
      ctx.textAlign = "left";
    } else if (f === open) {
      ctx.strokeStyle = "#b45a3c";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(x, originY + padT - 12, 3.8, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const relF = f - base + 1;
      if (relF < 1 || relF > showFrets) continue;
      if (barreFret === relF && s > barreFrom && s < barreTo) continue;
      const y = originY + padT + ((relF - 0.5) * gridH) / 4;
      ctx.fillStyle = "#1c1917";
      ctx.beginPath();
      ctx.arc(x, y, 5.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const caption = voicing?.name || "";
  if (caption) {
    ctx.fillStyle = "#6e655a";
    ctx.font = "500 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(caption, originX + w / 2, originY + h + 12);
    ctx.textAlign = "left";
    return h + 16;
  }
  return h + 4;
}

function drawPianoDiagram(ctx, originX, originY, item) {
  const midis = item.midis || [];
  if (!midis.length) return 0;
  const isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
  const minM = Math.min(...midis);
  const maxM = Math.max(...midis);
  let start = minM - 1;
  while (isBlack(start)) start--;
  let end = maxM + 1;
  while (isBlack(end)) end++;
  const whites = [];
  for (let m = start; m <= end; m++) if (!isBlack(m)) whites.push(m);

  const whiteW = 12;
  const padL = 8;
  const padT = 26;
  const whiteH = 52;
  const blackH = 32;
  const blackW = 8;
  const w = Math.max(110, whites.length * whiteW + 16);
  const h = 96;

  ctx.fillStyle = "#fffdf8";
  ctx.strokeStyle = "rgba(26,18,12,0.18)";
  ctx.lineWidth = 1;
  roundRect(ctx, originX, originY, w, h, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#1a120c";
  ctx.font = "600 12px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText(item.symbol, originX + w / 2, originY + 16);
  ctx.textAlign = "left";

  const active = new Set(midis);
  const fingerOf = {};
  (item.fingers || []).forEach((f, i) => {
    fingerOf[midis[i]] = f;
  });

  whites.forEach((m, i) => {
    const x = originX + padL + i * whiteW;
    const on = active.has(m);
    ctx.fillStyle = on ? "#b45a3c" : "#fff8ee";
    ctx.strokeStyle = "#3d2e22";
    ctx.lineWidth = 1;
    roundRect(ctx, x, originY + padT, whiteW - 1.2, whiteH, 1.5);
    ctx.fill();
    ctx.stroke();
    if (on && fingerOf[m]) {
      ctx.fillStyle = "#fff8ee";
      ctx.font = "700 9px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(fingerOf[m]), x + (whiteW - 1.2) / 2, originY + padT + whiteH - 7);
      ctx.textAlign = "left";
    }
  });

  whites.forEach((m, i) => {
    const nextBlack = m + 1;
    if (nextBlack <= end && isBlack(nextBlack)) {
      const x = originX + padL + i * whiteW + whiteW - blackW / 2 - 0.6;
      const on = active.has(nextBlack);
      ctx.fillStyle = on ? "#b45a3c" : "#1c1917";
      roundRect(ctx, x, originY + padT, blackW, blackH, 1);
      ctx.fill();
      if (on && fingerOf[nextBlack]) {
        ctx.fillStyle = "#fff8ee";
        ctx.font = "700 8px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(fingerOf[nextBlack]), x + blackW / 2, originY + padT + blackH - 5);
        ctx.textAlign = "left";
      }
    }
  });

  const notes = (item.notes || []).join("·");
  if (notes) {
    ctx.fillStyle = "#6e655a";
    ctx.font = "500 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(notes, originX + w / 2, originY + h + 12);
    ctx.textAlign = "left";
    return h + 16;
  }
  return h + 4;
}

function diagramRowMetrics(diagrams, contentW) {
  if (!diagrams?.items?.length) return { rows: 0, rowH: 0, perRow: 1, boxW: 92 };
  const isPiano = diagrams.kind === "piano";
  const boxW = isPiano ? 128 : 92;
  const gap = 10;
  const perRow = Math.max(1, Math.floor((contentW - 32 + gap) / (boxW + gap)));
  const rows = Math.ceil(diagrams.items.length / perRow);
  const rowH = isPiano ? 118 : 138;
  return { rows, rowH, perRow, boxW, gap, isPiano };
}

function wrapCanvasText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  return lines;
}


/** Numbered melody shape on the neck; returns used height. */
function drawMelodyDiagram(ctx, originX, originY, mapped, caption) {
  if (!mapped?.positions?.length) return 0;
  const w = 108;
  const h = 128;
  const padL = 16;
  const padR = 10;
  const padT = 30;
  const showFrets = 5;
  const gridW = w - padL - padR;
  const gridH = h - padT - 12;
  const base = mapped.baseFret || 1;
  const stringXs = [0, 1, 2, 3, 4, 5].map((i) => originX + padL + (gridW * i) / 5);
  const rr = typeof roundRect === "function" ? roundRect : null;

  ctx.fillStyle = "#fffdf8";
  ctx.strokeStyle = "rgba(26,18,12,0.18)";
  ctx.lineWidth = 1;
  if (rr) {
    rr(ctx, originX, originY, w, h, 8);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(originX, originY, w, h);
    ctx.strokeRect(originX, originY, w, h);
  }

  if (caption) {
    ctx.fillStyle = "#1a120c";
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(caption).slice(0, 22), originX + w / 2, originY + 14);
    ctx.textAlign = "left";
  }

  if (base <= 1) {
    ctx.fillStyle = "#b45a3c";
    ctx.fillRect(originX + padL - 1, originY + padT - 3, gridW + 2, 3.5);
  } else {
    ctx.fillStyle = "#7a7166";
    ctx.font = "500 9px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${base}fr`, originX + padL - 5, originY + padT + gridH / 10 + 3);
    ctx.textAlign = "left";
  }

  ctx.strokeStyle = "rgba(122,113,102,0.75)";
  stringXs.forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, originY + padT);
    ctx.lineTo(x, originY + padT + gridH);
    ctx.stroke();
  });
  for (let i = 0; i <= showFrets; i++) {
    const y = originY + padT + (gridH * i) / showFrets;
    ctx.beginPath();
    ctx.moveTo(originX + padL, y);
    ctx.lineTo(originX + padL + gridW, y);
    ctx.stroke();
  }

  mapped.positions.forEach((pos) => {
    const x = stringXs[pos.string];
    if (pos.fret === 0) {
      ctx.fillStyle = "#b45a3c";
      ctx.beginPath();
      ctx.arc(x, originY + padT - 11, 5.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fffdf8";
      ctx.font = "700 9px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(pos.step), x, originY + padT - 7.5);
      ctx.textAlign = "left";
      return;
    }
    const rel = base <= 1 ? pos.fret : pos.fret - base + 1;
    if (rel < 1 || rel > showFrets) return;
    const y = originY + padT + ((rel - 0.5) * gridH) / showFrets;
    ctx.fillStyle = "#b45a3c";
    ctx.beginPath();
    ctx.arc(x, y, 6.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fffdf8";
    ctx.font = "700 9px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(pos.step), x, y + 3.2);
    ctx.textAlign = "left";
  });
  return h + 6;
}

function soloPhraseBlockHeight(solo, contentW, probe) {
  if (!solo?.slots?.length) return 0;
  let h = 36;
  probe.font = "500 12px 'Source Sans 3', system-ui, sans-serif";
  const wrap = typeof wrapCanvasText === "function" ? wrapCanvasText : null;
  solo.slots.forEach((slot) => {
    h += 26;
    h += 140;
    (slot.phrases || []).forEach((ph) => {
      const noteLine = (ph.notes || []).join(" · ");
      const text = `${ph.title}: ${noteLine}`;
      const lines = wrap ? wrap(probe, text, contentW - 40) : [text];
      h += 18 + lines.length * 14;
      h += solo.isPiano ? 110 : 140;
    });
    h += 10;
  });
  return h + 12;
}

function drawSongExportCanvas(data) {
  const width = 794; // ~A4 @ 96dpi
  const margin = 48;
  const contentW = width - margin * 2;
  const probe = document.createElement("canvas").getContext("2d");

  const layout = [];
  let y = margin + 18;
  layout.push({ type: "title", y });
  y += 28;
  layout.push({ type: "tag", y });
  y += 26;
  layout.push({ type: "meta", y });
  y += 18;
  layout.push({ type: "rule", y });
  y += 28;
  layout.push({ type: "heading", y });
  y += 30;

  if (!data.parts.length) {
    layout.push({ type: "empty", y });
    y += 30;
  }

  probe.font = "700 28px 'Cormorant Garamond', Georgia, serif";
  data.parts.forEach((part, idx) => {
    const routeLines = wrapCanvasText(probe, part.route, contentW - 32);
    const meta = [part.moodTitle, part.family, part.kind].filter(Boolean).join(" · ");
    probe.font = "500 12px 'Source Sans 3', system-ui, sans-serif";
    const theoryLines = part.theory
      ? wrapCanvasText(probe, part.theory, contentW - 32)
      : [];
    probe.font = "700 28px 'Cormorant Garamond', Georgia, serif";
    const metrics = diagramRowMetrics(part.diagrams, contentW);
    const diagramsH = metrics.rows ? 18 + metrics.rows * metrics.rowH : 0;
    const theoryH = theoryLines.length ? theoryLines.length * 16 + 8 : 0;
    const blockH = 28 + routeLines.length * 30 + (meta ? 22 : 8) + theoryH + diagramsH + 16;
    layout.push({
      type: "part",
      y,
      idx,
      part,
      routeLines,
      meta,
      theoryLines,
      blockH,
      metrics,
    });
    y += blockH + 14;
  });

      if (data.solo?.slots?.length) {
    y += 10;
    layout.push({ type: "solo-heading", y });
    y += 28;
    probe.font = "500 12px 'Source Sans 3', system-ui, sans-serif";
    const soloH = soloPhraseBlockHeight(data.solo, contentW, probe);
    layout.push({ type: "solo", y, solo: data.solo, blockH: soloH });
    y += soloH + 14;
  }

  if (data.parts.length) {
    y += 8;
    layout.push({ type: "linear-title", y });
    y += 22;
    probe.font = "500 14px 'Source Sans 3', system-ui, sans-serif";
    const linear = data.parts.map((p) => `${p.title}: ${p.route}`).join("   |   ");
    const linearLines = wrapCanvasText(probe, linear, contentW);
    layout.push({ type: "linear", y, lines: linearLines });
    y += linearLines.length * 20;
  }

  y += 40;
  layout.push({ type: "footer", y });
  const height = Math.max(1123, y + margin);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f7f1e4";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#d97835";
  ctx.fillRect(0, 0, width, 8);

  layout.forEach((item) => {
    if (item.type === "title") {
      ctx.fillStyle = "#1a120c";
      ctx.font = "700 42px 'Cormorant Garamond', Georgia, serif";
      ctx.fillText(data.brand, margin, item.y);
    } else if (item.type === "tag") {
      ctx.fillStyle = "#6e655a";
      ctx.font = "600 13px 'Source Sans 3', system-ui, sans-serif";
      ctx.fillText(data.tagline.toUpperCase(), margin, item.y);
    } else if (item.type === "meta") {
      ctx.fillStyle = "#3f3832";
      ctx.font = "500 15px 'Source Sans 3', system-ui, sans-serif";
      const metaBits = [
        data.moodTitle ? `Настроение: ${data.moodTitle}` : null,
        data.start ? `Тоника: ${data.start}` : null,
        data.instrumentLabel ? `Аппликатуры: ${data.instrumentLabel}` : null,
        data.createdAt,
      ].filter(Boolean);
      ctx.fillText(metaBits.join("  ·  "), margin, item.y);
    } else if (item.type === "rule") {
      ctx.strokeStyle = "rgba(217, 120, 53, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(margin, item.y);
      ctx.lineTo(width - margin, item.y);
      ctx.stroke();
    } else if (item.type === "heading") {
      ctx.fillStyle = "#1a120c";
      ctx.font = "700 26px 'Cormorant Garamond', Georgia, serif";
      ctx.fillText("Аккордовая последовательность", margin, item.y);
    } else if (item.type === "empty") {
      ctx.fillStyle = "#6e655a";
      ctx.font = "500 16px 'Source Sans 3', system-ui, sans-serif";
      ctx.fillText("На дорожке пока нет ходов.", margin, item.y);
    } else if (item.type === "part") {
      const top = item.y - 8;
      ctx.fillStyle = item.idx % 2 === 0 ? "rgba(255,255,255,0.55)" : "rgba(240, 163, 90, 0.08)";
      ctx.strokeStyle = "rgba(26, 18, 12, 0.12)";
      ctx.lineWidth = 1;
      roundRect(ctx, margin, top, contentW, item.blockH, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#d97835";
      ctx.font = "700 12px 'Source Sans 3', system-ui, sans-serif";
      ctx.fillText(item.part.title.toUpperCase(), margin + 16, item.y + 10);

      ctx.fillStyle = "#1a120c";
      ctx.font = "700 28px 'Cormorant Garamond', Georgia, serif";
      let ry = item.y + 38;
      item.routeLines.forEach((line) => {
        ctx.fillText(line, margin + 16, ry);
        ry += 30;
      });

      if (item.meta) {
        ctx.fillStyle = "#6e655a";
        ctx.font = "500 13px 'Source Sans 3', system-ui, sans-serif";
        ctx.fillText(item.meta, margin + 16, ry + 2);
        ry += 22;
      } else {
        ry += 8;
      }

      if (item.theoryLines?.length) {
        ctx.fillStyle = "#4a433c";
        ctx.font = "500 12px 'Source Sans 3', system-ui, sans-serif";
        item.theoryLines.forEach((line) => {
          ctx.fillText(line, margin + 16, ry);
          ry += 16;
        });
        ry += 8;
      }

      const diagrams = item.part.diagrams;
      const metrics = item.metrics;
      if (diagrams?.items?.length && metrics?.rows) {
        ctx.fillStyle = "#9a9186";
        ctx.font = "600 11px 'Source Sans 3', system-ui, sans-serif";
        ctx.fillText(
          metrics.isPiano ? "Аппликатуры · рояль" : "Аппликатуры · гриф",
          margin + 16,
          ry
        );
        ry += 10;
        diagrams.items.forEach((diag, i) => {
          const col = i % metrics.perRow;
          const row = Math.floor(i / metrics.perRow);
          const dx = margin + 16 + col * (metrics.boxW + metrics.gap);
          const dy = ry + row * metrics.rowH;
          if (metrics.isPiano || diag.kind === "piano" || diag.midis) drawPianoDiagram(ctx, dx, dy, diag);
          else drawGuitarDiagram(ctx, dx, dy, diag.symbol, diag.voicing);
        });
      }
    } else if (item.type === "solo-heading") {
      ctx.fillStyle = "#1a120c";
      ctx.font = "700 26px 'Cormorant Garamond', Georgia, serif";
      ctx.fillText("Соло · фразы с аппликатурами", margin, item.y);
    } else if (item.type === "solo") {
      const solo = item.solo;
      const top = item.y - 8;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.strokeStyle = "rgba(26, 18, 12, 0.12)";
      ctx.lineWidth = 1;
      roundRect(ctx, margin, top, contentW, item.blockH, 12);
      ctx.fill();
      ctx.stroke();

      let sy = item.y + 8;
      ctx.fillStyle = "#6e655a";
      ctx.font = "500 13px 'Source Sans 3', system-ui, sans-serif";
      const flavorLabel = solo.flavor === "spicy" ? "хитро" : "просто";
      ctx.fillText(
        `Лад: ${solo.modeName || "—"}${solo.home ? ` · центр ${solo.home}` : ""} · ${flavorLabel}`,
        margin + 16,
        sy
      );
      sy += 22;

      solo.slots.forEach((slot) => {
        ctx.fillStyle = "#d97835";
        ctx.font = "700 12px 'Source Sans 3', system-ui, sans-serif";
        ctx.fillText(`${slot.index + 1} · ${slot.symbol}`, margin + 16, sy);
        sy += 8;

        if (slot.voicing?.frets && !solo.isPiano) {
          drawGuitarDiagram(ctx, margin + 16, sy, slot.symbol, slot.voicing);
        } else if ((slot.voicing?.midis && slot.voicing.midis.length) || solo.isPiano) {
          drawPianoDiagram(ctx, margin + 16, sy, {
            symbol: slot.symbol,
            midis: slot.voicing?.midis || [],
            fingers: slot.voicing?.fingers || [],
          });
        }
        sy += 130;

        (slot.phrases || []).forEach((ph) => {
          const noteLine = (ph.notes || []).join(" · ");
          probe.font = "500 12px 'Source Sans 3', system-ui, sans-serif";
          const lines = wrapCanvasText(probe, `${ph.title}: ${noteLine}`, contentW - 40);
          lines.forEach((line) => {
            ctx.font = "500 12px 'Source Sans 3', system-ui, sans-serif";
            ctx.fillStyle = "#3f3832";
            ctx.fillText(line, margin + 16, sy);
            sy += 14;
          });
          sy += 4;
          if (solo.isPiano) {
            drawPianoDiagram(ctx, margin + 16, sy, {
              symbol: ph.title,
              midis: ph.midis || [],
              fingers: (ph.midis || []).map((_, i) => i + 1),
            });
            sy += 108;
          } else if (ph.mapped) {
            const used = drawMelodyDiagram(ctx, margin + 16, sy, ph.mapped, "порядок нот");
            sy += used + 8;
          } else {
            sy += 8;
          }
        });
        sy += 8;
      });
    } else if (item.type === "linear-title") {
      ctx.fillStyle = "#1a120c";
      ctx.font = "700 18px 'Cormorant Garamond', Georgia, serif";
      ctx.fillText("Сквозная линия", margin, item.y);
    } else if (item.type === "linear") {
      ctx.fillStyle = "#3f3832";
      ctx.font = "500 14px 'Source Sans 3', system-ui, sans-serif";
      let ly = item.y;
      item.lines.forEach((line) => {
        ctx.fillText(line, margin, ly);
        ly += 20;
      });
    } else if (item.type === "footer") {
      ctx.fillStyle = "#9a9186";
      ctx.font = "500 11px 'Source Sans 3', system-ui, sans-serif";
      ctx.fillText("Собрано в Лад · Рифф · alyosha1988.github.io/lad-v3", margin, Math.min(item.y, height - 24));
    }
  });

  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function dataUrlToPdfBlob(jpegDataUrl, imgWidthPx, imgHeightPx) {
  const base64 = jpegDataUrl.split(",")[1];
  const raw = atob(base64);
  const imgBytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) imgBytes[i] = raw.charCodeAt(i);

  // Single page sized to the sheet aspect (A4 width)
  const pageW = 595.28;
  const pageH = pageW * (imgHeightPx / imgWidthPx);
  const drawW = pageW;
  const drawH = pageH;
  const ox = 0;
  const oy = 0;

  return buildSingleImagePdf(imgBytes, imgWidthPx, imgHeightPx, pageW, pageH, drawW, drawH, ox, oy);
}

function buildSingleImagePdf(imgBytes, imgW, imgH, pageW, pageH, drawW, drawH, ox, oy) {
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [0];

  const push = (str) => {
    chunks.push(typeof str === "string" ? encoder.encode(str) : str);
  };

  push("%PDF-1.4\n");

  const objs = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = "<< /Type /Pages /Kids [5 0 R] /Count 1 >>";
  objs[3] = null; // image - binary
  const contentStream = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${ox.toFixed(2)} ${oy.toFixed(2)} cm\n/Im0 Do\nQ\n`;
  objs[4] = `<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream`;
  objs[5] =
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
    `/Contents 4 0 R /Resources << /XObject << /Im0 3 0 R >> >> >>`;

  // Write objects 1,2 first
  for (let n = 1; n <= 5; n++) {
    offsets[n] = chunks.reduce((sum, c) => sum + c.length, 0);
    push(`${n} 0 obj\n`);
    if (n === 3) {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`
      );
      push(imgBytes);
      push("\nendstream\n");
    } else {
      push(objs[n]);
      push("\n");
    }
    push("endobj\n");
  }

  const xrefStart = chunks.reduce((sum, c) => sum + c.length, 0);
  push(`xref\n0 6\n`);
  push("0000000000 65535 f \n");
  for (let n = 1; n <= 5; n++) {
    push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((c) => {
    out.set(c, offset);
    offset += c.length;
  });
  return new Blob([out], { type: "application/pdf" });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportSongToPdf() {
  const plus = typeof LadTheory !== "undefined" ? LadTheory.hasLadPlus() : false;
  if (!plus) {
    window.alert("Выгрузка PDF доступна в Лад+.");
    return false;
  }
  const data = collectRiffExportData();
  if (!data.parts.length) {
    window.alert("Сначала добавьте хотя бы один аккорд в ход.");
    return false;
  }

  const canvas = drawSongExportCanvas(data);
  const jpeg = canvas.toDataURL("image/jpeg", 0.92);
  const blob = dataUrlToPdfBlob(jpeg, canvas.width, canvas.height);
  downloadBlob(blob, songExportFilename());
  return true;
}

function exportRiffToPdf() {
  return exportSongToPdf();
}

if (typeof window !== "undefined") {
  window.exportSongToPdf = exportSongToPdf;
  window.exportRiffToPdf = exportRiffToPdf;
  window.collectSongExportData = collectSongExportData;
  window.collectRiffExportData = collectRiffExportData;
}
