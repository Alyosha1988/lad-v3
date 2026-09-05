/**
 * Лад · Рифф
 * Гриф → аккорд + все постановки → ход (порядок/дубли) → развитие
 */

const LAD_PLUS_KEY = "lad-plus";
const SONG_KEY = "lad-riff-v3";

const state = {
  screen: "fret", // fret | path | develop | solo
  inputMode: "guitar", // guitar | piano
  frets: [-1, -1, -1, -1, -1, -1],
  piano: [],
  baseFret: 1,
  detected: null, // { symbol, score, reason }
  detectHits: [],
  preferredSymbol: null,
  preferredReason: null,
  selectedVoicingId: null,
  voicingPinned: false,
  /** @type {{ id, symbol, voicing }[]} */
  slots: [],
  dragFrom: null,
  pdfPreview: false,
  soloBoxesModeId: null,
  developMood: null, // null = авто по первому аккорду
  /** @type {"simple"|"spicy"|"both"} */
  nextFlavor: (typeof localStorage !== "undefined" && localStorage.getItem("lad-riff-next-flavor")) || "both",
  loop: {
    tempo: 90,
    patternId: "folk",
    metronome: true,
  },
};

const stage = document.getElementById("stage");
const btnBack = document.getElementById("btnBack");

function hasPlus() {
  try {
    return localStorage.getItem(LAD_PLUS_KEY) === "1";
  } catch (_) {
    return false;
  }
}

function uid() {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function emptyFrets() {
  return [-1, -1, -1, -1, -1, -1];
}

function audioApi() {
  return typeof window !== "undefined" ? window.LadAudio || null : null;
}

/** Весь текущий захват на грифе. */
function playGuitarGrip() {
  const api = audioApi();
  if (!api?.playVoicing) return;
  const sounding = state.frets.filter((f) => f != null && f >= 0);
  if (!sounding.length) return;
  api.unlockAudio?.();
  api.playVoicing(state.frets.slice(), {
    duration: 0.85,
    gain: 0.95,
    waitMs: 80,
  });
}

function playPianoKeys(midis) {
  const api = audioApi();
  if (!api?.playMidiNotes || !midis?.length) return;
  api.unlockAudio?.();
  api.playMidiNotes(midis.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n)));
}

function setScreen(name) {
  if (state.screen === "path" && name !== "path") stopRiffLoopUi();
  state.screen = name;
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("is-active", t.dataset.nav === name || (name === "fret" && t.dataset.nav === "fret"));
  });
  btnBack.hidden = name === "fret" && !state.slots.length;
  render();
  window.scrollTo(0, 0);
}

function render() {
  if (state.screen === "fret") renderFret();
  else if (state.screen === "path") renderPath();
  else if (state.screen === "develop") renderDevelop();
  else if (state.screen === "solo") renderSolo();
}

function fretsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((f, i) => Number(f) === Number(b[i]));
}

function midisEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  const aa = a.map(Number).slice().sort((x, y) => x - y);
  const bb = b.map(Number).slice().sort((x, y) => x - y);
  return aa.every((n, i) => n === bb[i]);
}

/** Захват с грифа / клавиш — чтобы в ход уходило то, что зажали. */
function boardGripVoicing(symbol) {
  if (!symbol) return null;
  if (state.inputMode === "guitar") {
    const frets = state.frets.slice();
    if (!frets.some((f) => f >= 0)) return null;
    const played = frets.filter((f) => f > 0);
    const baseFret =
      typeof computeBaseFret === "function"
        ? computeBaseFret(frets)
        : played.length
          ? Math.min(...played)
          : 1;
    const sig = typeof fretsSignature === "function" ? fretsSignature(frets) : frets.join(",");
    return {
      id: `board-gtr-${sig}`,
      instrument: "guitar",
      name: "Ваш захват",
      frets,
      baseFret,
      tags: ["board"],
      movable: false,
    };
  }
  if (state.piano.length) {
    return {
      id: `board-piano-${state.piano.join(".")}`,
      instrument: "piano",
      name: "Ваши клавиши",
      midis: state.piano.slice(),
      tags: ["board"],
    };
  }
  return null;
}

function detectNow() {
  let hits = [];
  if (state.inputMode === "guitar") {
    if (typeof identifyFromFrets === "function") hits = identifyFromFrets(state.frets) || [];
  } else if (typeof identifyFromMidis === "function") {
    hits = identifyFromMidis(state.piano) || [];
  }
  state.detectHits = hits;

  const preferred = state.preferredSymbol;
  const prevSym = state.detected?.symbol;
  if (preferred) {
    const hit = hits.find((h) => h.symbol === preferred);
    state.detected = hit || { symbol: preferred, reason: state.preferredReason || "выбор", score: 0 };
  } else if (prevSym && hits.some((h) => h.symbol === prevSym)) {
    state.detected = hits.find((h) => h.symbol === prevSym) || hits[0] || null;
  } else {
    state.detected = hits[0] || null;
  }
}

function currentVoicings() {
  const sym = state.detected?.symbol;
  if (!sym || typeof getAllVoicings !== "function") return [];
  const instrument = state.inputMode === "piano" ? "piano" : "guitar";
  const list = getAllVoicings(sym, { instrument }).slice();
  const grip = boardGripVoicing(sym);
  if (!grip) return list;
  const exact = list.find((v) =>
    grip.frets ? fretsEqual(v.frets, grip.frets) : midisEqual(v.midis, grip.midis)
  );
  if (exact) return list;
  return [grip, ...list];
}

function resolveSelectedVoicingId(list) {
  if (!list.length) return null;
  if (state.voicingPinned && state.selectedVoicingId) {
    const pinned = list.find((v) => v.id === state.selectedVoicingId);
    if (pinned) return pinned.id;
  }
  if (state.inputMode === "guitar") {
    const hit = list.find((v) => v.frets && fretsEqual(v.frets, state.frets));
    if (hit) return hit.id;
  } else if (state.piano.length) {
    const hit = list.find((v) => v.midis && midisEqual(v.midis, state.piano));
    if (hit) return hit.id;
  }
  const board = list.find((v) => (v.tags || []).includes("board"));
  if (board) return board.id;
  if (state.selectedVoicingId && list.some((v) => v.id === state.selectedVoicingId)) {
    return state.selectedVoicingId;
  }
  return list[0].id;
}

function selectedVoicing() {
  const list = currentVoicings();
  if (!list.length) return null;
  const id = resolveSelectedVoicingId(list);
  return list.find((v) => v.id === id) || list[0];
}

function addSlot(symbol, voicing, opts = {}) {
  const src = voicing || selectedVoicing();
  if (!symbol || !src) return;
  const v = {
    ...src,
    frets: src.frets ? src.frets.slice() : undefined,
    midis: src.midis ? src.midis.slice() : undefined,
    tags: src.tags ? [...src.tags] : undefined,
  };
  const slot = { id: uid(), symbol, voicing: v };
  if (opts.duplicateOf != null) {
    state.slots.splice(opts.duplicateOf + 1, 0, slot);
  } else {
    state.slots.push(slot);
  }
}

function pathSymbols() {
  return state.slots.map((s) => s.symbol);
}

function inferRiffMood(symbol) {
  const raw = String(symbol || "");
  const quality = raw.replace(/^[A-G][b#]?/i, "");
  if (/^m(?!aj)/i.test(quality)) return "dark";
  if (/7/.test(quality)) return "pulse";
  return "bright";
}

function riffSoloItem() {
  const path = pathSymbols();
  if (!path.length) return null;
  return {
    path,
    start: path[0],
    mood: inferRiffMood(path[0]),
  };
}

function bindMelodyPlayButtons(root) {
  (root || document).querySelectorAll("[data-play-melody]").forEach((btn) => {
    if (btn.__ladMelodyBound) return;
    btn.__ladMelodyBound = true;
    let last = 0;
    const play = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - last < 320) return;
      last = now;
      const raw = btn.dataset.playMelody;
      if (!raw || typeof window.LadAudio === "undefined") return;
      const midis = raw
        .split(",")
        .map((n) => parseInt(n, 10))
        .filter((n) => Number.isFinite(n));
      if (!midis.length) return;
      LadAudio.unlockAudio?.();
      LadAudio.playMelody?.(midis);
    };
    btn.addEventListener("pointerup", play);
    btn.addEventListener("click", play);
  });
}

function bindVoiceDelegation() {
  if (document.__ladVoiceBound) return;
  document.__ladVoiceBound = true;
  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest("[data-set-voice], [data-voice]");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof LadTheory === "undefined") return;
      const voice = btn.dataset.setVoice || btn.dataset.voice;
      if (voice !== "plain" && voice !== "pro") return;
      LadTheory.setVoice(voice);
      const screen = state.screen;
      requestAnimationFrame(() => {
        if (state.screen !== screen) return;
        render();
      });
    },
    true
  );
}

