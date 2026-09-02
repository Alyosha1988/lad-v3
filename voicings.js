/**
 * Лад · Рифф — полная база постановок.
 * Гитара: open + переносные E/A/D/C/G-формы (и октава выше).
 * Фортепиано: тесное положение + инверсии.
 *
 * API:
 *   getAllVoicings(symbol) → [{ instrument, name, frets|midis, … }]
 *   getGuitarVoicings(symbol)
 *   getPianoVoicings(symbol)
 *   listKnownQualities()
 *   chordPitchClasses(symbol)
 */

const FRET_MUTE = -1;
const FRET_OPEN = 0;

const ROOTS_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const ROOTS_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const PC_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const ROOT_ALIAS = {
  Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#",
  "C#": "C#", "D#": "D#", "F#": "F#", "G#": "G#", "A#": "A#",
};

/** Интервалы от корня (полутоны) для pitch-class набора. */
const QUALITY_INTERVALS = {
  "": [0, 4, 7],
  maj: [0, 4, 7],
  M: [0, 4, 7],
  m: [0, 3, 7],
  "5": [0, 7],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "69": [0, 4, 7, 9, 2],
  "6/9": [0, 4, 7, 9, 2],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  "7sus4": [0, 5, 7, 10],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  add11: [0, 4, 7, 17],
  "9": [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  "11": [0, 4, 7, 10, 14, 17],
  m11: [0, 3, 7, 10, 14, 17],
  "13": [0, 4, 7, 10, 14, 21],
  "7alt": [0, 4, 10, 13],
  "7#9": [0, 4, 7, 10, 15],
  "7b9": [0, 4, 7, 10, 13],
  "maj7#11": [0, 4, 7, 11, 18],
  "m(maj7)": [0, 3, 7, 11],
};

const QUALITY_ALIASES = {
  "": "", maj: "", major: "", M: "",
  m: "m", min: "m", minor: "m",
  "7": "7", dom7: "7",
  maj7: "maj7", Maj7: "maj7", Δ: "maj7", M7: "maj7",
  m7: "m7", min7: "m7",
  m7b5: "m7b5", "ø": "m7b5", "ø7": "m7b5", halfdim: "m7b5",
  dim: "dim", "°": "dim",
  dim7: "dim7", "°7": "dim7",
  aug: "aug", "+": "aug",
  sus2: "sus2", sus4: "sus4", sus: "sus4",
  "7sus4": "7sus4", "7sus": "7sus4",
  add9: "add9", madd9: "madd9", add11: "add11",
  "6": "6", m6: "m6", "69": "6/9", "6/9": "6/9",
  "9": "9", maj9: "maj9", m9: "m9",
  "11": "11", m11: "m11", "13": "13",
  "5": "5", "7alt": "7alt", alt: "7alt",
  "7#9": "7#9", "7b9": "7b9",
  "maj7#11": "maj7#11",
  "m(maj7)": "m(maj7)", mmaj7: "m(maj7)",
};

/**
 * Переносные гитарные формы.
 * rootString: 0=E6, 1=A5, 2=D4, 3=G3
 * pattern: смещение лада от корня; null = mute (не путать с -1)
 */
const MOVABLE_SHAPES = {
  "": [
    { rootString: 0, pattern: [0, 2, 2, 1, 0, 0], label: "E-форма", form: "E", tags: ["barre"] },
    { rootString: 1, pattern: [null, 0, 2, 2, 2, 0], label: "A-форма", form: "A", tags: ["barre"] },
    { rootString: 2, pattern: [null, null, 0, 2, 3, 2], label: "D-форма", form: "D", tags: ["compact"] },
    { rootString: 1, pattern: [null, 0, -1, -3, -2, -3], label: "C-форма", form: "C", tags: ["caged"] },
    { rootString: 0, pattern: [0, -1, -3, -3, -3, 0], label: "G-форма", form: "G", tags: ["caged"] },
    { rootString: 1, pattern: [null, 0, 2, 2, 2, null], label: "A-форма (без 1)", form: "A", tags: ["barre", "partial"] },
    { rootString: 0, pattern: [0, 2, 2, 1, 0, null], label: "E-форма (без 1)", form: "E", tags: ["barre", "partial"] },
    { rootString: 3, pattern: [null, null, null, 0, 1, 0], label: "G-мини (верх)", form: "G", tags: ["high", "compact"] },
  ],
  m: [
    { rootString: 0, pattern: [0, 2, 2, 0, 0, 0], label: "Em-форма", form: "E", tags: ["barre"] },
    { rootString: 1, pattern: [null, 0, 2, 2, 1, 0], label: "Am-форма", form: "A", tags: ["barre"] },
    { rootString: 2, pattern: [null, null, 0, 2, 3, 1], label: "Dm-форма", form: "D", tags: ["compact"] },
    { rootString: 1, pattern: [null, 0, 2, 2, 1, null], label: "Am без 1", form: "A", tags: ["barre", "partial"] },
    { rootString: 0, pattern: [0, 2, 2, 0, 0, null], label: "Em без 1", form: "E", tags: ["barre", "partial"] },
  ],
  "5": [
    { rootString: 0, pattern: [0, 2, 2, null, null, null], label: "Пауэр E", form: "E", tags: ["power"] },
    { rootString: 1, pattern: [null, 0, 2, 2, null, null], label: "Пауэр A", form: "A", tags: ["power"] },
    { rootString: 0, pattern: [0, 2, 2, 0, null, null], label: "Пауэр E+октава", form: "E", tags: ["power"] },
    { rootString: 2, pattern: [null, null, 0, 2, 3, null], label: "Пауэр D", form: "D", tags: ["power", "compact"] },
  ],
  "6": [
    { rootString: 0, pattern: [0, 2, 2, 1, 2, 0], label: "E6", form: "E", tags: ["barre"] },
    { rootString: 1, pattern: [null, 0, 2, 2, 2, 2], label: "A6", form: "A", tags: ["barre"] },
    { rootString: 2, pattern: [null, null, 0, 2, 0, 2], label: "D6", form: "D", tags: ["compact"] },
  ],
  m6: [
    { rootString: 0, pattern: [0, 2, 2, 0, 2, 0], label: "Em6", form: "E", tags: ["barre"] },
    { rootString: 1, pattern: [null, 0, 2, 2, 1, 2], label: "Am6", form: "A", tags: ["barre"] },
    { rootString: 2, pattern: [null, null, 0, 2, 0, 1], label: "Dm6", form: "D", tags: ["compact"] },
  ],
  "6/9": [
    { rootString: 0, pattern: [0, 2, 2, 1, 2, 2], label: "E6/9", form: "E", tags: ["barre"] },
    { rootString: 1, pattern: [null, 0, 2, 2, 2, 2], label: "A6/9-ish", form: "A", tags: ["barre"] },
  ],
  "7": [
    { rootString: 0, pattern: [0, 2, 0, 1, 0, 0], label: "E7", form: "E", tags: ["barre"] },
    { rootString: 1, pattern: [null, 0, 2, 0, 2, 0], label: "A7", form: "A", tags: ["barre"] },
    { rootString: 2, pattern: [null, null, 0, 2, 1, 2], label: "D7", form: "D", tags: ["compact"] },
    { rootString: 0, pattern: [0, 2, 0, 1, 3, 0], label: "E7 (b9-top)", form: "E", tags: ["barre", "color"] },
    { rootString: 1, pattern: [null, 0, 2, 0, 2, 3], label: "A7 (9-top)", form: "A", tags: ["barre", "color"] },
  ],
  maj7: [
    { rootString: 0, pattern: [0, 2, 1, 1, 0, 0], label: "Emaj7", form: "E", tags: ["barre"] },
    { rootString: 1, pattern: [null, 0, 2, 1, 2, 0], label: "Amaj7", form: "A", tags: ["barre"] },
    { rootString: 2, pattern: [null, null, 0, 2, 2, 2], label: "Dmaj7", form: "D", tags: ["compact"] },
    { rootString: 1, pattern: [null, 0, 2, 1, 2, null], label: "Amaj7 без 1", form: "A", tags: ["barre", "partial"] },
  ],
  m7: [
    { rootString: 0, pattern: [0, 2, 0, 0, 0, 0], label: "Em7", form: "E", tags: ["barre"] },
    { rootString: 1, pattern: [null, 0, 2, 0, 1, 0], label: "Am7", form: "A", tags: ["barre"] },
    { rootString: 2, pattern: [null, null, 0, 2, 1, 1], label: "Dm7", form: "D", tags: ["compact"] },
    { rootString: 0, pattern: [0, 2, 0, 0, 0, 3], label: "Em7 (b7 на 1)", form: "E", tags: ["barre", "color"] },
  ],
  m7b5: [
    { rootString: 1, pattern: [null, 0, 1, 0, 1, null], label: "ø A", form: "A", tags: ["barre"] },
    { rootString: 0, pattern: [0, 1, 2, 0, 2, 0], label: "ø E-ish", form: "E", tags: ["barre"] },
    { rootString: 2, pattern: [null, null, 0, 1, 1, 1], label: "ø D-ish", form: "D", tags: ["compact"] },
  ],
  dim: [
    { rootString: 1, pattern: [null, 0, 1, 2, 1, null], label: "dim A", form: "A", tags: ["barre"] },
    { rootString: 0, pattern: [0, 1, 2, 0, null, null], label: "dim E-ish", form: "E", tags: ["barre"] },
    { rootString: 2, pattern: [null, null, 0, 1, 0, 1], label: "dim D-ish", form: "D", tags: ["compact"] },
  ],
  dim7: [
    { rootString: 1, pattern: [null, 0, 1, 2, 1, 2], label: "dim7 A", form: "A", tags: ["barre"] },
    { rootString: 0, pattern: [0, 1, 2, 0, 2, 0], label: "dim7 E-ish", form: "E", tags: ["barre"] },
    { rootString: 2, pattern: [null, null, 0, 1, 0, 1], label: "dim7 D", form: "D", tags: ["compact"] },
  ],
  aug: [
    { rootString: 0, pattern: [0, 3, 2, 1, 1, 0], label: "Eaug-ish", form: "E", tags: ["barre"] },
    { rootString: 1, pattern: [null, 0, 3, 2, 2, 1], label: "Aaug-ish", form: "A", tags: ["barre"] },
  ],
  sus2: [
    { rootString: 1, pattern: [null, 0, 2, 2, 0, 0], label: "Asus2", form: "A", tags: ["barre"] },
    { rootString: 0, pattern: [0, 2, 4, 2, 0, 0], label: "Esus2", form: "E", tags: ["barre"] },
    { rootString: 2, pattern: [null, null, 0, 2, 3, 0], label: "Dsus2", form: "D", tags: ["compact"] },
  ],
  sus4: [
    { rootString: 1, pattern: [null, 0, 2, 2, 3, 0], label: "Asus4", form: "A", tags: ["barre"] },
    { rootString: 0, pattern: [0, 2, 2, 2, 0, 0], label: "Esus4", form: "E", tags: ["barre"] },
    { rootString: 2, pattern: [null, null, 0, 2, 3, 3], label: "Dsus4", form: "D", tags: ["compact"] },
  ],
  "7sus4": [
    { rootString: 0, pattern: [0, 2, 0, 2, 0, 0], label: "E7sus4", form: "E", tags: ["barre"] },
    { rootString: 1, pattern: [null, 0, 2, 0, 3, 0], label: "A7sus4", form: "A", tags: ["barre"] },
    { rootString: 2, pattern: [null, null, 0, 2, 1, 3], label: "D7sus4", form: "D", tags: ["compact"] },
  ],
  add9: [
    { rootString: 0, pattern: [0, 2, 2, 1, 0, 2], label: "Eadd9", form: "E", tags: ["barre"] },
    { rootString: 1, pattern: [null, 0, 2, 2, 0, 0], label: "Aadd9", form: "A", tags: ["barre"] },
    { rootString: 2, pattern: [null, null, 0, 2, 3, 0], label: "Dadd9-ish", form: "D", tags: ["compact"] },
  ],
  madd9: [
    { rootString: 0, pattern: [0, 2, 2, 0, 0, 2], label: "Emadd9", form: "E", tags: ["barre"] },
    { rootString: 1, pattern: [null, 0, 2, 2, 0, 0], label: "Amadd9-ish", form: "A", tags: ["barre"] },
  ],
  add11: [
    { rootString: 0, pattern: [0, 2, 2, 1, 0, 0], label: "E +11 через баррэ", form: "E", tags: ["barre"] },
    { rootString: 1, pattern: [null, 0, 0, 2, 2, 0], label: "Aadd11-ish", form: "A", tags: ["barre"] },
  ],
  "9": [
    { rootString: 1, pattern: [null, 0, 2, 0, 2, 2], label: "A9", form: "A", tags: ["barre"] },
    { rootString: 0, pattern: [0, 2, 0, 1, 0, 2], label: "E9", form: "E", tags: ["barre"] },
    { rootString: 2, pattern: [null, null, 0, 2, 1, 0], label: "D9-ish", form: "D", tags: ["compact"] },
  ],
  maj9: [
    { rootString: 1, pattern: [null, 0, 2, 1, 0, 0], label: "Amaj9", form: "A", tags: ["barre"] },
    { rootString: 0, pattern: [0, 2, 1, 1, 0, 2], label: "Emaj9", form: "E", tags: ["barre"] },
  ],
  m9: [
    { rootString: 1, pattern: [null, 0, 2, 0, 0, 0], label: "Am9", form: "A", tags: ["barre"] },
    { rootString: 0, pattern: [0, 2, 0, 0, 0, 2], label: "Em9", form: "E", tags: ["barre"] },
  ],
  "11": [
    { rootString: 1, pattern: [null, 0, 0, 0, 2, 0], label: "A11-ish", form: "A", tags: ["barre"] },
    { rootString: 0, pattern: [0, 2, 0, 2, 0, 0], label: "E11-ish", form: "E", tags: ["barre"] },
  ],
  m11: [
    { rootString: 1, pattern: [null, 0, 0, 0, 1, 0], label: "Am11-ish", form: "A", tags: ["barre"] },
    { rootString: 0, pattern: [0, 0, 0, 0, 0, 0], label: "Em11 open-ish", form: "E", tags: ["barre"] },
  ],
  "13": [
    { rootString: 1, pattern: [null, 0, 2, 0, 2, 2], label: "A13", form: "A", tags: ["barre"] },
    { rootString: 0, pattern: [0, 2, 0, 1, 2, 0], label: "E13-ish", form: "E", tags: ["barre"] },
  ],
  "7alt": [
    { rootString: 1, pattern: [null, 0, 1, 2, 2, 3], label: "7#9 A", form: "A", tags: ["barre", "color"] },
    { rootString: 0, pattern: [0, 2, 0, 1, 3, 0], label: "7b9 E", form: "E", tags: ["barre", "color"] },
    { rootString: 1, pattern: [null, 0, 1, 0, 2, 3], label: "7alt A-2", form: "A", tags: ["barre", "color"] },
  ],
  "7#9": [
    { rootString: 1, pattern: [null, 0, 2, 1, 2, 3], label: "7#9", form: "A", tags: ["barre", "color"] },
    { rootString: 0, pattern: [0, 2, 0, 1, 3, 3], label: "7#9 E", form: "E", tags: ["barre", "color"] },
  ],
  "7b9": [
    { rootString: 0, pattern: [0, 2, 0, 1, 3, 0], label: "7b9 E", form: "E", tags: ["barre", "color"] },
    { rootString: 1, pattern: [null, 0, 2, 0, 2, 1], label: "7b9 A", form: "A", tags: ["barre", "color"] },
  ],
  "maj7#11": [
    { rootString: 0, pattern: [0, 2, 1, 1, 0, 0], label: "maj7 (+#11 сверху вручную)", form: "E", tags: ["barre"] },
    { rootString: 1, pattern: [null, 0, 2, 1, 2, 0], label: "Amaj7#11-ish", form: "A", tags: ["barre"] },
  ],
  "m(maj7)": [
    { rootString: 0, pattern: [0, 2, 1, 0, 0, 0], label: "Em(maj7)", form: "E", tags: ["barre"] },
    { rootString: 1, pattern: [null, 0, 2, 1, 1, 0], label: "Am(maj7)", form: "A", tags: ["barre"] },
  ],
};
/** Открытые / канонические формы (не выводятся из баррэ). */
const OPEN_VOICINGS = {
  C: [
    { name: "open C", frets: [-1, 3, 2, 0, 1, 0], form: "C", tags: ["open"] },
    { name: "C add9-ish", frets: [-1, 3, 2, 0, 3, 0], form: "C", tags: ["open", "color"] },
  ],
  Cm: [{ name: "Cm A-форма 3", frets: [-1, 3, 5, 5, 4, 3], baseFret: 3, form: "Am", tags: ["barre"] }],
  D: [
    { name: "open D", frets: [-1, -1, 0, 2, 3, 2], form: "D", tags: ["open"] },
    { name: "D (с A)", frets: [-1, 0, 0, 2, 3, 2], form: "D", tags: ["open"] },
  ],
  Dm: [{ name: "open Dm", frets: [-1, -1, 0, 2, 3, 1], form: "D", tags: ["open"] }],
  E: [
    { name: "open E", frets: [0, 2, 2, 1, 0, 0], form: "E", tags: ["open"] },
    { name: "E без 6", frets: [-1, 2, 2, 1, 0, 0], form: "E", tags: ["open", "partial"] },
  ],
  Em: [
    { name: "open Em", frets: [0, 2, 2, 0, 0, 0], form: "E", tags: ["open"] },
    { name: "Em без 6", frets: [-1, 2, 2, 0, 0, 0], form: "E", tags: ["open", "partial"] },
  ],
  F: [
    { name: "F баррэ 1", frets: [1, 3, 3, 2, 1, 1], baseFret: 1, form: "E", tags: ["barre"] },
    { name: "F mini", frets: [-1, -1, 3, 2, 1, 1], baseFret: 1, form: "D", tags: ["compact"] },
    { name: "F (без 6)", frets: [-1, 3, 3, 2, 1, 1], baseFret: 1, form: "E", tags: ["partial"] },
  ],
  Fm: [
    { name: "Fm баррэ 1", frets: [1, 3, 3, 1, 1, 1], baseFret: 1, form: "E", tags: ["barre"] },
    { name: "Fm mini", frets: [-1, -1, 3, 1, 1, 1], baseFret: 1, form: "D", tags: ["compact"] },
  ],
  G: [
    { name: "open G", frets: [3, 2, 0, 0, 0, 3], form: "G", tags: ["open"] },
    { name: "G (folk)", frets: [3, 2, 0, 0, 3, 3], form: "G", tags: ["open"] },
    { name: "G E-форма 3", frets: [3, 5, 5, 4, 3, 3], baseFret: 3, form: "E", tags: ["barre"] },
  ],
  Gm: [{ name: "Gm баррэ 3", frets: [3, 5, 5, 3, 3, 3], baseFret: 3, form: "E", tags: ["barre"] }],
  A: [
    { name: "open A", frets: [-1, 0, 2, 2, 2, 0], form: "A", tags: ["open"] },
    { name: "A (без 1)", frets: [-1, 0, 2, 2, 2, -1], form: "A", tags: ["open", "partial"] },
  ],
  Am: [
    { name: "open Am", frets: [-1, 0, 2, 2, 1, 0], form: "A", tags: ["open"] },
    { name: "Am (без 1)", frets: [-1, 0, 2, 2, 1, -1], form: "A", tags: ["open", "partial"] },
  ],
  B: [{ name: "B A-форма 2", frets: [-1, 2, 4, 4, 4, 2], baseFret: 2, form: "A", tags: ["barre"] }],
  Bm: [{ name: "Bm A-форма 2", frets: [-1, 2, 4, 4, 3, 2], baseFret: 2, form: "A", tags: ["barre"] }],
  Bb: [{ name: "Bb A-форма 1", frets: [-1, 1, 3, 3, 3, 1], baseFret: 1, form: "A", tags: ["barre"] }],
  Bbm: [{ name: "Bbm A-форма 1", frets: [-1, 1, 3, 3, 2, 1], baseFret: 1, form: "A", tags: ["barre"] }],

  C7: [{ name: "open C7", frets: [-1, 3, 2, 3, 1, 0], form: "C", tags: ["open"] }],
  Cmaj7: [
    { name: "open Cmaj7", frets: [-1, 3, 2, 0, 0, 0], form: "C", tags: ["open"] },
    { name: "Cmaj7 (3x0000)", frets: [-1, 3, 2, 0, 0, 0], form: "C", tags: ["open"] },
  ],
  Cm7: [{ name: "Cm7 3fr", frets: [-1, 3, 5, 3, 4, 3], baseFret: 3, form: "Am", tags: ["barre"] }],
  D7: [{ name: "open D7", frets: [-1, -1, 0, 2, 1, 2], form: "D", tags: ["open"] }],
  Dmaj7: [{ name: "open Dmaj7", frets: [-1, -1, 0, 2, 2, 2], form: "D", tags: ["open"] }],
  Dm7: [{ name: "open Dm7", frets: [-1, -1, 0, 2, 1, 1], form: "D", tags: ["open"] }],
  E7: [
    { name: "open E7", frets: [0, 2, 0, 1, 0, 0], form: "E", tags: ["open"] },
    { name: "E7 (полный)", frets: [0, 2, 2, 1, 3, 0], form: "E", tags: ["open", "color"] },
  ],
  Emaj7: [{ name: "open Emaj7", frets: [0, 2, 1, 1, 0, 0], form: "E", tags: ["open"] }],
  Em7: [{ name: "open Em7", frets: [0, 2, 0, 0, 0, 0], form: "E", tags: ["open"] }],
  Fmaj7: [
    { name: "Fmaj7 mini", frets: [-1, -1, 3, 2, 1, 0], baseFret: 1, form: "D", tags: ["compact"] },
    { name: "Fmaj7 баррэ", frets: [1, 3, 2, 2, 1, 1], baseFret: 1, form: "E", tags: ["barre"] },
  ],
  F7: [{ name: "F7 баррэ", frets: [1, 3, 1, 2, 1, 1], baseFret: 1, form: "E", tags: ["barre"] }],
  G7: [{ name: "open G7", frets: [3, 2, 0, 0, 0, 1], form: "G", tags: ["open"] }],
  Gmaj7: [{ name: "open Gmaj7", frets: [3, 2, 0, 0, 0, 2], form: "G", tags: ["open"] }],
  Gm7: [{ name: "Gm7 баррэ 3", frets: [3, 5, 3, 3, 3, 3], baseFret: 3, form: "E", tags: ["barre"] }],
  A7: [{ name: "open A7", frets: [-1, 0, 2, 0, 2, 0], form: "A", tags: ["open"] }],
  Amaj7: [{ name: "open Amaj7", frets: [-1, 0, 2, 1, 2, 0], form: "A", tags: ["open"] }],
  Am7: [{ name: "open Am7", frets: [-1, 0, 2, 0, 1, 0], form: "A", tags: ["open"] }],
  B7: [{ name: "open B7", frets: [-1, 2, 1, 2, 0, 2], form: "open", tags: ["open"] }],
  Bm7: [{ name: "Bm7 2fr", frets: [-1, 2, 4, 2, 3, 2], baseFret: 2, form: "A", tags: ["barre"] }],
  Bmaj7: [{ name: "Bmaj7 2fr", frets: [-1, 2, 4, 3, 4, 2], baseFret: 2, form: "A", tags: ["barre"] }],

  Asus2: [{ name: "open Asus2", frets: [-1, 0, 2, 2, 0, 0], form: "A", tags: ["open"] }],
  Asus4: [{ name: "open Asus4", frets: [-1, 0, 2, 2, 3, 0], form: "A", tags: ["open"] }],
  Dsus2: [{ name: "open Dsus2", frets: [-1, -1, 0, 2, 3, 0], form: "D", tags: ["open"] }],
  Dsus4: [{ name: "open Dsus4", frets: [-1, -1, 0, 2, 3, 3], form: "D", tags: ["open"] }],
  Esus4: [{ name: "open Esus4", frets: [0, 2, 2, 2, 0, 0], form: "E", tags: ["open"] }],
  A7sus4: [{ name: "open A7sus4", frets: [-1, 0, 2, 0, 3, 0], form: "A", tags: ["open"] }],
  D7sus4: [{ name: "open D7sus4", frets: [-1, -1, 0, 2, 1, 3], form: "D", tags: ["open"] }],
  Cadd9: [{ name: "open Cadd9", frets: [-1, 3, 2, 0, 3, 0], form: "C", tags: ["open"] }],
  Gadd9: [{ name: "open Gadd9", frets: [3, 2, 0, 0, 0, 5], form: "G", tags: ["open"] }],
  Emadd9: [{ name: "open Emadd9", frets: [0, 2, 2, 0, 0, 2], form: "E", tags: ["open"] }],
  Am9: [{ name: "open Am9", frets: [-1, 0, 2, 0, 0, 0], form: "A", tags: ["open"] }],
  C6: [{ name: "open C6", frets: [-1, 3, 2, 2, 1, 0], form: "C", tags: ["open"] }],
  G6: [{ name: "open G6", frets: [3, 2, 0, 0, 0, 0], form: "G", tags: ["open"] }],
};

function splitChordSymbol(symbol) {
  const m = String(symbol || "").trim().match(/^([A-G][b#]?)(.*)$/i);
  if (!m) return null;
  let root = m[1][0].toUpperCase() + m[1].slice(1);
  let quality = (m[2] || "").replace(/Δ/g, "maj7").replace(/ø/g, "m7b5");
  return { root, quality, symbol: String(symbol).trim() };
}

function canonicalRoot(root) {
  return ROOT_ALIAS[root] || root;
}

function rootIndex(root) {
  const c = canonicalRoot(root);
  let i = ROOTS_SHARP.indexOf(c);
  if (i >= 0) return i;
  return ROOTS_FLAT.indexOf(root);
}

function spellRoot(pc, preferFlat) {
  return preferFlat ? ROOTS_FLAT[((pc % 12) + 12) % 12] : ROOTS_SHARP[((pc % 12) + 12) % 12];
}

function normalizeQuality(q) {
  if (!q) return "";
  if (QUALITY_ALIASES[q] !== undefined) return QUALITY_ALIASES[q];
  const low = String(q).toLowerCase();
  for (const [k, v] of Object.entries(QUALITY_ALIASES)) {
    if (k.toLowerCase() === low) return v;
  }
  if (/^m\(maj7\)$/i.test(q) || /mmaj7/i.test(q)) return "m(maj7)";
  if (/maj7#11/i.test(q)) return "maj7#11";
  if (/^maj7/i.test(q)) return "maj7";
  if (/^m7b5/i.test(q)) return "m7b5";
  if (/^m11/i.test(q)) return "m11";
  if (/^m9/i.test(q)) return "m9";
  if (/^madd9/i.test(q)) return "madd9";
  if (/^m7/i.test(q)) return "m7";
  if (/^m6/i.test(q)) return "m6";
  if (/^m(?!aj)/i.test(q) && q.length <= 2) return "m";
  if (/7#9/i.test(q)) return "7#9";
  if (/7b9/i.test(q)) return "7b9";
  if (/^7alt/i.test(q)) return "7alt";
  if (/^7sus/i.test(q)) return "7sus4";
  if (/^13/.test(q)) return "13";
  if (/^11/.test(q)) return "11";
  if (/^9/.test(q)) return "9";
  if (/^7/.test(q)) return "7";
  if (/^6\/?9/.test(q)) return "6/9";
  if (/^6/.test(q)) return "6";
  if (/^5$/.test(q)) return "5";
  if (/sus2/i.test(q)) return "sus2";
  if (/sus4?/i.test(q)) return "sus4";
  if (/add11/i.test(q)) return "add11";
  if (/add9/i.test(q)) return "add9";
  if (/dim7/i.test(q)) return "dim7";
  if (/dim/i.test(q)) return "dim";
  if (/aug|\+/i.test(q)) return "aug";
  return q;
}

function listKnownQualities() {
  return Object.keys(MOVABLE_SHAPES);
}

function openKeyVariants(root, quality) {
  const i = rootIndex(root);
  const keys = [];
  if (i >= 0) {
    keys.push(ROOTS_SHARP[i] + quality);
    keys.push(ROOTS_FLAT[i] + quality);
  }
  keys.push(root + quality);
  return [...new Set(keys)];
}

function fretsSignature(frets) {
  return frets.join(",");
}

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

function buildFromShape(root, shape) {
  const ri = rootIndex(root);
  if (ri < 0) return null;
  const openRootPc = [4, 9, 2, 7, 11, 4][shape.rootString];
  const fret = (ri - openRootPc + 12) % 12;
  // pad pattern to 6
  let pattern = shape.pattern.slice();
  while (pattern.length < 6) pattern.push(-1);
  const frets = pattern.map((p) => {
    if (p === null || p === undefined || p === "x") return FRET_MUTE;
    const abs = fret + p;
    return abs < 0 ? FRET_MUTE : abs;
  });
  const played = frets.filter((f) => f >= 0);
  if (played.length < 2) return null;
  if (Math.max(...played) > 17) return null;
  const base = computeBaseFret(frets);
  return {
    instrument: "guitar",
    name: fret === 0 ? `${shape.label} (откр.)` : `${shape.label} · ${fret}fr`,
    frets,
    baseFret: base,
    movable: true,
    form: shape.form || "E",
    tags: [...(shape.tags || []), fret === 0 ? "open-ish" : "movable"],
    rootFret: fret,
  };
}

function buildOctaveUp(v) {
  if (!v?.frets) return null;
  const frets = v.frets.map((f) => (f < 0 ? f : f + 12));
  const played = frets.filter((f) => f >= 0);
  if (!played.length || Math.max(...played) > 17) return null;
  return {
    ...v,
    name: `${v.name.replace(/\s·\s\d+fr/, "")} · ${Math.min(...played)}fr (октава)`,
    frets,
    baseFret: computeBaseFret(frets),
    tags: [...(v.tags || []), "octave"],
  };
}

function collectOpenVoicings(root, quality) {
  const out = [];
  for (const key of openKeyVariants(root, quality)) {
    const list = OPEN_VOICINGS[key];
    if (!list) continue;
    list.forEach((v) => {
      out.push({
        instrument: "guitar",
        name: v.name,
        frets: [...v.frets],
        baseFret: v.baseFret || computeBaseFret(v.frets),
        form: v.form || "",
        tags: [...(v.tags || ["open"])],
        movable: false,
      });
    });
  }
  return out;
}

function collectMovableVoicings(root, quality) {
  const shapes = MOVABLE_SHAPES[quality] || [];
  const out = [];
  for (const shape of shapes) {
    const v = buildFromShape(root, shape);
    if (v) out.push(v);
    // вторая позиция / октава выше для баррэ и caged
    if (v && ((shape.tags || []).includes("barre") || (shape.tags || []).includes("caged"))) {
      const up = buildOctaveUp(v);
      if (up) out.push(up);
    }
  }
  // fallback: major/minor shapes if quality unknown but intervals known
  if (!shapes.length && QUALITY_INTERVALS[quality]) {
    const fallbackQ = quality.includes("m") && !/maj/i.test(quality) ? "m" : "";
    for (const shape of MOVABLE_SHAPES[fallbackQ] || []) {
      const v = buildFromShape(root, shape);
      if (v) {
        v.name += ` (приближение)`;
        v.tags = [...(v.tags || []), "approx"];
        out.push(v);
      }
    }
  }
  return out;
}

function dedupeGuitar(list) {
  const seen = new Set();
  const out = [];
  for (const v of list) {
    const sig = fretsSignature(v.frets);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(v);
  }
  return out.sort((a, b) => {
    const ta = (a.tags || []).includes("open") ? 0 : 1;
    const tb = (b.tags || []).includes("open") ? 0 : 1;
    if (ta !== tb) return ta - tb;
    return voicingCenter(a.frets) - voicingCenter(b.frets);
  });
}

function chordPitchClasses(symbol) {
  const parsed = splitChordSymbol(symbol);
  if (!parsed) return [];
  const q = normalizeQuality(parsed.quality);
  const root = rootIndex(parsed.root);
  if (root < 0) return [];
  const ints = QUALITY_INTERVALS[q] || QUALITY_INTERVALS[""];
  return ints.map((iv) => (root + (iv % 12)) % 12);
}

function buildClosePiano(pcs, preferMidi = 60) {
  const tones = [];
  for (const pc of pcs.slice(0, 5)) {
    let midi = preferMidi - ((((preferMidi - pc) % 12) + 12) % 12);
    if (midi > preferMidi + 6) midi -= 12;
    if (midi < preferMidi - 6) midi += 12;
    tones.push(midi);
  }
  tones.sort((a, b) => a - b);
  for (let i = 1; i < tones.length; i++) {
    while (tones[i] <= tones[i - 1]) tones[i] += 12;
  }
  return tones;
}

function invertMidis(midis, n) {
  const out = midis.slice();
  for (let i = 0; i < n && out.length; i++) {
    const low = out.shift();
    out.push(low + 12);
  }
  return out;
}

function getPianoVoicings(symbol) {
  const pcs = chordPitchClasses(symbol);
  if (!pcs.length) return [];
  const rootPc = pcs[0];
  const close = buildClosePiano(pcs, 60);
  const low = buildClosePiano(pcs, 52);
  const high = buildClosePiano(pcs, 67);
  const inv1 = invertMidis(close, 1);
  const inv2 = invertMidis(close, 2);
  const list = [
    { name: "Тесно · корень", midis: close, tags: ["close", "root"] },
    { name: "1-я инверсия", midis: inv1, tags: ["inversion"] },
    { name: "2-я инверсия", midis: inv2, tags: ["inversion"] },
    { name: "Ниже", midis: low, tags: ["low"] },
    { name: "Выше", midis: high, tags: ["high"] },
  ];
  // drop-2 style for 4+ notes
  if (close.length >= 4) {
    const drop = close.slice();
    const second = drop.splice(drop.length - 2, 1)[0];
    drop.unshift(second - 12);
    drop.sort((a, b) => a - b);
    list.push({ name: "Drop-2", midis: drop, tags: ["spread"] });
  }
  return list.map((v, i) => ({
    instrument: "piano",
    name: v.name,
    midis: v.midis,
    tags: v.tags,
    id: `piano-${i}`,
  }));
}

function getGuitarVoicings(symbol) {
  const parsed = splitChordSymbol(symbol);
  if (!parsed) return [];
  const quality = normalizeQuality(parsed.quality);
  const root = parsed.root;
  const open = collectOpenVoicings(root, quality);
  const movable = collectMovableVoicings(root, quality);
  return dedupeGuitar([...open, ...movable]).map((v, i) => ({
    ...v,
    id: `gtr-${i}-${fretsSignature(v.frets)}`,
  }));
}

function getAllVoicings(symbol, opts = {}) {
  const instrument = opts.instrument || "all";
  const guitar = instrument === "piano" ? [] : getGuitarVoicings(symbol);
  const piano = instrument === "guitar" ? [] : getPianoVoicings(symbol);
  return [...guitar, ...piano];
}

/** Совместимость со старым API fingering.js */
function getVoicings(symbol) {
  return getGuitarVoicings(symbol);
}

function listLibrarySymbols(opts = {}) {
  const roots = opts.flats ? ROOTS_FLAT : ROOTS_SHARP;
  const qualities = listKnownQualities();
  const out = [];
  for (const r of roots) {
    for (const q of qualities) {
      out.push(r + q);
    }
  }
  return out;
}

function voicingStats() {
  const qualities = listKnownQualities();
  let guitar = 0;
  let piano = 0;
  const sampleRoots = ROOTS_SHARP;
  for (const r of sampleRoots) {
    for (const q of qualities) {
      guitar += getGuitarVoicings(r + q).length;
      piano += getPianoVoicings(r + q).length;
    }
  }
  return {
    roots: 12,
    qualities: qualities.length,
    guitarVoicingsAllRoots: guitar,
    pianoVoicingsAllRoots: piano,
    total: guitar + piano,
    avgGuitarPerChord: +(guitar / (12 * qualities.length)).toFixed(2),
  };
}

if (typeof window !== "undefined") {
  window.LadVoicings = {
    getAllVoicings,
    getGuitarVoicings,
    getPianoVoicings,
    getVoicings,
    listKnownQualities,
    listLibrarySymbols,
    chordPitchClasses,
    splitChordSymbol,
    normalizeQuality,
    rootIndex,
    canonicalRoot,
    spellRoot,
    voicingStats,
    OPEN_VOICINGS,
    MOVABLE_SHAPES,
    QUALITY_INTERVALS,
    FRET_MUTE,
    FRET_OPEN,
    PC_NAMES,
  };
  // legacy globals used by detect.js / fingering render
  window.OPEN_VOICINGS = OPEN_VOICINGS;
  window.getVoicings = getVoicings;
  window.getAllVoicings = getAllVoicings;
  window.getGuitarVoicings = getGuitarVoicings;
  window.getPianoVoicings = getPianoVoicings;
  window.listKnownQualities = listKnownQualities;
  window.splitChordSymbol = splitChordSymbol;
  window.normalizeQuality = normalizeQuality;
  window.rootIndex = rootIndex;
  window.canonicalRoot = canonicalRoot;
  window.chordPitchClasses = chordPitchClasses;
  window.PC_NAMES = PC_NAMES;
  window.FRET_MUTE = FRET_MUTE;
  window.FRET_OPEN = FRET_OPEN;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getAllVoicings,
    getGuitarVoicings,
    getPianoVoicings,
    getVoicings,
    listKnownQualities,
    listLibrarySymbols,
    chordPitchClasses,
    splitChordSymbol,
    normalizeQuality,
    voicingStats,
    OPEN_VOICINGS,
    MOVABLE_SHAPES,
  };
}
