/**
 * Озвучка аккордов — живые сэмплы (jsDelivr soundfonts)
 * acoustic → nylon (FluidR3)
 * distortion → distortion guitar (FatBoy) + лёгкий «кабинет»
 * piano → grand piano (FluidR3)
 *
 * Оптимизации: очередь с приоритетом, лимит параллелизма,
 * быстрый старт play (таймаут → synth), прогрев всех тембров,
 * без глобального debounce между сменой инструмента и play.
 */

const OPEN_MIDI = [40, 45, 50, 55, 59, 64];
const INSTRUMENTS = ["acoustic", "distortion", "piano"];
const INSTRUMENT_KEY = "lad-instrument";
const MAX_CONCURRENT_LOADS = 8;
const PLAY_WAIT_MS = 100;
const PREVIEW_WAIT_MS = 160;

const SOUNDFONT_HOST =
  "https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@gh-pages";

/** bank + instrument folder per mode */
const INSTRUMENT_FONT = {
  acoustic: { bank: "FluidR3_GM", folder: "acoustic_guitar_nylon-mp3" },
  distortion: { bank: "FatBoy", folder: "distortion_guitar-mp3" },
  piano: { bank: "FluidR3_GM", folder: "acoustic_grand_piano-mp3" },
};

const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** Часто встречающиеся MIDI для открытых/баррэ форм */
const COMMON_MIDIS = [
  40, 42, 43, 45, 47, 48, 50, 52, 53, 55, 56, 57, 59, 60, 62, 64, 65, 66, 67, 69, 71, 72,
];

let audioCtx = null;
let audioUnlocked = false;
let masterBus = null;
let distortionBus = null;
const bufferCache = new Map();
const inflight = new Map();

/** @type {{ key: string, instrument: string, midi: number, priority: number, resolve: Function, controller?: AbortController }[]} */
const loadQueue = [];
/** @type {Map<string, { priority: number, controller: AbortController | null }>} */
const activeJobs = new Map();
let activeLoads = 0;
let playGeneration = 0;
let melodyGeneration = 0;
let warmTimer = null;

let currentInstrument =
  (typeof localStorage !== "undefined" && localStorage.getItem(INSTRUMENT_KEY)) || "acoustic";