function exportRiffPdfOrPreview() {
  if (!state.slots.length) return;
  if (hasPlus() && typeof exportRiffToPdf === "function") {
    exportRiffToPdf();
    return;
  }
  state.pdfPreview = true;
  if (state.screen === "path") renderPath();
  else if (state.screen === "develop") renderDevelop();
  else if (state.screen === "solo") renderSolo();
  document.getElementById("pdfPreview")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderPdfPreviewBlock() {
  const path = pathSymbols();
  if (!path.length || !state.pdfPreview) return "";
  const item = riffSoloItem();
  const pass =
    typeof LadTheory !== "undefined"
      ? LadTheory.passportForPdf(item, { moodId: item.mood, start: item.start })
      : { degrees: "", functions: "", modeLine: "", summary: "" };
  const plus = hasPlus();
  const names = state.slots.map((s) => s.voicing?.name || "постановка").join(" · ");
  return `
    <div class="pdf-preview-frame" id="pdfPreview">
      <h3>Лист риффа — вид как после оплаты</h3>
      <p>Лад · ход · аппликатуры выбранных хватов</p>
      <h3>Ход</h3>
      <p><strong>${path.join(" → ")}</strong></p>
      <p>Ступени: ${pass.degrees || "—"}</p>
      <p>${pass.functions || ""}</p>
      <p>${pass.modeLine || ""}</p>
      <p>${pass.summary || ""}</p>
      <p>Хваты: ${names}</p>
      <p>На листе — те постановки, которые вы добавили в ход, не первая из базы.</p>
      <div class="pdf-preview-actions actions">
        ${
          plus
            ? `<button type="button" class="btn btn-glow" id="exportPdfReal">Скачать PDF</button>`
            : `<button type="button" class="btn btn-glow" id="needPlusPdf">Скачивание — в Лад+</button>`
        }
        <button type="button" class="btn btn-ghost" id="closePdfPreview">Закрыть предпросмотр</button>
      </div>
    </div>`;
}

function bindPdfPreviewActions() {
  document.getElementById("exportPdfReal")?.addEventListener("click", () => {
    if (hasPlus() && typeof exportRiffToPdf === "function") exportRiffToPdf();
    else flash("Лад+ нужен для PDF. Включите в Песне (тот же ключ на устройстве).");
  });
  document.getElementById("needPlusPdf")?.addEventListener("click", () => {
    flash("Лад+ нужен для PDF. Включите в Песне — ключ общий на этом устройстве.");
  });
  document.getElementById("closePdfPreview")?.addEventListener("click", () => {
    state.pdfPreview = false;
    render();
  });
}

function stopRiffLoopUi() {
  if (typeof LadRiffLoop !== "undefined") LadRiffLoop.stopLoop({ silent: true });
  document.querySelectorAll(".slot-card.is-looping").forEach((el) => el.classList.remove("is-looping"));
  const btn = document.getElementById("loopToggle");
  if (btn) {
    btn.textContent = "▶ Цикл";
    btn.classList.remove("is-on");
  }
}

function highlightLoopSlot(idx) {
  document.querySelectorAll(".slot-card").forEach((el, i) => {
    el.classList.toggle("is-looping", i === idx);
  });
}

function renderLoopPanel() {
  const patterns = typeof LadRiffLoop !== "undefined" ? LadRiffLoop.listPatterns() : [];
  const playing = typeof LadRiffLoop !== "undefined" && LadRiffLoop.isPlaying();
  const opts = patterns
    .map(
      (p) =>
        `<option value="${p.id}" ${state.loop.patternId === p.id ? "selected" : ""}>${p.label} · ${p.hint}</option>`
    )
    .join("");
  return `
    <section class="loop-panel" id="loopPanel" aria-label="Цикл риффа">
      <div class="loop-panel__head">
        <p class="kicker">Цикл</p>
        <p class="hand-note">1 такт на аккорд · бой · метроном · по кругу</p>
      </div>
      <div class="loop-panel__row">
        <label class="loop-field">
          <span>Темп</span>
          <input type="range" id="loopTempo" min="60" max="140" step="1" value="${state.loop.tempo}" />
          <strong id="loopTempoVal">${state.loop.tempo}</strong>
        </label>
      </div>
      <div class="loop-panel__row">
        <label class="loop-field">
          <span>Бой</span>
          <select id="loopPattern" class="solo-slot-select" aria-label="Паттерн боя">${opts}</select>
        </label>
      </div>
      <div class="loop-panel__row loop-panel__toggles">
        <label class="loop-toggle">
          <input type="checkbox" id="loopMetronome" ${state.loop.metronome ? "checked" : ""} />
          <span>Метроном</span>
        </label>
        <span class="chip">1 такт / аккорд</span>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-glow ${playing ? "is-on" : ""}" id="loopToggle">
          ${playing ? "■ Стоп" : "▶ Цикл"}
        </button>
      </div>
    </section>`;
}

function bindLoopPanel() {
  const tempo = document.getElementById("loopTempo");
  const tempoVal = document.getElementById("loopTempoVal");
  tempo?.addEventListener("input", () => {
    state.loop.tempo = +tempo.value;
    if (tempoVal) tempoVal.textContent = String(state.loop.tempo);
    if (typeof LadRiffLoop !== "undefined" && LadRiffLoop.isPlaying()) startRiffLoop();
  });
  document.getElementById("loopPattern")?.addEventListener("change", (e) => {
    state.loop.patternId = e.target.value;
    if (typeof LadRiffLoop !== "undefined" && LadRiffLoop.isPlaying()) startRiffLoop();
  });
  document.getElementById("loopMetronome")?.addEventListener("change", (e) => {
    state.loop.metronome = !!e.target.checked;
    if (typeof LadRiffLoop !== "undefined" && LadRiffLoop.isPlaying()) startRiffLoop();
  });
  document.getElementById("loopToggle")?.addEventListener("click", () => {
    if (typeof LadRiffLoop === "undefined") {
      flash("Движок цикла не загружен.");
      return;
    }
    if (LadRiffLoop.isPlaying()) stopRiffLoopUi();
    else startRiffLoop();
  });
}

function startRiffLoop() {
  if (typeof LadRiffLoop === "undefined" || !state.slots.length) return;
  audioApi()?.unlockAudio?.();
  const ok = LadRiffLoop.startLoop({
    tempo: state.loop.tempo,
    patternId: state.loop.patternId,
    metronome: state.loop.metronome,
    getSlots: () => state.slots,
    onSlot: highlightLoopSlot,
    onStop: () => {
      const btn = document.getElementById("loopToggle");
      if (btn) {
        btn.textContent = "▶ Цикл";
        btn.classList.remove("is-on");
      }
    },
  });
  const btn = document.getElementById("loopToggle");
  if (btn && ok) {
    btn.textContent = "■ Стоп";
    btn.classList.add("is-on");
  }
}

/* ---------- Fret / piano input ---------- */

function renderGuitarBoard() {
  const frets = state.frets;
  const base = state.baseFret;
  const nut = base <= 1;
  const fretNums = [];
  for (let rel = 1; rel <= 5; rel++) {
    fretNums.push(nut ? rel : base + rel - 1);
  }
  const numsRow = `<div class="fb-nums" aria-hidden="true"><span class="fb-nums__open"></span>${fretNums
    .map((n) => `<span class="fb-nums__n">${n}</span>`)
    .join("")}</div>`;
  let cells = "";
  for (let s = 0; s < 6; s++) {
    const f = frets[s];
    const openOn = f === 0;
    const muteOn = f < 0;
    cells += `<div class="fb-string" data-string="${s}">`;
    cells += `<button type="button" class="fb-open ${openOn ? "is-on" : ""} ${muteOn ? "is-mute" : ""}" data-fret-open="${s}" aria-label="Открытая/глушение">${muteOn ? "×" : openOn ? "○" : "·"}</button>`;
    for (let rel = 1; rel <= 5; rel++) {
      const abs = fretNums[rel - 1];
      const on = f === abs;
      cells += `<button type="button" class="fb-cell ${on ? "is-on" : ""}" data-string="${s}" data-fret="${abs}" aria-label="Струна ${s + 1} лад ${abs}"></button>`;
    }
    cells += `</div>`;
  }
  return `
    <div class="fb-wrap">
      <div class="fb-head">
        <button type="button" class="btn btn-ghost btn-tiny" id="fbPrev">←</button>
        <span class="fb-base">${nut ? "Порог" : `${base}fr`}</span>
        <button type="button" class="btn btn-ghost btn-tiny" id="fbNext">→</button>
      </div>
      <div class="fb-board" id="fbBoard">${numsRow}${cells}</div>
      <div class="fb-actions">
        <button type="button" class="btn btn-ghost" id="fbHear">Послушать захват</button>
        <button type="button" class="btn btn-ghost" id="fbClear">Сбросить гриф</button>
      </div>
    </div>`;
}

function renderPianoBoard() {
  const on = new Set(state.piano);
  // C3–B4 visual whites + blacks
  const start = 48;
  const end = 72;
  let whites = "";
  let blacks = "";
  for (let m = start; m <= end; m++) {
    const pc = m % 12;
    const isBlack = [1, 3, 6, 8, 10].includes(pc);
    if (isBlack) {
      blacks += `<button type="button" class="pk pk-black ${on.has(m) ? "is-on" : ""}" data-midi="${m}" style="left:${((m - start) / (end - start)) * 100}%"></button>`;
    } else {
      whites += `<button type="button" class="pk pk-white ${on.has(m) ? "is-on" : ""}" data-midi="${m}"></button>`;
    }
  }
  return `
    <div class="piano-wrap">
      <div class="piano-board">
        <div class="piano-whites">${whites}</div>
        <div class="piano-blacks">${blacks}</div>
      </div>
      <div class="fb-actions">
        <button type="button" class="btn btn-ghost" id="fbHear">Послушать аккорд</button>
        <button type="button" class="btn btn-ghost" id="pianoClear">Сбросить клавиши</button>
      </div>
    </div>`;
}

function renderVoicingStrip(symbol, list) {
  if (!symbol) {
    return `<p class="hand-note">Зажмите струны или клавиши — узнаем аккорд и покажем все постановки из базы.</p>`;
  }
  if (!list.length) {
    return `<p class="hand-note">Для <strong>${symbol}</strong> пока нет постановок в базе.</p>`;
  }
  const cards = list
    .map((v) => {
      const selected = state.selectedVoicingId === v.id || (!state.selectedVoicingId && list[0]?.id === v.id);
      let diag = "";
      if (v.frets && typeof renderChordSvg === "function") {
        diag = renderChordSvg(symbol, v, { width: 92, height: 120 });
      } else if (v.midis && typeof renderPianoSvg === "function") {
        diag = renderPianoSvg({ symbol, midis: v.midis, fingers: typeof pianoFingers === "function" ? pianoFingers(v.midis) : [] });
      }
      const play =
        v.frets
          ? `data-play-frets="${v.frets.join(",")}"`
          : v.midis
            ? `data-play-notes="${v.midis.join(",")}"`
            : "";
      return `
        <article class="voicing-card ${selected ? "is-selected" : ""}" data-voicing-id="${v.id}">
          <p class="voicing-card__name">${v.name || "постановка"}</p>
          ${diag}
          <div class="voicing-card__actions">
            <button type="button" class="btn btn-ghost btn-tiny" ${play}>▶</button>
            <button type="button" class="btn btn-ghost btn-tiny" data-pick-voicing="${v.id}">Выбрать</button>
          </div>
        </article>`;
    })
    .join("");
  return `
    <div class="voicing-block">
      <div class="voicing-block__head">
        <h2 class="h2">${symbol}</h2>
        <span class="chip">${list.length} постановок</span>
      </div>
      <p class="hand-note">Все разумные формы из базы · нажмите карточку и добавьте в ход</p>
      <div class="voicing-strip">${cards}</div>
    </div>`;
}

function renderFret() {
  const prevStripScroll = stage.querySelector(".voicing-strip")?.scrollLeft || 0;
  detectNow();
  const list = currentVoicings();
  state.selectedVoicingId = resolveSelectedVoicingId(list);
  const sym = state.detected?.symbol || "";
  const reason = state.detected?.reason || "";
  const altChips = (state.detectHits || [])
    .slice(0, 5)
    .map(
      (h) =>
        `<button type="button" class="chip chip-btn ${h.symbol === sym ? "is-on chip-accent" : ""}" data-pick-detect="${h.symbol}" title="${h.reason}">${h.symbol}</button>`
    )
    .join("");

  stage.innerHTML = `
    <p class="kicker">Рифф</p>
    <h1 class="h1">Зажми на грифе</h1>
    <p class="hand-note">Сразу пустой гриф · гитара и клавиши · все постановки из базы</p>
    <div class="chip-row">
      <button type="button" class="chip chip-btn ${state.inputMode === "guitar" ? "is-on" : ""}" data-input="guitar">Гитара</button>
      <button type="button" class="chip chip-btn ${state.inputMode === "piano" ? "is-on" : ""}" data-input="piano">Клавиши</button>
      ${state.slots.length ? `<span class="chip">${state.slots.length} в ходе</span>` : ""}
    </div>
    ${
      altChips
        ? `<div class="chip-row detect-alts" aria-label="Варианты аккорда">${altChips}</div>
           <p class="detect-reason">${reason}${state.detectHits.length > 1 ? " · можно выбрать другой вариант" : ""}</p>`
        : `<p class="detect-reason">ещё не распознано</p>`
    }
    ${state.inputMode === "guitar" ? renderGuitarBoard() : renderPianoBoard()}
    ${renderVoicingStrip(sym, list)}
    <div class="actions sticky-actions">
      <button type="button" class="btn btn-glow" id="addToPath" ${sym && selectedVoicing() ? "" : "disabled"}>В ход</button>
      <button type="button" class="btn btn-primary" id="toPath" ${state.slots.length ? "" : "disabled"}>Ход (${state.slots.length})</button>
      <button type="button" class="btn btn-ghost" id="toDevelop" ${state.slots.length ? "" : "disabled"}>Развитие</button>
    </div>
  `;

  stage.querySelectorAll("[data-input]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.inputMode = btn.dataset.input;
      state.selectedVoicingId = null;
      state.voicingPinned = false;
      state.preferredSymbol = null;
      renderFret();
    });
  });
  stage.querySelectorAll("[data-pick-detect]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const symPick = btn.dataset.pickDetect;
      state.preferredSymbol = symPick;
      state.preferredReason = "выбор";
      state.voicingPinned = false;
      state.selectedVoicingId = null;
      renderFret();
    });
  });

  stage.querySelectorAll("[data-fret-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = +btn.dataset.fretOpen;
      const cur = state.frets[s];
      // cycle: mute → open → mute
      const next = cur === 0 ? -1 : 0;
      state.frets[s] = next;
      state.voicingPinned = false;
      state.preferredSymbol = null;
      if (next === 0) playGuitarGrip();
      renderFret();
    });
  });
  stage.querySelectorAll("[data-fret]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = +btn.dataset.string;
      const f = +btn.dataset.fret;
      const turningOff = state.frets[s] === f;
      state.frets[s] = turningOff ? -1 : f;
      state.voicingPinned = false;
      state.preferredSymbol = null;
      if (!turningOff) playGuitarGrip();
      renderFret();
    });
  });
  document.getElementById("fbPrev")?.addEventListener("click", () => {
    state.baseFret = Math.max(1, state.baseFret - 1);
    renderFret();
  });
  document.getElementById("fbNext")?.addEventListener("click", () => {
    state.baseFret = Math.min(12, state.baseFret + 1);
    renderFret();
  });
  document.getElementById("fbClear")?.addEventListener("click", () => {
    state.frets = emptyFrets();
    state.voicingPinned = false;
    state.preferredSymbol = null;
    state.detected = null;
    state.selectedVoicingId = null;
    renderFret();
  });
  stage.querySelectorAll("[data-midi]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = +btn.dataset.midi;
      const i = state.piano.indexOf(m);
      state.voicingPinned = false;
      state.preferredSymbol = null;
      if (i >= 0) {
        state.piano.splice(i, 1);
      } else {
        state.piano.push(m);
        state.piano.sort((a, b) => a - b);
        playPianoKeys(state.piano.slice());
      }
      renderFret();
    });
  });
  document.getElementById("pianoClear")?.addEventListener("click", () => {
    state.piano = [];
    state.voicingPinned = false;
    state.preferredSymbol = null;
    state.detected = null;
    state.selectedVoicingId = null;
    renderFret();
  });
  document.getElementById("fbHear")?.addEventListener("click", () => {
    if (state.inputMode === "guitar") playGuitarGrip();
    else playPianoKeys(state.piano.slice());
  });

  const pinVoicing = (id) => {
    if (!id) return;
    state.selectedVoicingId = id;
    state.voicingPinned = true;
    renderFret();
  };
  stage.querySelectorAll("[data-pick-voicing]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      pinVoicing(btn.dataset.pickVoicing);
    });
  });
  stage.querySelectorAll("[data-voicing-id]").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-play-frets], [data-play-notes], [data-play-chord]")) return;
      pinVoicing(card.dataset.voicingId);
    });
  });
  document.getElementById("addToPath")?.addEventListener("click", () => {
    const v = selectedVoicing();
    if (!sym || !v) return;
    addSlot(sym, v);
    renderFret();
  });
  document.getElementById("toPath")?.addEventListener("click", () => setScreen("path"));
  document.getElementById("toDevelop")?.addEventListener("click", () => setScreen("develop"));

  const strip = stage.querySelector(".voicing-strip");
  if (strip && prevStripScroll) strip.scrollLeft = prevStripScroll;
}


