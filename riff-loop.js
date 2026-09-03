/**
 * Цикл риффа: аккорды хода под метроном и паттерном боя.
 * Одна длительность на звено = 1 такт.
 */
(function (global) {
  const PATTERNS = [
    {
      id: "quarters",
      label: "↓ ↓ ↓ ↓",
      hint: "по четвертям",
      /** 8 восьмых в такте 4/4 */
      steps: ["D", "-", "D", "-", "D", "-", "D", "-"],
    },
    {
      id: "folk",
      label: "↓ ↓↑ ↑↓↑",
      hint: "простой бой",
      steps: ["D", "-", "D", "U", "-", "U", "D", "U"],
    },
    {
      id: "muted",
      label: "↓ × ↓↑ × ↑↓↑",
      hint: "с паузами",
      steps: ["D", "x", "D", "U", "x", "U", "D", "U"],
    },
  ];

  const LOOKAHEAD_MS = 40;
  const SCHEDULE_AHEAD = 0.28;

  let timerId = null;
  let loopGen = 0;
  let nextTime = 0;
  let stepIndex = 0;
  let slotIndex = 0;
  let playing = false;
  let opts = {
    tempo: 90,
    patternId: "folk",
    metronome: true,
    getSlots: () => [],
    onSlot: null,
    onStop: null,
  };

  function api() {
    return global.LadAudio || null;
  }

  function patternById(id) {
    return PATTERNS.find((p) => p.id === id) || PATTERNS[1];
  }

  function stepDurSec(tempo) {
    const bpm = Math.max(60, Math.min(140, Number(tempo) || 90));
    // восьмая: половина доли
    return 60 / bpm / 2;
  }

  function highlight(i) {
    if (typeof opts.onSlot === "function") opts.onSlot(i);
  }

  function playHit(slot, when, hit, gen) {
    const audio = api();
    if (!audio || !slot?.voicing) return;
    const up = hit === "U";
    const common = { when, upstroke: up, loopGen: gen, duration: Math.min(0.5, stepDurSec(opts.tempo) * 1.35) };
    if (slot.voicing.frets) {
      audio.scheduleVoicing(slot.voicing.frets, when, common);
    } else if (slot.voicing.midis?.length) {
      audio.scheduleMidiChord(slot.voicing.midis, when, common);
    }
  }

  function scheduleStep(when, stepIdx, slotIdx, gen) {
    const slots = opts.getSlots() || [];
    if (!slots.length) {
      stopLoop();
      return;
    }
    const pat = patternById(opts.patternId);
    const hit = pat.steps[stepIdx % pat.steps.length];
    const slot = slots[slotIdx % slots.length];

    if (stepIdx === 0) highlight(slotIdx % slots.length);

    if (opts.metronome && stepIdx % 2 === 0) {
      api()?.scheduleMetronomeClick?.(when, { accent: stepIdx === 0, loopGen: gen });
    }

    if (hit === "D" || hit === "U") {
      playHit(slot, when, hit, gen);
    }
    // "-" и "x" — пауза / глушение без звука аккорда
  }

  function advance(gen) {
    const pat = patternById(opts.patternId);
    const slots = opts.getSlots() || [];
    if (!slots.length) {
      stopLoop();
      return;
    }
    stepIndex += 1;
    nextTime += stepDurSec(opts.tempo);
    if (stepIndex >= pat.steps.length) {
      stepIndex = 0;
      slotIndex = (slotIndex + 1) % slots.length;
    }
  }

  function tick() {
    if (!playing) return;
    const audio = api();
    const ctx = audio?.unlockAudio?.();
    if (!ctx) {
      timerId = setTimeout(tick, LOOKAHEAD_MS);
      return;
    }
    const gen = loopGen;
    while (playing && gen === loopGen && nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(nextTime, stepIndex, slotIndex, gen);
      advance(gen);
    }
    if (playing && gen === loopGen) {
      timerId = setTimeout(tick, LOOKAHEAD_MS);
    }
  }

  function startLoop(nextOpts = {}) {
    const audio = api();
    if (!audio) return false;
    const slots = (nextOpts.getSlots || opts.getSlots)() || [];
    if (!slots.length) return false;

    stopLoop({ silent: true });
    opts = { ...opts, ...nextOpts };
    playing = true;
    stepIndex = 0;
    slotIndex = 0;
    loopGen = audio.beginLoopGeneration?.() || Date.now();
    audio.unlockAudio?.();
    slots.forEach((s) => audio.prefetchVoicingSamples?.(s.voicing));

    const ctx = audio.unlockAudio();
    nextTime = (ctx?.currentTime || 0) + 0.08;
    highlight(0);
    tick();
    return true;
  }

  function stopLoop(flags = {}) {
    playing = false;
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
    api()?.endLoopGeneration?.();
    loopGen += 1;
    if (!flags.silent && typeof opts.onStop === "function") opts.onStop();
    highlight(-1);
  }

  function isPlaying() {
    return playing;
  }

  function listPatterns() {
    return PATTERNS.map((p) => ({ id: p.id, label: p.label, hint: p.hint }));
  }

  const API = {
    PATTERNS,
    listPatterns,
    patternById,
    startLoop,
    stopLoop,
    isPlaying,
    stepDurSec,
  };

  if (typeof global !== "undefined") global.LadRiffLoop = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