if (!INSTRUMENTS.includes(currentInstrument)) currentInstrument = "acoustic";

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function midiToNoteName(midi) {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

function getInstrument() {
  return currentInstrument;
}

function setInstrument(id) {
  if (!INSTRUMENTS.includes(id)) return currentInstrument;
  const prev = currentInstrument;
  currentInstrument = id;
  try {
    localStorage.setItem(INSTRUMENT_KEY, id);
  } catch (_) {}
  syncInstrumentUI();
  if (prev !== id) {
    // приоритет новому тембру: сначала preview-аккорд, потом общий набор
    prioritizeInstrument(id);
    prefetchMidis(id, fretsToNotes([-1, 0, 2, 2, 1, 0]).map((n) => n.midi), 90);
    prefetchCommon(id, 40);
    scheduleWarmOthers(id);
  }
  if (typeof window !== "undefined" && typeof window.refreshAllPathDiagrams === "function") {
    window.refreshAllPathDiagrams();
  }
  return currentInstrument;
}

function syncInstrumentUI(root = document) {
  root.querySelectorAll("[data-instrument]").forEach((btn) => {
    const on = btn.dataset.instrument === currentInstrument;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function getAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

function getMasterBus(ctx) {
  if (!masterBus || masterBus.context !== ctx) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.2;

    masterBus = ctx.createGain();
    masterBus.gain.value = 1;
    masterBus.connect(comp);
    comp.connect(ctx.destination);
    masterBus._comp = comp;
  }
  return masterBus;
}

/** Отдельная шина для дисторшна: кабинет + присутствие, меньше «MIDI-пластика». */
function getDistortionBus(ctx) {
  if (distortionBus && distortionBus.context === ctx) return distortionBus;

  const input = ctx.createGain();
  input.gain.value = 0.95;

  const hipass = ctx.createBiquadFilter();
  hipass.type = "highpass";
  hipass.frequency.value = 70;

  const midscoop = ctx.createBiquadFilter();
  midscoop.type = "peaking";
  midscoop.frequency.value = 480;
  midscoop.Q.value = 0.9;
  midscoop.gain.value = -2.5;

  const presence = ctx.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 2100;
  presence.Q.value = 0.8;
  presence.gain.value = 3.2;

  const cabinet = ctx.createBiquadFilter();
  cabinet.type = "lowpass";
  cabinet.frequency.value = 5000;
  cabinet.Q.value = 0.55;

  const air = ctx.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 6500;
  air.gain.value = -3.5;

  const delay = ctx.createDelay(0.2);
  delay.delayTime.value = 0.026;
  const delayGain = ctx.createGain();
  delayGain.gain.value = 0.11;
  const delayFilter = ctx.createBiquadFilter();
  delayFilter.type = "lowpass";
  delayFilter.frequency.value = 2600;

  const out = ctx.createGain();
  out.gain.value = 1.08;

  input.connect(hipass);
  hipass.connect(midscoop);
  midscoop.connect(presence);
  presence.connect(cabinet);
  cabinet.connect(air);
  air.connect(out);

  air.connect(delayFilter);
  delayFilter.connect(delay);
  delay.connect(delayGain);
  delayGain.connect(out);

  out.connect(getMasterBus(ctx));
  distortionBus = input;
  distortionBus.context = ctx;
  return distortionBus;
}

function destinationFor(instrument, ctx) {
  return instrument === "distortion" ? getDistortionBus(ctx) : getMasterBus(ctx);
}

function unlockAudio() {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  if (!audioUnlocked) {
    try {
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(getMasterBus(ctx));
      source.start(0);
      audioUnlocked = true;
      // после первого жеста — прогреть текущий и остальные тембры в фоне
      prefetchCommon(currentInstrument, 50);
      scheduleWarmOthers(currentInstrument);
    } catch (_) {}
  }
  return ctx;
}

function parseFrets(raw) {
  return String(raw)
    .split(",")
    .map((n) => parseInt(n.trim(), 10));
}

function fretsToNotes(frets) {
  const notes = [];
  for (let s = 0; s < 6; s++) {
    const f = frets[s];
    if (f === undefined || Number.isNaN(f) || f < 0) continue;
    notes.push({
      string: s,
      midi: OPEN_MIDI[s] + f,
      freq: midiToFreq(OPEN_MIDI[s] + f),
    });
  }
  notes.sort((a, b) => a.string - b.string);
  return notes;
}

function sampleUrl(instrument, midi) {
  const conf = INSTRUMENT_FONT[instrument] || INSTRUMENT_FONT.acoustic;
  return `${SOUNDFONT_HOST}/${conf.bank}/${conf.folder}/${midiToNoteName(midi)}.mp3`;
}

function cacheKey(instrument, midi) {
  return `${instrument}:v3:${midi}`;
}

function bumpQueuePriority(key, priority) {
  const item = loadQueue.find((q) => q.key === key);
  if (item && priority > item.priority) item.priority = priority;
  const active = activeJobs.get(key);
  if (active && priority > active.priority) active.priority = priority;
  loadQueue.sort((a, b) => b.priority - a.priority);
  if (priority >= 80) preemptLowPriorityLoads();
}

function preemptLowPriorityLoads() {
  // Не abort'им сеть (ERR_ABORTED в консоли) — только поднимаем приоритет в очереди.
  // Слоты для play резервируются в pumpLoadQueue.
}

function pumpLoadQueue() {
  loadQueue.sort((a, b) => b.priority - a.priority);

  while (loadQueue.length) {
    const next = loadQueue[0];
    const highWaiting = next.priority >= 80;
    const highActive = [...activeJobs.values()].filter((j) => j.priority >= 80).length;
    const reservedForHigh = highWaiting ? 0 : 2; // держим 2 слота под play, если в очереди нет high
    const limit = highWaiting ? MAX_CONCURRENT_LOADS : Math.max(2, MAX_CONCURRENT_LOADS - reservedForHigh);

    if (activeLoads >= (highWaiting ? MAX_CONCURRENT_LOADS : limit)) {
      break;
    }

    const job = loadQueue.shift();
    if (!job) break;
    if (bufferCache.has(job.key)) {
      job.resolve(bufferCache.get(job.key));
      inflight.delete(job.key);
      continue;
    }
    activeLoads += 1;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    activeJobs.set(job.key, { priority: job.priority, controller });
    job.controller = controller;
    runFetchDecode(job).finally(() => {
      activeLoads -= 1;
      activeJobs.delete(job.key);
      inflight.delete(job.key);
      pumpLoadQueue();
    });
  }
}

function runFetchDecode(job) {
  const ctx = getAudioContext();
  if (!ctx) {
    job.resolve(null);
    return Promise.resolve(null);
  }

  const ctrl = job.controller;
  const timer =
    ctrl &&
    setTimeout(() => {
      try {
        ctrl.abort();
      } catch (_) {}
    }, 8000);

  return fetch(sampleUrl(job.instrument, job.midi), {
    mode: "cors",
    credentials: "omit",
    cache: "force-cache",
    signal: ctrl?.signal,
  })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then((arr) => ctx.decodeAudioData(arr.slice(0)))
    .then((buf) => {
      bufferCache.set(job.key, buf);
      job.resolve(buf);
      return buf;
    })
    .catch((err) => {
      if (err?.name === "AbortError") {
        job.resolve(null);
        // вернём в конец очереди фоном — play уже не ждёт
        queueMicrotask(() => {
          if (!bufferCache.has(job.key)) {
            loadSample(job.instrument, job.midi, Math.min(25, job.priority));
          }
        });
        return null;
      }
      console.warn("sample load fail", job.instrument, midiToNoteName(job.midi), err);
      bufferCache.set(job.key, null);
      job.resolve(null);
      return null;
    })
    .finally(() => {
      if (timer) clearTimeout(timer);
    });
}

/**
 * @param {string} instrument
 * @param {number} midi
 * @param {number} [priority=20]
 */
function loadSample(instrument, midi, priority = 20) {
  const key = cacheKey(instrument, midi);
  if (bufferCache.has(key)) return Promise.resolve(bufferCache.get(key));
  if (inflight.has(key)) {
    bumpQueuePriority(key, priority);
    return inflight.get(key);
  }

  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  inflight.set(key, promise);
  loadQueue.push({
    key,
    instrument,
    midi,
    priority,
    resolve,
  });
  if (priority >= 80) preemptLowPriorityLoads();
  pumpLoadQueue();
  return promise;
}

function prefetchMidis(instrument, midis, priority = 30) {
  (midis || []).forEach((m, i) => loadSample(instrument, m, priority - i * 0.01));
}

function prefetchCommon(instrument = currentInstrument, priority = 30) {
  prefetchMidis(instrument, COMMON_MIDIS, priority);
}

function prioritizeInstrument(instrument) {
  // слегка поднять уже стоящие в очереди задачи этого тембра
  loadQueue.forEach((q) => {
    if (q.instrument === instrument && q.priority < 45) q.priority += 25;
  });
}

function scheduleWarmOthers(primary) {
  if (warmTimer) clearTimeout(warmTimer);
  warmTimer = setTimeout(() => {
    const rest = INSTRUMENTS.filter((id) => id !== primary);
    rest.forEach((id, idx) => prefetchCommon(id, 12 - idx));
  }, 280);
}

function settleWithTimeout(promises, ms) {
  return new Promise((resolve) => {
    const out = new Array(promises.length).fill(undefined);
    let remaining = promises.length;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      resolve(out.map((v) => (v === undefined ? null : v)));
    };

    if (!promises.length) {
      finish();
      return;
    }

    const timer = setTimeout(finish, ms);
    promises.forEach((p, i) => {
      Promise.resolve(p)
        .then((v) => {
          out[i] = v;
        })
        .catch(() => {
          out[i] = null;
        })
        .finally(() => {
          remaining -= 1;
          if (remaining <= 0) {
            clearTimeout(timer);
            finish();
          }
        });
    });
  });
}

function playBuffer(ctx, buffer, when, gainPeak, dest, durationCap, opts = {}) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  const dur = Math.min(durationCap, buffer.duration);
  const attack = opts.attack ?? 0.015;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(gainPeak, when + attack);
  const fadeAt = when + Math.max(0.25, dur - (opts.fade ?? 0.45));
  try {
    g.gain.setValueAtTime(gainPeak, fadeAt);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  } catch (_) {
    g.gain.linearRampToValueAtTime(0.0001, when + dur);
  }
  src.connect(g);
  g.connect(dest);
  src.start(when);
  src.stop(when + dur + 0.03);
}

function instrumentPlayStyle(id) {
  if (id === "distortion") return { strum: 0.036, gain: 0.52, duration: 2.35, attack: 0.01, fade: 0.55 };
  if (id === "piano") return { strum: 0.01, gain: 0.42, duration: 2.4, attack: 0.008, fade: 0.4 };
  return { strum: 0.048, gain: 0.55, duration: 2.2, attack: 0.015, fade: 0.45 };
}

function synthFallback(ctx, freq, when, duration, gainPeak, dest, instrument) {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, when);
  master.gain.linearRampToValueAtTime(gainPeak, when + 0.01);
  try {
    master.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  } catch (_) {
    master.gain.linearRampToValueAtTime(0.0001, when + duration);
  }

  const osc = ctx.createOscillator();
  osc.type = instrument === "distortion" ? "sawtooth" : instrument === "piano" ? "sine" : "triangle";
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = instrument === "distortion" ? 2800 : 3500;
  osc.connect(filter);
  filter.connect(master);
  master.connect(dest);
  osc.start(when);
  osc.stop(when + duration);
}