function fretsHaveInnerGap(frets) {
  const idx = (frets || []).map((x, i) => (x >= 0 ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 2) return false;
  return idx[idx.length - 1] - idx[0] + 1 !== idx.length;
}

/** Смешать сплошные и «через одну», чтобы в ряду были оба типа. */
function diversifyShellAlts(list, limit = 4) {
  const contig = [];
  const gaps = [];
  for (const v of list) {
    if (fretsHaveInnerGap(v.frets)) gaps.push(v);
    else contig.push(v);
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (out.length < limit && (i < contig.length || j < gaps.length)) {
    if (i < contig.length) out.push(contig[i++]);
    if (out.length >= limit) break;
    if (j < gaps.length) out.push(gaps[j++]);
  }
  return out;
}

/** Урезанные альтернативы для слота хода (3–4 струны, в т.ч. через одну). */
function slotShellAlts(idx) {
  const slot = state.slots[idx];
  if (!slot?.symbol || !slot.voicing?.frets) return [];
  if (typeof listVoicingsNear !== "function") return [];
  const ref =
    state.slots[idx - 1]?.voicing ||
    slot.voicing ||
    null;
  const curSig = typeof fretsSignature === "function" ? fretsSignature(slot.voicing.frets) : slot.voicing.frets.join(",");
  // Для смены урезки якорим плотность на текущий (или предыдущий) хват, но не выше 4
  const densityRef = {
    frets: (ref?.frets || slot.voicing.frets).slice(),
    tags: [...new Set([...(ref?.tags || []), "partial", "shell"])],
  };
  // если текущий полный — всё равно предложим урезки от 3–4
  if (densityRef.frets.filter((f) => f >= 0).length >= 5) {
    const f = densityRef.frets.slice();
    f[0] = -1;
    if (f[5] >= 0) f[5] = -1;
    densityRef.frets = f;
  }
  const pool = listVoicingsNear(slot.symbol, densityRef, { limit: 14 })
    .filter((v) => v?.frets)
    .filter((v) => {
      const sig = typeof fretsSignature === "function" ? fretsSignature(v.frets) : v.frets.join(",");
      return sig !== curSig;
    })
    .filter((v) => {
      const n = v.frets.filter((f) => f >= 0).length;
      return n >= 3 && n <= 4;
    });
  return diversifyShellAlts(pool, 4);
}

/* ---------- Path ---------- */

function renderPath() {
  if (!state.slots.length) {
    stage.innerHTML = `
      <p class="kicker">Ход</p>
      <h1 class="h1">Пока пусто</h1>
      <p class="hand-note">Добавьте хотя бы один аккорд с грифа.</p>
      <div class="actions"><button type="button" class="btn btn-glow" id="backFret">К грифу</button></div>`;
    document.getElementById("backFret").addEventListener("click", () => setScreen("fret"));
    return;
  }

  const route = pathSymbols().join(" → ");
  const cards = state.slots
    .map((slot, idx) => {
      let diag = "";
      if (slot.voicing?.frets && typeof renderChordSvg === "function") {
        diag = renderChordSvg(slot.symbol, slot.voicing, { step: idx + 1 });
      } else if (slot.voicing?.midis && typeof renderPianoSvg === "function") {
        diag = renderPianoSvg({
          symbol: slot.symbol,
          midis: slot.voicing.midis,
          fingers: typeof pianoFingers === "function" ? pianoFingers(slot.voicing.midis) : [],
        }, { step: idx + 1 });
      }
      const shellAlts = slotShellAlts(idx);
      const derived = !!(slot.voicing?.derived || (slot.voicing?.tags || []).includes("derived") || (slot.voicing?.tags || []).includes("shell"));
      const sounding = (slot.voicing?.frets || []).filter((f) => f >= 0).length;
      const densityNote = sounding
        ? `<p class="slot-card__density">${sounding} стр.${derived ? " · под ваш хват" : ""}</p>`
        : "";
      const altsHtml = shellAlts.length
        ? `<div class="slot-card__alts" aria-label="Другие урезанные">
            <p class="slot-card__alts-label">Другие урезанные</p>
            <div class="slot-card__alts-row">${shellAlts
              .map((alt, ai) => {
                const mini =
                  alt.frets && typeof renderChordSvg === "function"
                    ? renderChordSvg(slot.symbol, alt, { width: 72, height: 94 })
                    : "";
                const title = (alt.name || "вариант").replace(/"/g, "&quot;");
                return `<button type="button" class="slot-alt" data-slot-alt="${idx}" data-alt-idx="${ai}" title="${title}">${mini}</button>`;
              })
              .join("")}</div>
          </div>`
        : "";
      // stash for click handlers
      slot._shellAlts = shellAlts;
      return `
        <article class="slot-card" draggable="true" data-slot-id="${slot.id}" data-slot-idx="${idx}">
          <div class="slot-card__top">
            <span class="slot-card__idx">${idx + 1}</span>
            <strong>${slot.symbol}</strong>
            <span class="slot-card__voicing">${slot.voicing?.name || ""}</span>
          </div>
          ${densityNote}
          ${diag}
          ${altsHtml}
          <div class="slot-card__actions">
            ${
              slot.voicing?.frets
                ? `<button type="button" class="btn btn-ghost btn-tiny" data-play-frets="${slot.voicing.frets.join(",")}">▶</button>`
                : slot.voicing?.midis
                  ? `<button type="button" class="btn btn-ghost btn-tiny" data-play-notes="${slot.voicing.midis.join(",")}">▶</button>`
                  : ""
            }
            <button type="button" class="btn btn-ghost btn-tiny" data-dup="${idx}">Дублировать</button>
            <button type="button" class="btn btn-ghost btn-tiny" data-up="${idx}" ${idx === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="btn btn-ghost btn-tiny" data-down="${idx}" ${idx === state.slots.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" class="btn btn-ghost btn-tiny" data-del="${idx}">Убрать</button>
          </div>
        </article>`;
    })
    .join("");

  stage.innerHTML = `
    <p class="kicker">Ход</p>
    <h1 class="h1">${route}</h1>
    <p class="hand-note">Переставляйте, дублируйте постановки · тяните карточку</p>
    ${renderLoopPanel()}
    <div class="slot-list" id="slotList">${cards}</div>
    <div class="actions sticky-actions">
      <button type="button" class="btn btn-glow" id="toSolo">К соло</button>
      <button type="button" class="btn btn-glow" id="exportPdf">${hasPlus() ? "Выгрузить PDF" : "Показать лист PDF"}</button>
      <button type="button" class="btn btn-primary" id="toDevelop2">Развитие идей</button>
      <button type="button" class="btn btn-primary" id="backFret2">Ещё аккорд</button>
      <button type="button" class="btn btn-ghost" id="copyPath">Скопировать</button>
      <button type="button" class="btn btn-ghost" id="clearPath">Очистить</button>
    </div>
    ${renderPdfPreviewBlock()}
    <p class="song-save-status" id="pathStatus" hidden></p>
  `;

  document.getElementById("toDevelop2").addEventListener("click", () => setScreen("develop"));
  document.getElementById("toSolo").addEventListener("click", () => setScreen("solo"));
  document.getElementById("exportPdf").addEventListener("click", () => exportRiffPdfOrPreview());
  document.getElementById("backFret2").addEventListener("click", () => setScreen("fret"));
  document.getElementById("copyPath").addEventListener("click", async () => {
    const text = pathSymbols().join(" → ");
    try {
      await navigator.clipboard.writeText(text);
      flash("Скопировано: " + text);
    } catch (_) {
      flash(text);
    }
  });
  document.getElementById("clearPath").addEventListener("click", () => {
    stopRiffLoopUi();
    state.slots = [];
    setScreen("fret");
  });

  bindLoopPanel();
  stage.querySelectorAll("[data-dup]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = +btn.dataset.dup;
      const s = state.slots[i];
      addSlot(s.symbol, s.voicing, { duplicateOf: i });
      renderPath();
    });
  });
  stage.querySelectorAll("[data-up]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = +btn.dataset.up;
      if (i <= 0) return;
      const t = state.slots[i - 1];
      state.slots[i - 1] = state.slots[i];
      state.slots[i] = t;
      renderPath();
    });
  });
  stage.querySelectorAll("[data-down]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = +btn.dataset.down;
      if (i >= state.slots.length - 1) return;
      const t = state.slots[i + 1];
      state.slots[i + 1] = state.slots[i];
      state.slots[i] = t;
      renderPath();
    });
  });
  stage.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.slots.splice(+btn.dataset.del, 1);
      if (!state.slots.length) {
        stopRiffLoopUi();
        setScreen("fret");
        return;
      }
      if (typeof LadRiffLoop !== "undefined" && LadRiffLoop.isPlaying()) startRiffLoop();
      renderPath();
    });
  });
  stage.querySelectorAll("[data-slot-alt]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const si = +btn.dataset.slotAlt;
      const ai = +btn.dataset.altIdx;
      const slot = state.slots[si];
      const alt = slot?._shellAlts?.[ai];
      if (!slot || !alt?.frets) return;
      slot.voicing = {
        ...alt,
        frets: alt.frets.slice(),
        tags: [...(alt.tags || [])],
      };
      try {
        if (typeof LadAudio !== "undefined" && typeof LadAudio.playVoicing === "function") {
          LadAudio.playVoicing(alt.frets);
        }
      } catch (_) {}
      if (typeof LadRiffLoop !== "undefined" && LadRiffLoop.isPlaying()) startRiffLoop();
      renderPath();
    });
  });

  // drag reorder
  const list = document.getElementById("slotList");
  list?.querySelectorAll(".slot-card").forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      state.dragFrom = +card.dataset.slotIdx;
      e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      card.classList.add("is-drag-over");
    });
    card.addEventListener("dragleave", () => card.classList.remove("is-drag-over"));
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.classList.remove("is-drag-over");
      const to = +card.dataset.slotIdx;
      const from = state.dragFrom;
      if (from == null || from === to) return;
      const item = state.slots.splice(from, 1)[0];
      state.slots.splice(to, 0, item);
      state.dragFrom = null;
      renderPath();
    });
  });

  bindPdfPreviewActions();
}

