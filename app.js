/**
 * Лад · Рифф
 * Гриф → аккорд + все постановки → ход (порядок/дубли) → развитие
 */

const LAD_PLUS_KEY = "lad-plus";
const SONG_KEY = "lad-riff-v3";

const state = {
  screen: "fret", // fret | path | develop
  inputMode: "guitar", // guitar | piano
  frets: [-1, -1, -1, -1, -1, -1],
  piano: [],
  baseFret: 1,
  detected: null, // { symbol, score, reason }
  detectHits: [],
  selectedVoicingId: null,
  /** @type {{ id, symbol, voicing }[]} */
  slots: [],
  dragFrom: null,
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
}

function detectNow() {
  state.detected = null;
  state.detectHits = [];
  state.selectedVoicingId = null;
  let hits = [];
  if (state.inputMode === "guitar") {
    if (typeof identifyFromFrets === "function") hits = identifyFromFrets(state.frets) || [];
  } else if (typeof identifyFromMidis === "function") {
    hits = identifyFromMidis(state.piano) || [];
  }
  state.detectHits = hits;
  state.detected = hits[0] || null;
}

function currentVoicings() {
  const sym = state.detected?.symbol;
  if (!sym || typeof getAllVoicings !== "function") return [];
  const instrument = state.inputMode === "piano" ? "piano" : "guitar";
  return getAllVoicings(sym, { instrument });
}

function selectedVoicing() {
  const list = currentVoicings();
  if (!list.length) return null;
  return list.find((v) => v.id === state.selectedVoicingId) || list[0];
}