function playVoicing(frets, opts = {}) {
  const ctx = unlockAudio();
  if (!ctx) return false;

  const notes = fretsToNotes(frets);
  if (!notes.length) return false;

  const instrument = opts.instrument || currentInstrument;
  const style = instrumentPlayStyle(instrument);
  const strum = opts.strumMs ?? style.strum;
  const baseGain = opts.gain ?? style.gain;
  const duration = opts.duration ?? style.duration;
  const dest = destinationFor(instrument, ctx);
  const waitMs = opts.waitMs ?? PLAY_WAIT_MS;
  const gen = ++playGeneration;

  // высокий приоритет — ноты текущего play обгоняют фоновый прогрев
  const jobs = notes.map((n, i) => loadSample(instrument, n.midi, 100 - i));

  settleWithTimeout(jobs, waitMs).then((buffers) => {
    if (gen !== playGeneration && !opts.allowStale) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const start = ctx.currentTime + 0.02;
    notes.forEach((n, i) => {
      const when = start + i * strum;
      const g = baseGain * (instrument === "piano" ? 1 : n.string <= 2 ? 1.1 : 0.86);
      const buf = buffers[i];
      if (buf) playBuffer(ctx, buf, when, g, dest, duration, style);
      else synthFallback(ctx, n.freq, when, duration * 0.8, g * 0.45, dest, instrument);
    });
  });

  return true;
}