function flash(text) {
  const el =
    document.getElementById("pathStatus") ||
    document.getElementById("devStatus") ||
    document.getElementById("soloStatus");
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
}

/* ---------- Develop ---------- */

function chordLooksMinor(symbol) {
  const p = typeof parseChord === "function" ? parseChord(symbol) : null;
  if (p) return !!p.isMinor;
  return /m(?!aj)/i.test(String(symbol || "").replace(/^[A-G][b#]?/, ""));
}

function resolveDevelopMood() {
  if (state.developMood) return state.developMood;
  const start = pathSymbols()[0];
  return chordLooksMinor(start) ? "dark" : "bright";
}

function catalogMoodList() {
  if (typeof MOODS !== "undefined" && Array.isArray(MOODS)) return MOODS;
  if (typeof LadCatalog !== "undefined" && Array.isArray(LadCatalog.MOODS)) return LadCatalog.MOODS;
  return [
    { id: "bright", title: "Светлое" },
    { id: "dark", title: "Тёмное" },
    { id: "tense", title: "Напряжённое" },
    { id: "dream", title: "Мечтательное" },
    { id: "groovy", title: "Грув" },
  ];
}

function fetchCatalogIdeas() {
  const path = pathSymbols();
  if (!path.length) return { key: null, ideas: [], mood: "dark" };
  const progFn =
    typeof progressionsFor === "function"
      ? progressionsFor
      : typeof LadCatalog !== "undefined"
        ? LadCatalog.progressionsFor
        : null;
  if (!progFn) return { key: null, ideas: [], mood: resolveDevelopMood() };
  const mood = resolveDevelopMood();
  const start = path[0];
  const { key, ideas } = progFn({
    start,
    mood,
    move: "home",
    part: "verse",
    style: "all",
  });
  return { key, ideas: ideas || [], mood };
}

function symbolsMatch(a, b) {
  return String(a || "").replace(/\s/g, "") === String(b || "").replace(/\s/g, "");
}

function pathKeyCenter() {
  const start = pathSymbols()[0];
  if (!start || typeof parseChord !== "function" || typeof guessKey !== "function") {
    return { symbol: start || "", key: null, degrees: null };
  }
  const parsed = parseChord(start);
  if (!parsed) return { symbol: start, key: null, degrees: null };
  const key = guessKey(parsed);
  const degrees = typeof degreeMap === "function" ? degreeMap(key) : null;
  return { symbol: start, key, degrees };
}


const NEXT_FLAVOR_KEY = "lad-riff-next-flavor";

function resolveNextFlavor() {
  const v = state.nextFlavor;
  if (v === "simple" || v === "spicy" || v === "both") return v;
  return "both";
}

function setNextFlavor(id) {
  const v = id === "simple" || id === "spicy" || id === "both" ? id : "both";
  state.nextFlavor = v;
  try {
    localStorage.setItem(NEXT_FLAVOR_KEY, v);
  } catch (_) {}
}

function simpleNextRoles(isMin) {
  return isMin
    ? [
        { deg: "V7", role: "доминанта", why: "Острая тяга обратно к тонике." },
        { deg: "iv", role: "субдоминанта", why: "Плагальный шаг внутрь минора." },
        { deg: "bVII", role: "bVII", why: "Светлый aeolian / рок-шаг." },
        { deg: "bVI", role: "bVI", why: "Тёмная краска — часто перед bVII или V." },
        { deg: "bIII", role: "bIII", why: "Родственный мажор: мягкий свет." },
        { deg: "iim7b5", role: "iiø", why: "Подготовка к доминанте (ii–V)." },
        { deg: "v", role: "v минор", why: "Мягкая доминанта без острого V7." },
        { deg: "IV", role: "IV мажор", why: "Дорийский свет поверх минора." },
        { deg: "i", role: "тоника", why: "Возврат домой." },
      ]
    : [
        { deg: "V", role: "доминанта", why: "Классическая тяга к I." },
        { deg: "V7", role: "доминанта 7", why: "Сильнее тянет к тонике." },
        { deg: "IV", role: "субдоминанта", why: "Плагальный шаг, открытый воздух." },
        { deg: "vi", role: "vi", why: "Относительный минор — тень без смены тональности." },
        { deg: "ii", role: "ii", why: "Подготовка к V (ii–V–I)." },
        { deg: "iii", role: "iii", why: "Мягкий подъём без драмы." },
        { deg: "bVII", role: "bVII", why: "Миксолидийский / рок-заимствование." },
        { deg: "I", role: "тоника", why: "Возврат домой." },
      ];
}

function spicyNextRoles(isMin) {
  return isMin
    ? [
        { deg: "bIaug", role: "подход +", why: "Хроматический подход к тонике: общий терцовый каркас, сдвиг корня на полтона (как Am → Abaug)." },
        { deg: "bVIaug", role: "bVI+", why: "Увеличенная краска от bVI — киношный поворот перед V или тоникой." },
        { deg: "imaj7", role: "i(maj7)", why: "Тоника с мажорной септимой — джазовый «внутренний» свет." },
        { deg: "V7alt", role: "V7alt", why: "Альтерированная доминанта: максимальное напряжение перед i." },
        { deg: "V7sharp9", role: "V7#9", why: "Доминанта с #9 — блюз/фьюжн-огонь." },
        { deg: "V7flat9", role: "V7b9", why: "Доминанта с b9 — тёмный джазовый укол." },
        { deg: "VIIdim7", role: "vii°7", why: "Уменьшённый проход / ведущий тон — вкручивает в тонику." },
        { deg: "subV", role: "субV", why: "Тритоновая замена доминанты — сдвиг на полтона вниз вместо V7." },
        { deg: "bIImaj", role: "bII", why: "Неаполитанская краска — фригийский привкус." },
        { deg: "bIImaj7", role: "bIImaj7", why: "Неаполитанский мажор-септаккорд — мягче, чем голый bII." },
        { deg: "bVImaj7", role: "bVImaj7", why: "Кино / баллада: широкая мажорная краска над минором." },
        { deg: "II7", role: "V/V", why: "Вторичная доминанта к V — разгон перед каденцией." },
      ]
    : [
        { deg: "Iaug", role: "I+", why: "Увеличенная тоника — сдвиг вверх, часто в припев или как обман." },
        { deg: "bVIaug", role: "bVI+", why: "Хроматическая медианта с увеличением — неожиданный свет/тень." },
        { deg: "bIIIaug", role: "bIII+", why: "Увеличенный медиант — поп/прог-поворот." },
        { deg: "Imaj7sharp11", role: "Imaj7#11", why: "Лидийская тоника — воздушная «хитрая» устойчивость." },
        { deg: "V7alt", role: "V7alt", why: "Альтерированная доминанта перед I." },
        { deg: "V7sharp9", role: "V7#9", why: "Доминанта с #9 — фанк/блюз-напряжение." },
        { deg: "V7flat9", role: "V7b9", why: "Доминанта с b9 — джазовый укол к I." },
        { deg: "subV", role: "субV", why: "Тритоновая замена V — доминанта на полтона выше тоники." },
        { deg: "bIImaj7", role: "bIImaj7", why: "Неаполитанский мажор-септаккорд — модальная тень." },
        { deg: "#IVdim", role: "#iv°7", why: "Уменьшённый проход к V или I." },
        { deg: "viidim7", role: "vii°7", why: "Вводный уменьшённый — классический вкруток в тонику." },
        { deg: "bVImaj7", role: "bVImaj7", why: "Заимствование из минора — эпичная краска." },
        { deg: "V7ofV", role: "V/V", why: "Вторичная доминанта к V." },
        { deg: "V7ofvi", role: "V/vi", why: "Вторичная доминанта к относительному минору." },
      ];
}

/**
 * Следующие аккорды по функции в тональности хода.
 * flavor: simple | spicy | both
 */
function buildFunctionalNextChords(path) {
  if (!path?.length) return [];
  const last = path[path.length - 1];
  const { key, degrees: d } = pathKeyCenter();
  if (!key || !d) return [];

  const isMin = key.mode === "minor";
  const flavor = resolveNextFlavor();
  const roles = [];
  if (flavor === "simple" || flavor === "both") {
    simpleNextRoles(isMin).forEach((r) => roles.push({ ...r, spice: "simple" }));
  }
  if (flavor === "spicy" || flavor === "both") {
    // в режиме «все» хитрые сверху — их как раз не хватало
    const spicy = spicyNextRoles(isMin).map((r) => ({ ...r, spice: "spicy" }));
    if (flavor === "both") roles.unshift(...spicy);
    else roles.push(...spicy);
  }

  const limit = flavor === "both" ? 10 : 8;
  const out = [];
  const seen = new Set();
  for (const r of roles) {
    const sym = d[r.deg];
    if (!sym || symbolsMatch(sym, last) || seen.has(sym)) continue;
    seen.add(sym);
    out.push({
      kind: "next",
      symbol: sym,
      role: r.role,
      spice: r.spice,
      title: `Далее → ${sym}`,
      why: `${r.role}: ${r.why}`,
      path: path.concat(sym),
      addSymbol: sym,
      degree: r.deg,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function nextChordsFromCatalog(last, catalogIdeas) {
  const found = [];
  const seen = new Set();
  for (const idea of catalogIdeas) {
    const p = idea.path || [];
    for (let i = 0; i < p.length - 1; i++) {
      if (!symbolsMatch(p[i], last)) continue;
      const n = p[i + 1];
      if (seen.has(n)) continue;
      seen.add(n);
      found.push({ symbol: n, why: idea.why || idea.kind, from: idea.kind });
      if (found.length >= 8) return found;
    }
  }
  return found;
}

function buildIdeas() {
  const path = pathSymbols();
  if (!path.length) return { next: [], rest: [] };
  const last = path[path.length - 1];
  const first = path[0];
  const { key, ideas: catalog, mood } = fetchCatalogIdeas();

  // 1) функциональные «следующие аккорды» — отдельный блок
  const next = buildFunctionalNextChords(path);

  // дополнение из каталога, если функция дала мало (только в «просто» / «все»)
  if (next.length < 5 && resolveNextFlavor() !== "spicy") {
    const have = new Set(next.map((n) => n.symbol));
    nextChordsFromCatalog(last, catalog).forEach((n) => {
      if (have.has(n.symbol) || symbolsMatch(n.symbol, last)) return;
      have.add(n.symbol);
      next.push({
        kind: "next",
        symbol: n.symbol,
        role: "из каталога",
        spice: "simple",
        title: `Далее → ${n.symbol}`,
        why: n.why || `Частый шаг после ${last} в каталоге Песни.`,
        path: path.concat(n.symbol),
        addSymbol: n.symbol,
      });
    });
  }

  const rest = [];

  // 2) готовые ходы из каталога Песни
  const pathKey = path.join("→");
  catalog.slice(0, 14).forEach((idea) => {
    const ideaPath = idea.path || [];
    if (!ideaPath.length) return;
    if (ideaPath.join("→") === pathKey) return;
    const canAppend =
      ideaPath.length > 1 && symbolsMatch(ideaPath[0], last) ? ideaPath.slice(1) : null;
    rest.push({
      kind: "catalog",
      title: idea.kind,
      why: [idea.family, idea.why].filter(Boolean).join(" · "),
      path: ideaPath,
      setPath: ideaPath,
      appendSymbols: canAppend,
      family: idea.family,
      style: idea.style,
      mood,
      keyLabel: key ? `${key.tonic}${key.mode === "minor" ? "m" : ""}` : "",
    });
  });

  // 3) другие постановки
  const uniq = [...new Set(path)];
  uniq.forEach((sym) => {
    const vs = typeof getGuitarVoicings === "function" ? getGuitarVoicings(sym) : [];
    if (vs.length > 1) {
      rest.push({
        kind: "voicing",
        title: `Другие постановки ${sym}`,
        why: `${vs.length} вариантов в базе — смените хват, не меняя гармонию.`,
        path: path.slice(),
        focusSymbol: sym,
        voicings: vs.slice(0, 6),
      });
    }
  });

  // 4) родственная замена
  const subs = { G: "Em", Em: "G", C: "Am", Am: "C", F: "Dm", Dm: "F", D: "Bm", A: "F#m", E: "C#m", B: "G#m" };
  if (subs[last]) {
    rest.push({
      kind: "swap",
      title: `Заменить ${last} → ${subs[last]}`,
      why: "Родственная замена: мягче или светлее при том же каркасе.",
      path: path.slice(0, -1).concat(subs[last]),
      replaceLast: subs[last],
    });
  }

  // 5) петля
  if (path.length === 1) {
    rest.push({
      kind: "vamp",
      title: `Вамп ${first}–${first}`,
      why: "Держите один аккорд петлёй — удобно под соло и рифф.",
      path: [first, first, first, first],
    });
  } else if (path.length >= 2) {
    const loop = path.slice(0, 2);
    rest.push({
      kind: "vamp",
      title: `Петля ${loop.join("–")}`,
      why: "Короткий рифф из первых двух звеньев — основа под куплет или соло.",
      path: [...loop, ...loop],
    });
  }

  const ref = lastPathVoicing();
  next.forEach((idea) => {
    idea.voicing = voicingForSymbol(idea.symbol, ref);
    if (typeof listVoicingsNear === "function") {
      const alts = listVoicingsNear(idea.symbol, ref, { limit: 3 });
      idea.voicingAlts = alts.filter(
        (v) => !idea.voicing?.frets || v.frets?.join(",") !== idea.voicing.frets.join(",")
      );
    } else {
      idea.voicingAlts = [];
    }
  });

  return { next: next.slice(0, 8), rest: rest.slice(0, 16) };
}


function lastPathVoicing() {
  const last = state.slots[state.slots.length - 1];
  return last?.voicing || null;
}

function fallbackVoicing(symbol) {
  if (typeof getGuitarVoicings === "function") {
    const list = getGuitarVoicings(symbol);
    if (list?.length) return list[0];
  }
  return { name: "—", frets: emptyFrets(), instrument: "guitar" };
}

/** Постановка символа рядом с хватом хода (или дефолт). */
function voicingForSymbol(symbol, reference = lastPathVoicing()) {
  if (!symbol) return fallbackVoicing("");
  if (typeof pickVoicingNear === "function") {
    return pickVoicingNear(symbol, reference) || fallbackVoicing(symbol);
  }
  return fallbackVoicing(symbol);
}

function cloneVoicing(v) {
  if (!v) return null;
  return {
    ...v,
    frets: v.frets ? v.frets.slice() : undefined,
    midis: v.midis ? v.midis.slice() : undefined,
    tags: v.tags ? [...v.tags] : undefined,
  };
}

/** Прослушать текущий ход + опционально следующий хват. */
function playPathWithExtra(extraVoicing) {
  if (typeof stopRiffLoopUi === "function") stopRiffLoopUi();
  const audio = typeof LadAudio !== "undefined" ? LadAudio : null;
  if (!audio?.playVoicingSequence) {
    flash("Звук пока недоступен.");
    return false;
  }
  const items = state.slots
    .map((s) => s.voicing)
    .filter(Boolean)
    .map((v) => (v.frets ? { frets: v.frets } : v.midis ? { midis: v.midis } : null))
    .filter(Boolean);
  if (extraVoicing?.frets) items.push({ frets: extraVoicing.frets });
  else if (extraVoicing?.midis) items.push({ midis: extraVoicing.midis });
  if (!items.length) return false;
  const tempo = state.loop?.tempo || 90;
  const gap = Math.max(0.65, Math.min(1.15, 60 / tempo));
  audio.unlockAudio?.();
  return audio.playVoicingSequence(items, { gapSec: gap });
}

function playSymbolPathPreview(symbols, seed = lastPathVoicing()) {
  if (typeof stopRiffLoopUi === "function") stopRiffLoopUi();
  const audio = typeof LadAudio !== "undefined" ? LadAudio : null;
  if (!audio?.playVoicingSequence) return false;
  const chain =
    typeof pickVoicingChain === "function"
      ? pickVoicingChain(symbols, seed)
      : (symbols || []).map((sym) => voicingForSymbol(sym, seed));
  const items = chain
    .map((v) => (v?.frets ? { frets: v.frets } : v?.midis ? { midis: v.midis } : null))
    .filter(Boolean);
  if (!items.length) return false;
  const tempo = state.loop?.tempo || 90;
  const gap = Math.max(0.65, Math.min(1.15, 60 / tempo));
  audio.unlockAudio?.();
  return audio.playVoicingSequence(items, { gapSec: gap });
}

function renderNextChordBlock(nextIdeas, key) {
  if (!nextIdeas?.length && !pathSymbols().length) return "";
  const keyHint = key
    ? `${key.tonic}${key.mode === "minor" ? "m" : key.mode === "mixo" ? "7" : ""}`
    : pathSymbols()[0] || "";
  const flavor = resolveNextFlavor();
  const flavorChips = `
    <div class="chip-row next-flavor" role="group" aria-label="Сложность следующего аккорда">
      <button type="button" class="chip chip-btn ${flavor === "simple" ? "is-on" : ""}" data-next-flavor="simple">Просто</button>
      <button type="button" class="chip chip-btn ${flavor === "spicy" ? "is-on" : ""}" data-next-flavor="spicy">Хитро</button>
      <button type="button" class="chip chip-btn ${flavor === "both" ? "is-on" : ""}" data-next-flavor="both">Все</button>
    </div>`;
  if (!nextIdeas?.length) {
    return `
    <section class="next-chord-block" aria-label="Следующий аккорд">
      <div class="next-chord-block__head">
        <p class="kicker">Следующий аккорд</p>
        <p class="hand-note">По функции в тональности ${keyHint}</p>
      </div>
      ${flavorChips}
      <p class="hand-note">Нет вариантов в этом режиме — переключите «Просто / Хитро».</p>
    </section>`;
  }
  const ref = lastPathVoicing();
  const cards = nextIdeas
    .map((idea) => {
      const v = idea.voicing || voicingForSymbol(idea.symbol, ref);
      const diag =
        v && typeof renderChordSvg === "function"
          ? renderChordSvg(idea.symbol, v, { width: 92, height: 118 })
          : "";
      const fretAttr = v?.frets ? ` data-preview-frets="${v.frets.join(",")}"` : "";
      const midiAttr = v?.midis ? ` data-preview-midis="${v.midis.join(",")}"` : "";
      const addFretAttr = v?.frets ? ` data-add-frets="${v.frets.join(",")}"` : "";
      const sounding = (v?.frets || []).filter((f) => f >= 0).length;
      const derived = !!(v?.derived || (v?.tags || []).includes("derived"));
      const gripHint = v?.name ? `<p class="next-chord-card__grip">${v.name}</p>` : "";
      const densityHint = sounding
        ? `<p class="next-chord-card__density">${sounding} стр.${derived ? " · под ваш хват" : ""}</p>`
        : "";
      const alts = (idea.voicingAlts || []).slice(0, 2);
      const altsHtml = alts.length
        ? `<div class="next-chord-card__alts" aria-label="Другие в том же стиле">${alts
            .map((alt) => {
              const mini =
                typeof renderChordSvg === "function"
                  ? renderChordSvg(idea.symbol, alt, { width: 64, height: 84 })
                  : "";
              const af = alt.frets ? ` data-preview-frets="${alt.frets.join(",")}" data-add-frets="${alt.frets.join(",")}"` : "";
              return `<button type="button" class="next-chord-alt" data-idea-add="${idea.addSymbol}"${af} title="${alt.name || "вариант"}">${mini}</button>`;
            })
            .join("")}</div>`
        : "";
      const spice =
        idea.spice === "spicy"
          ? `<span class="next-chord-card__spice">хитро</span>`
          : idea.spice === "simple"
            ? `<span class="next-chord-card__spice is-simple">просто</span>`
            : "";
      return `
      <article class="next-chord-card ${idea.spice === "spicy" ? "is-spicy" : ""}">
        <p class="next-chord-card__role">${idea.role || "далее"}${spice}</p>
        <h3 class="next-chord-card__sym">${idea.symbol}</h3>
        <p class="next-chord-card__why">${idea.why}</p>
        ${gripHint}
        ${densityHint}
        <div class="next-chord-card__diag">${diag}</div>
        ${altsHtml}
        <div class="next-chord-card__actions">
          <button type="button" class="btn btn-ghost btn-tiny" data-preview-with-path${fretAttr}${midiAttr}>▶ с ходом</button>
          <button type="button" class="btn btn-glow btn-tiny" data-idea-add="${idea.addSymbol}"${addFretAttr}>В ход</button>
        </div>
      </article>`;
    })
    .join("");
  return `
    <section class="next-chord-block" aria-label="Следующий аккорд">
      <div class="next-chord-block__head">
        <p class="kicker">Следующий аккорд</p>
        <p class="hand-note">По функции в тональности ${keyHint} · плотность хвата как у вас · один шаг</p>
      </div>
      ${flavorChips}
      <div class="next-chord-grid">${cards}</div>
    </section>`;
}


function renderIdeaCard(idea) {
  let extra = "";
  if (idea.voicings) {
    extra = `<div class="voicing-strip">${idea.voicings
      .map((v) => renderChordSvg(idea.focusSymbol, v, { width: 84, height: 110 }))
      .join("")}</div>`;
  } else {
    extra = `<p class="idea-path">${idea.path.join(" → ")}</p>`;
  }
  const kindLabel =
    idea.kind === "catalog"
      ? idea.family || "каталог"
      : idea.kind === "continue" || idea.kind === "next"
        ? "далее"
        : idea.kind;
  return `
    <article class="idea-card">
      <p class="idea-card__kind">${kindLabel}</p>
      <h3 class="idea-card__title">${idea.title}</h3>
      <p class="idea-card__why">${idea.why}</p>
      ${extra}
      <div class="actions">
        ${
          idea.addSymbol
            ? `<button type="button" class="btn btn-ghost btn-tiny" data-preview-with-path data-preview-symbol="${idea.addSymbol}">▶ с ходом</button>
               <button type="button" class="btn btn-glow btn-tiny" data-idea-add="${idea.addSymbol}">Добавить в ход</button>`
            : ""
        }
        ${
          idea.setPath
            ? `<button type="button" class="btn btn-ghost btn-tiny" data-preview-path="${idea.setPath.join("|")}">▶ ход</button>
               <button type="button" class="btn btn-glow btn-tiny" data-idea-set="${idea.setPath.join("|")}">Поставить ход</button>`
            : ""
        }
        ${
          idea.appendSymbols?.length
            ? `<button type="button" class="btn btn-ghost btn-tiny" data-preview-path="${[...pathSymbols(), ...idea.appendSymbols].join("|")}">▶ с ходом</button>
               <button type="button" class="btn btn-ghost btn-tiny" data-idea-append="${idea.appendSymbols.join("|")}">Добавить хвост</button>`
            : ""
        }
        ${
          idea.replaceLast
            ? `<button type="button" class="btn btn-glow btn-tiny" data-idea-replace="${idea.replaceLast}">Применить замену</button>`
            : ""
        }
        ${
          idea.kind === "vamp"
            ? `<button type="button" class="btn btn-glow btn-tiny" data-idea-set="${idea.path.join("|")}">Поставить петлю</button>`
            : ""
        }
        ${
          idea.focusSymbol
            ? `<button type="button" class="btn btn-ghost btn-tiny" data-idea-focus="${idea.focusSymbol}">К постановкам</button>`
            : ""
        }
      </div>
    </article>`;
}

function applyIdeaPath(symbols) {
  const list = (symbols || []).filter(Boolean);
  if (!list.length) return;
  const seed = lastPathVoicing();
  const chain =
    typeof pickVoicingChain === "function"
      ? pickVoicingChain(list, seed)
      : list.map((sym, i) => voicingForSymbol(sym, i ? null : seed));
  let prev = seed;
  state.slots = list.map((sym, i) => {
    const v = cloneVoicing(chain[i] || voicingForSymbol(sym, prev)) || fallbackVoicing(sym);
    prev = v;
    return { id: uid(), symbol: sym, voicing: v };
  });
}

function appendIdeaSymbols(symbols) {
  (symbols || []).forEach((sym) => {
    const v = cloneVoicing(voicingForSymbol(sym, lastPathVoicing())) || fallbackVoicing(sym);
    addSlot(sym, v);
  });
}

function renderDevelopMoodChips() {
  const active = resolveDevelopMood();
  const auto = !state.developMood;
  const chips = catalogMoodList()
    .map(
      (m) =>
        `<button type="button" class="chip chip-btn ${active === m.id && !auto ? "is-on" : ""}" data-dev-mood="${m.id}">${m.title}</button>`
    )
    .join("");
  return `
    <div class="chip-row develop-moods" aria-label="Настроение каталога">
      <button type="button" class="chip chip-btn ${auto ? "is-on" : ""}" data-dev-mood="auto">Авто</button>
      ${chips}
    </div>
    <p class="hand-note">Каталог ходов — как в Песне · центр ${pathSymbols()[0] || "—"}${auto ? ` · настроение «${active}»` : ""}</p>`;
}

function renderDevelop() {
  if (!state.slots.length) {
    setScreen("fret");
    return;
  }
  const { next, rest } = buildIdeas();
  const route = pathSymbols().join(" → ");
  const { key } = pathKeyCenter();
  const keyHint = key
    ? ` · тональность ${key.tonic}${key.mode === "minor" ? "m" : key.mode === "mixo" ? "7" : ""}`
    : "";

  const blocks = rest.map(renderIdeaCard).join("");

  stage.innerHTML = `
    <p class="kicker">Развитие</p>
    <h1 class="h1">Идеи вокруг хода</h1>
    <p class="hand-note">${route}${keyHint}</p>
    ${renderNextChordBlock(next, key)}
    ${renderDevelopMoodChips()}
    <div class="idea-list">${blocks || "<p class='hand-note'>Добавьте аккорд — появятся идеи.</p>"}</div>
    <div class="actions sticky-actions">
      <button type="button" class="btn btn-primary" id="backPath">К ходу</button>
      <button type="button" class="btn btn-glow" id="toSolo2">К соло</button>
      <button type="button" class="btn btn-glow" id="exportPdf2">${hasPlus() ? "Выгрузить PDF" : "Показать лист PDF"}</button>
      <button type="button" class="btn btn-ghost" id="backFret3">К грифу</button>
      ${
        hasPlus()
          ? `<button type="button" class="btn btn-ghost" id="saveRiff">Сохранить</button>`
          : `<button type="button" class="btn btn-ghost" id="needPlus">Сохранение — в Лад+</button>`
      }
    </div>
    ${renderPdfPreviewBlock()}
    <p class="song-save-status" id="devStatus" hidden></p>
  `;

  document.getElementById("backPath").addEventListener("click", () => setScreen("path"));
  document.getElementById("toSolo2")?.addEventListener("click", () => setScreen("solo"));
  document.getElementById("exportPdf2")?.addEventListener("click", () => exportRiffPdfOrPreview());
  document.getElementById("backFret3").addEventListener("click", () => setScreen("fret"));
  document.getElementById("needPlus")?.addEventListener("click", () => {
    flash("Лад+ нужен только для сохранения и PDF. Включите в Песне или localStorage lad-plus=1.");
  });
  document.getElementById("saveRiff")?.addEventListener("click", () => {
    try {
      localStorage.setItem(SONG_KEY, JSON.stringify({ slots: state.slots, savedAt: Date.now() }));
      flash("Рифф сохранён на этом устройстве.");
    } catch (_) {
      flash("Не удалось сохранить.");
    }
  });


  stage.querySelectorAll("[data-next-flavor]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setNextFlavor(btn.dataset.nextFlavor);
      renderDevelop();
    });
  });

  stage.querySelectorAll("[data-dev-mood]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.devMood;
      state.developMood = id === "auto" ? null : id;
      renderDevelop();
    });
  });

  stage.querySelectorAll("[data-preview-with-path]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      let extra = null;
      if (btn.dataset.previewFrets) {
        extra = { frets: btn.dataset.previewFrets.split(",").map((n) => parseInt(n, 10)) };
      } else if (btn.dataset.previewMidis) {
        extra = { midis: btn.dataset.previewMidis.split(",").map((n) => parseInt(n, 10)) };
      } else if (btn.dataset.previewSymbol) {
        extra = voicingForSymbol(btn.dataset.previewSymbol, lastPathVoicing());
      }
      playPathWithExtra(extra);
    });
  });
  stage.querySelectorAll("[data-preview-path]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const syms = (btn.dataset.previewPath || "").split("|").filter(Boolean);
      playSymbolPathPreview(syms, lastPathVoicing());
    });
  });
  stage.querySelectorAll("[data-idea-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sym = btn.dataset.ideaAdd;
      let v = null;
      if (btn.dataset.addFrets) {
        const frets = btn.dataset.addFrets.split(",").map((n) => parseInt(n, 10));
        v = {
          name: "под ваш хват",
          frets,
          tags: ["from-idea"],
          instrument: "guitar",
        };
      } else {
        v = cloneVoicing(voicingForSymbol(sym, lastPathVoicing())) || fallbackVoicing(sym);
      }
      addSlot(sym, v);
      setScreen("path");
    });
  });
  stage.querySelectorAll("[data-idea-replace]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sym = btn.dataset.ideaReplace;
      const last = state.slots[state.slots.length - 1];
      if (!last) return;
      const prev = state.slots[state.slots.length - 2]?.voicing || last.voicing;
      last.symbol = sym;
      last.voicing = cloneVoicing(voicingForSymbol(sym, prev)) || last.voicing;
      setScreen("path");
    });
  });
  stage.querySelectorAll("[data-idea-set]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyIdeaPath(btn.dataset.ideaSet.split("|"));
      setScreen("path");
    });
  });
  stage.querySelectorAll("[data-idea-append]").forEach((btn) => {
    btn.addEventListener("click", () => {
      appendIdeaSymbols(btn.dataset.ideaAppend.split("|"));
      setScreen("path");
    });
  });
  stage.querySelectorAll("[data-idea-focus]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.preferredSymbol = btn.dataset.ideaFocus;
      state.preferredReason = "из идей развития";
      state.voicingPinned = false;
      state.selectedVoicingId = null;
      setScreen("fret");
    });
  });
  bindPdfPreviewActions();
}