function addSlot(symbol, voicing, opts = {}) {
  const v = voicing ? { ...voicing } : selectedVoicing();
  if (!symbol || !v) return;
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

/* ---------- Fret / piano input ---------- */

function renderGuitarBoard() {
  const frets = state.frets;
  const base = state.baseFret;
  const nut = base <= 1;
  let cells = "";
  for (let s = 0; s < 6; s++) {
    const f = frets[s];
    const openOn = f === 0;
    const muteOn = f < 0;
    cells += `<div class="fb-string" data-string="${s}">`;
    cells += `<button type="button" class="fb-open ${openOn ? "is-on" : ""} ${muteOn ? "is-mute" : ""}" data-fret-open="${s}" aria-label="Открытая/глушение">${muteOn ? "×" : openOn ? "○" : "·"}</button>`;
    for (let rel = 1; rel <= 5; rel++) {
      const abs = nut ? rel : base + rel - 1;
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
      <div class="fb-board" id="fbBoard">${cells}</div>
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
      const selected = (state.selectedVoicingId || list[0].id) === v.id;
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
      <p class="hand-note">Все разумные формы из базы · выберите и добавьте в ход</p>
      <div class="voicing-strip">${cards}</div>
    </div>`;
}

function renderFret() {
  detectNow();
  const list = currentVoicings();
  if (list.length && !state.selectedVoicingId) state.selectedVoicingId = list[0].id;
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
      renderFret();
    });
  });
  stage.querySelectorAll("[data-pick-detect]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const symPick = btn.dataset.pickDetect;
      const hit = (state.detectHits || []).find((h) => h.symbol === symPick);
      state.detected = hit || { symbol: symPick, reason: "выбор", score: 0 };
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
    renderFret();
  });
  stage.querySelectorAll("[data-midi]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = +btn.dataset.midi;
      const i = state.piano.indexOf(m);
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
    renderFret();
  });
  document.getElementById("fbHear")?.addEventListener("click", () => {
    if (state.inputMode === "guitar") playGuitarGrip();
    else playPianoKeys(state.piano.slice());
  });
  stage.querySelectorAll("[data-pick-voicing]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedVoicingId = btn.dataset.pickVoicing;
      renderFret();
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
      return `
        <article class="slot-card" draggable="true" data-slot-id="${slot.id}" data-slot-idx="${idx}">
          <div class="slot-card__top">
            <span class="slot-card__idx">${idx + 1}</span>
            <strong>${slot.symbol}</strong>
            <span class="slot-card__voicing">${slot.voicing?.name || ""}</span>
          </div>
          ${diag}
          <div class="slot-card__actions">
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
    <div class="slot-list" id="slotList">${cards}</div>
    <div class="actions sticky-actions">
      <button type="button" class="btn btn-glow" id="toDevelop2">Развитие идей</button>
      <button type="button" class="btn btn-primary" id="backFret2">Ещё аккорд</button>
      <button type="button" class="btn btn-ghost" id="copyPath">Скопировать</button>
      <button type="button" class="btn btn-ghost" id="clearPath">Очистить</button>
    </div>
    <p class="song-save-status" id="pathStatus" hidden></p>
  `;

  document.getElementById("toDevelop2").addEventListener("click", () => setScreen("develop"));
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
    state.slots = [];
    setScreen("fret");
  });

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
}

function flash(text) {
  const el = document.getElementById("pathStatus") || document.getElementById("devStatus");
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
}

/* ---------- Develop ---------- */

function buildIdeas() {
  const path = pathSymbols();
  if (!path.length) return [];
  const ideas = [];
  const last = path[path.length - 1];
  const first = path[0];

  // voicing alternatives for each unique symbol
  const uniq = [...new Set(path)];
  uniq.forEach((sym) => {
    const vs = typeof getGuitarVoicings === "function" ? getGuitarVoicings(sym) : [];
    if (vs.length > 1) {
      ideas.push({
        kind: "voicing",
        title: `Другие постановки ${sym}`,
        why: `${vs.length} вариантов в базе — смените хват, не меняя гармонию.`,
        path: path.slice(),
        focusSymbol: sym,
        voicings: vs.slice(0, 6),
      });
    }
  });

  // continue suggestions (simple diatonic neighbors)
  const continueMap = {
    Am: ["G", "F", "Em", "Dm", "C"],
    C: ["G", "Am", "F", "Em", "Dm"],
    G: ["C", "D", "Em", "Am", "Bm"],
    Em: ["Am", "D", "C", "G", "Bm"],
    D: ["G", "A", "Bm", "Em", "F#m"],
    Dm: ["Am", "C", "G", "F", "Bb"],
    F: ["C", "G", "Am", "Dm", "Bb"],
    E: ["A", "B", "C#m", "F#m"],
    A: ["D", "E", "F#m", "Bm"],
  };
  const cont = continueMap[last] || continueMap[first] || ["C", "G", "Am", "F"];
  cont.slice(0, 3).forEach((n) => {
    if (path.includes(n) && path.length > 1) return;
    ideas.push({
      kind: "continue",
      title: `Продолжить → ${n}`,
      why: `После ${last} часто берут ${n}. Добавьте в конец хода.`,
      path: path.concat(n),
      addSymbol: n,
    });
  });

  // substitution
  const subs = { G: "Em", Em: "G", C: "Am", Am: "C", F: "Dm", Dm: "F", D: "Bm", A: "F#m" };
  if (subs[last]) {
    const alt = path.slice(0, -1).concat(subs[last]);
    ideas.push({
      kind: "swap",
      title: `Заменить ${last} → ${subs[last]}`,
      why: "Родственная замена: мягче или светлее при том же каркасе.",
      path: alt,
      replaceLast: subs[last],
    });
  }

  // loop / vamp
  if (path.length === 1) {
    ideas.push({
      kind: "vamp",
      title: `Вамп ${first}–${first}`,
      why: "Держите один аккорд петлёй — удобно под соло и рифф.",
      path: [first, first, first, first],
    });
  } else if (path.length >= 2) {
    const loop = path.slice(0, 2);
    ideas.push({
      kind: "vamp",
      title: `Петля ${loop.join("–")}`,
      why: "Короткий рифф из первых двух звеньев — основа под куплет или соло.",
      path: [...loop, ...loop],
    });
  }

  return ideas.slice(0, 8);
}

function renderDevelop() {
  if (!state.slots.length) {
    setScreen("fret");
    return;
  }
  const ideas = buildIdeas();
  const route = pathSymbols().join(" → ");

  const blocks = ideas
    .map((idea, idx) => {
      let extra = "";
      if (idea.voicings) {
        extra = `<div class="voicing-strip">${idea.voicings
          .map((v) => renderChordSvg(idea.focusSymbol, v, { width: 84, height: 110 }))
          .join("")}</div>`;
      } else {
        extra = `<p class="idea-path">${idea.path.join(" → ")}</p>`;
      }
      return `
        <article class="idea-card">
          <p class="idea-card__kind">${idea.kind}</p>
          <h3 class="idea-card__title">${idea.title}</h3>
          <p class="idea-card__why">${idea.why}</p>
          ${extra}
          <div class="actions">
            ${
              idea.addSymbol
                ? `<button type="button" class="btn btn-glow btn-tiny" data-idea-add="${idea.addSymbol}">Добавить в ход</button>`
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
    })
    .join("");

  stage.innerHTML = `
    <p class="kicker">Развитие</p>
    <h1 class="h1">Идеи вокруг хода</h1>
    <p class="hand-note">${route}</p>
    <div class="idea-list">${blocks || "<p class='hand-note'>Добавьте аккорд — появятся идеи.</p>"}</div>
    <div class="actions sticky-actions">
      <button type="button" class="btn btn-primary" id="backPath">К ходу</button>
      <button type="button" class="btn btn-ghost" id="backFret3">К грифу</button>
      ${
        hasPlus()
          ? `<button type="button" class="btn btn-glow" id="saveRiff">Сохранить</button>`
          : `<button type="button" class="btn btn-glow" id="needPlus">Сохранение — в Лад+</button>`
      }
    </div>
    <p class="song-save-status" id="devStatus" hidden></p>
  `;

  document.getElementById("backPath").addEventListener("click", () => setScreen("path"));
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

  stage.querySelectorAll("[data-idea-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sym = btn.dataset.ideaAdd;
      const v = typeof getGuitarVoicings === "function" ? getGuitarVoicings(sym)[0] : null;
      addSlot(sym, v || { name: "default", frets: emptyFrets(), instrument: "guitar" });
      setScreen("path");
    });
  });
  stage.querySelectorAll("[data-idea-replace]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sym = btn.dataset.ideaReplace;
      const last = state.slots[state.slots.length - 1];
      if (!last) return;
      const v = typeof getGuitarVoicings === "function" ? getGuitarVoicings(sym)[0] : last.voicing;
      last.symbol = sym;
      last.voicing = v;
      setScreen("path");
    });
  });
  stage.querySelectorAll("[data-idea-set]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const syms = btn.dataset.ideaSet.split("|");
      state.slots = syms.map((sym) => {
        const v = typeof getGuitarVoicings === "function" ? getGuitarVoicings(sym)[0] : null;
        return { id: uid(), symbol: sym, voicing: v || { name: "—", frets: emptyFrets() } };
      });
      setScreen("path");
    });
  });
  stage.querySelectorAll("[data-idea-focus]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.detected = { symbol: btn.dataset.ideaFocus, reason: "из идей развития", score: 100 };
      state.selectedVoicingId = null;
      setScreen("fret");
    });
  });
}

/* ---------- chrome ---------- */

btnBack.addEventListener("click", () => {
  if (state.screen === "develop") setScreen("path");
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

setScreen("fret");