function playChord(symbol) {
  if (typeof getVoicings !== "function") return false;
  const voicings = getVoicings(symbol);
  if (!voicings.length) return false;
  return playVoicing(voicings[0].frets);
}

function flashPlaying(el) {
  if (!el) return;
  el.classList.add("is-playing");
  setTimeout(() => el.classList.remove("is-playing"), 420);
}

function handlePlayEvent(e) {
  const playBtn = e.target.closest(
    "[data-play-frets], [data-play-chord], [data-play-notes], [data-play-melody]"
  );
  if (!playBtn) return false;
  e.preventDefault();
  e.stopPropagation();
  unlockAudio();
  flashPlaying(playBtn);
  try {
    if (playBtn.dataset.playMelody) {
      playMelody(playBtn.dataset.playMelody.split(",").map((n) => parseInt(n, 10)));
    } else if (playBtn.dataset.playNotes) {
      playMidiNotes(playBtn.dataset.playNotes.split(",").map((n) => parseInt(n, 10)));
    } else if (playBtn.dataset.playFrets) {
      playVoicing(parseFrets(playBtn.dataset.playFrets));
    } else if (playBtn.dataset.playChord) {
      playChord(playBtn.dataset.playChord);
    }
  } catch (err) {
    console.warn("Лад audio error:", err);
  }
  return true;
}

function playMidiNotes(midis) {
  const ctx = unlockAudio();
  if (!ctx || !midis?.length) return false;
  const instrument = currentInstrument;
  const style = instrumentPlayStyle(instrument);
  const dest = destinationFor(instrument, ctx);
  const gen = ++playGeneration;
  const jobs = midis.map((m, i) => loadSample(instrument, m, 100 - i));
  settleWithTimeout(jobs, PLAY_WAIT_MS).then((buffers) => {
    if (gen !== playGeneration) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const start = ctx.currentTime + 0.02;
    midis.forEach((m, i) => {
      const when = start + i * (instrument === "piano" ? 0.012 : 0.03);
      const buf = buffers[i];
      const g = style.gain * 0.95;
      if (buf) playBuffer(ctx, buf, when, g, dest, style.duration, style);
      else synthFallback(ctx, midiToFreq(m), when, style.duration * 0.8, g * 0.45, dest, instrument);
    });
  });
  return true;
}