/* ---------- Solo ---------- */

function renderSolo() {
  if (!state.slots.length) {
    setScreen("fret");
    return;
  }
  const plus = hasPlus();
  const item = riffSoloItem();
  const route = pathSymbols().join(" → ");
  const voice = typeof LadTheory !== "undefined" ? LadTheory.getVoice() : "plain";
  const voiceToggle = typeof LadTheory !== "undefined" ? LadTheory.renderVoiceToggleMini() : "";

  if (!plus) {
    stage.innerHTML = `
      <p class="kicker">Соло</p>
      <h1 class="h1">Лад над риффом</h1>
      <p class="hand-note">${route}</p>
      <section class="solo-suggest is-locked">
        <h2 class="solo-suggest__title">Подберём лад для соло</h2>
        <p class="hand-note">2–3 лада под ваш ход, боксы на грифе и прослушивание. Доступно в Лад+.</p>
        <div class="actions">
          <button type="button" class="btn btn-glow" id="needPlusSolo">Открыть в Лад+</button>
          <button type="button" class="btn btn-ghost" id="soloBackPath">К ходу</button>
        </div>
      </section>
      ${renderPdfPreviewBlock()}
      <p class="song-save-status" id="soloStatus" hidden></p>`;
    document.getElementById("needPlusSolo")?.addEventListener("click", () => {
      flash("Лад+ общий с Песней. Включите там — соло и PDF откроются здесь же.");
    });
    document.getElementById("soloBackPath")?.addEventListener("click", () => setScreen("path"));
    bindPdfPreviewActions();
    return;
  }

  const suggestion =
    item && typeof LadTheory !== "undefined" ? LadTheory.suggestSoloModes(item, { moodId: item.mood }) : null;
  if (suggestion?.modes?.length && !suggestion.modes.some((m) => m.id === state.soloBoxesModeId)) {
    state.soloBoxesModeId = null;
  }

  let modesHtml = "";
  if (!suggestion?.modes?.length) {
    modesHtml = `<p class="hand-note">Не удалось подобрать лад для этого хода. Добавьте ещё аккорд или смените центр.</p>`;
  } else {
    modesHtml = suggestion.modes
      .map((mode, idx) => {
        const title = LadTheory.soloModeTitle(mode, voice);
        const why = LadTheory.soloModeWhy(mode, voice);
        const notes = mode.notes.join(" · ");
        const boxesOpen = state.soloBoxesModeId === mode.id;
        const diagrams =
          boxesOpen && typeof renderScaleDiagrams === "function"
            ? renderScaleDiagrams(mode.notes, {
                root: suggestion.home,
                label: "Позиции на грифе · R = корень",
                midis: mode.midis,
              })
            : "";
        const playOnly =
          !boxesOpen && mode.midis?.length
            ? `<button type="button" class="btn btn-glow btn-tiny scale-play-btn" data-play-melody="${mode.midis.join(",")}" aria-label="Проиграть лад">▶ Проиграть лад</button>`
            : "";
        return `
          <article class="solo-mode ${idx === 0 ? "is-top" : ""}" data-solo-mode="${mode.id}">
            <div class="solo-mode__head">
              <p class="solo-mode__rank">${idx + 1}</p>
              <div>
                <h3 class="solo-mode__name">${title}</h3>
                <p class="solo-mode__notes">${notes}</p>
              </div>
            </div>
            <p class="solo-mode__why">${why}</p>
            <div class="solo-mode__tools">
              <button type="button" class="btn btn-ghost btn-tiny" data-toggle-solo-boxes="${mode.id}" aria-expanded="${boxesOpen ? "true" : "false"}">
                ${boxesOpen ? "Скрыть боксы" : "Боксы на грифе"}
              </button>
              ${playOnly}
            </div>
            ${diagrams}
          </article>`;
      })
      .join("");
  }

  stage.innerHTML = `
    <p class="kicker">Соло</p>
    <h1 class="h1">Над риффом</h1>
    <p class="hand-note">${route}${suggestion?.start ? ` · центр ${suggestion.start}` : ""}${suggestion?.degrees ? ` · ступени ${suggestion.degrees}` : ""}</p>
    ${voiceToggle}
    <section class="solo-suggest is-open" id="soloSuggestPanel">
      <h2 class="solo-suggest__title">Лад для соло</h2>
      <p class="hand-note">Те же правила, что в Песне: покрытие хода, характер, безопасная пентатоника.</p>
      <div class="solo-mode-list">${modesHtml}</div>
    </section>
    ${renderPdfPreviewBlock()}
    <div class="actions sticky-actions">
      <button type="button" class="btn btn-glow" id="exportPdf3">${plus ? "Выгрузить PDF" : "Показать лист PDF"}</button>
      <button type="button" class="btn btn-primary" id="soloBackPath">К ходу</button>
      <button type="button" class="btn btn-ghost" id="soloBackFret">К грифу</button>
    </div>
    <p class="song-save-status" id="soloStatus" hidden></p>
  `;

  document.getElementById("soloBackPath")?.addEventListener("click", () => setScreen("path"));
  document.getElementById("soloBackFret")?.addEventListener("click", () => setScreen("fret"));
  document.getElementById("exportPdf3")?.addEventListener("click", () => exportRiffPdfOrPreview());
  stage.querySelectorAll("[data-toggle-solo-boxes]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.toggleSoloBoxes;
      state.soloBoxesModeId = state.soloBoxesModeId === id ? null : id;
      renderSolo();
    });
  });
  bindMelodyPlayButtons(stage);
  bindPdfPreviewActions();
  suggestion?.modes?.forEach((m) => window.LadAudio?.prefetchMelody?.(m.midis, 55));
}

/* ---------- chrome ---------- */

btnBack.addEventListener("click", () => {
  if (state.screen === "solo") setScreen("path");
  else if (state.screen === "develop") setScreen("path");
  else if (state.screen === "path") setScreen("fret");
  else setScreen("fret");
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const nav = tab.dataset.nav;
    if (nav === "fret") setScreen("fret");
    else if (nav === "path") setScreen("path");
    else if (nav === "develop") setScreen("develop");
  });
});

// restore
try {
  const raw = localStorage.getItem(SONG_KEY);
  if (raw && hasPlus()) {
    const data = JSON.parse(raw);
    if (data?.slots?.length) state.slots = data.slots;
  }
} catch (_) {}

bindVoiceDelegation();
setScreen("fret");