/** Последовательная гамма / мотив (не кластер). Ноты планируются по мере загрузки. */
function playMelody(midis, opts = {}) {
  const ctx = unlockAudio();
  if (!ctx || !midis?.length) return false;
  const clean = midis.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n));
  if (!clean.length) return false;
  const instrument = currentInstrument;
  const style = instrumentPlayStyle(instrument);
  const dest = destinationFor(instrument, ctx);
  const gap = (opts.gapMs ?? 165) / 1000;
  const noteDur = opts.duration ?? Math.min(0.48, style.duration * 0.62);
  const gen = ++melodyGeneration;
  const t0 = ctx.currentTime + 0.04;

  clean.forEach((m, i) => {
    loadSample(instrument, m, 96 - i).then((buf) => {
      if (gen !== melodyGeneration) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const when = t0 + i * gap;
      const g = style.gain * (0.9 + (i === 0 || i === clean.length - 1 ? 0.1 : 0));
      if (buf) playBuffer(ctx, buf, when, g, dest, noteDur, { ...style, strum: 0 });
      else synthFallback(ctx, midiToFreq(m), when, noteDur, g * 0.58, dest, instrument);
    });
  });
  return true;
}

function prefetchMelody(midis, priority = 70) {
  if (!midis?.length) return;
  const instrument = currentInstrument;
  midis.forEach((m, i) => loadSample(instrument, m, priority - i));
}

function handleInstrumentEvent(e) {
  const btn = e.target.closest("[data-instrument]");
  if (!btn) return false;
  e.preventDefault();
  e.stopPropagation();
  const id = btn.dataset.instrument;
  setInstrument(id);
  unlockAudio();
  flashPlaying(btn);
  try {
    // preview с чуть большим бюджетом ожидания сэмплов нового тембра
    playVoicing([-1, 0, 2, 2, 1, 0], { waitMs: PREVIEW_WAIT_MS, allowStale: true });
  } catch (err) {
    console.warn("Лад instrument preview error:", err);
  }
  return true;
}

function bindAudioEvents(root = document) {
  if (root.__ladAudioBound) return;
  root.__ladAudioBound = true;

  // Только pointerup: иначе click дублирует жест и глобальный debounce
  // глотал play сразу после смены инструмента.
  const lastByEl = new WeakMap();
  const onPointer = (e) => {
    if (e.type === "pointerup" && e.pointerType === "mouse" && e.button !== 0) return;
    const el =
      e.target.closest?.("[data-instrument], [data-play-frets], [data-play-chord], [data-play-notes], [data-play-melody]") ||
      null;
    if (!el) return;
    const now = Date.now();
    const prev = lastByEl.get(el) || 0;
    if (now - prev < 220) return;
    if (handleInstrumentEvent(e) || handlePlayEvent(e)) lastByEl.set(el, now);
  };

  root.addEventListener("pointerup", onPointer, true);
  // клавиатура / старые клиенты без Pointer Events; iOS — запасной click
  root.addEventListener(
    "click",
    (e) => {
      const el =
        e.target.closest?.(
          "[data-instrument], [data-play-frets], [data-play-chord], [data-play-notes], [data-play-melody]"
        ) || null;
      if (!el) {
        if (!window.PointerEvent) onPointer(e);
        return;
      }
      const now = Date.now();
      if (now - (lastByEl.get(el) || 0) < 380) return;
      onPointer(e);
    },
    true
  );
  syncInstrumentUI(root);
}

function initAudioUI() {
  bindAudioEvents(document);
  // лёгкий DNS/TLS прогрев без декода — пока нет жеста
  try {
    if (typeof fetch === "function") {
      const warm = sampleUrl(currentInstrument, 60);
      fetch(warm, { method: "GET", mode: "cors", credentials: "omit", cache: "force-cache" }).catch(
        () => {}
      );
    }
  } catch (_) {}
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAudioUI);
  } else {
    initAudioUI();
  }
}

const LadAudioAPI = {
  playVoicing,
  playChord,
  playMidiNotes,
  playMelody,
  prefetchMelody,
  fretsToNotes,
  parseFrets,
  midiToFreq,
  midiToNoteName,
  setInstrument,
  getInstrument,
  unlockAudio,
  loadSample,
  prefetchCommon,
  INSTRUMENTS,
  stats: () => ({
    cache: bufferCache.size,
    inflight: inflight.size,
    queue: loadQueue.length,
    active: activeLoads,
    instrument: currentInstrument,
  }),
};

if (typeof window !== "undefined") window.LadAudio = LadAudioAPI;

if (typeof module !== "undefined" && module.exports) {
  module.exports = LadAudioAPI;
}
