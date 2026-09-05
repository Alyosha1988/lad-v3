/**
 * Лад — гармонический компас для гитариста.
 * Каталог семейств последовательностей + вопросы для фильтрации.
 */

const NOTES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const NOTE_ALIASES = {
  Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#",
  "C#": "C#", "D#": "D#", "F#": "F#", "G#": "G#", "A#": "A#",
};

const START_CHORDS = [
  "C", "Am", "G", "Em", "D", "Dm", "F", "E",
  "A", "Bm", "Bb", "F#m",
  "Cmaj7", "Am7", "G7", "Em7", "Dm7", "Fmaj7", "E7", "B7",
  "Am9", "D7", "Gmaj7", "C7", "F#m7b5", "B7alt", "Ebmaj7", "Gm7",
];

const MOODS = [
  { id: "bright", title: "Светлое, открытое", desc: "Мажорный воздух, ясность" },
  { id: "dark", title: "Тёмное, замкнутое", desc: "Минор, тень, камерность" },
  { id: "tense", title: "Напряжённое", desc: "Доминанты, альтерации, тяга" },
  { id: "dream", title: "Мечтательное", desc: "Септы, модал, плавающие краски" },
  { id: "groovy", title: "Грув / тело", desc: "Блюз, соул, повтор, рифф" },
];

const MOVES = [
  { id: "home", title: "Около тоники", desc: "Каденции, оборот вокруг дома" },
  { id: "lift", title: "Подъём энергии", desc: "К припеву, ярче, шире" },
  { id: "fall", title: "Спуск / растворение", desc: "Ниже, мягче, внутрь" },
  { id: "wander", title: "Путешествие", desc: "Квинтовый круг, модуляции" },
  { id: "twist", title: "Сюрприз", desc: "Заимствования, хром, поворот" },
];

const PARTS = [
  { id: "verse", title: "Куплет", desc: "Повествование внутри формы" },
  { id: "chorus", title: "Припев", desc: "Крючок и повтор" },
  { id: "bridge", title: "Бридж / проигрыш", desc: "Контраст и возврат" },
  { id: "intro", title: "Интро / аутро", desc: "Вход или выход" },
  { id: "solo", title: "Соло / лад", desc: "Под импровизацию" },
];

const STYLES = [
  { id: "all", title: "Все семейства", desc: "Полный каталог под вашу тональность" },
  { id: "diatonic", title: "Диатоника / поп-рок", desc: "I–V–vi–IV и родственники" },
  { id: "classical", title: "Каденции / классика", desc: "Автентика, плагальность, обороты" },
  { id: "blues", title: "Блюз", desc: "12-takt, quick change, turnaround" },
  { id: "jazz", title: "Джаз", desc: "ii–V–I, вторичные доминанты, turnaround" },
  { id: "modal", title: "Модальность", desc: "Dorian, Mixolydian, Lydian…" },
  { id: "soul", title: "Соул / госпел / R&B", desc: "IV–I, 7sus, gospel walk" },
  { id: "latin", title: "Латина / босса", desc: "ii–V, maj7, хроматический бас" },
  { id: "metal", title: "Рок / металл / модал", desc: "Силовые, фригийский, aeolian" },
  { id: "chromatic", title: "Хром / заимствования", desc: "Parallel, bVII, Tritone sub" },
];

/* ---------- theory helpers ---------- */

function parseChord(raw) {
  const m = String(raw).trim().match(/^([A-G][b#]?)(.*)$/i);
  if (!m) return null;
  let root = m[1][0].toUpperCase() + m[1].slice(1);
  if (NOTE_ALIASES[root]) root = NOTE_ALIASES[root];
  const quality = m[2] || "";
  const isMinor = /(^m(?!aj)|min|minor|^m7|^m9|^m11)/i.test(quality) || quality === "m";
  const isDom7 =
    /(7|9|13|alt)/i.test(quality) &&
    !/(maj|m7|m9|m11|dim|ø|m\(maj)/i.test(quality) &&
    !/^m/.test(quality);
  const isMaj7 = /maj7|Δ|maj9/i.test(quality);
  return { label: raw, root, quality, isMinor, isDom7, isMaj7 };
}

function noteIndex(note) {
  const n = NOTE_ALIASES[note] || note;
  const i = NOTES_SHARP.indexOf(n);
  if (i >= 0) return i;
  return NOTES_FLAT.indexOf(note);
}

function preferFlats(tonic, mode) {
  const flatMajors = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb"]);
  // Миноры с диезами в ключе: E, B, F#, …
  const sharpMinors = new Set(["E", "B", "F#", "C#", "G#", "D#"]);
  const sharpMajors = new Set(["G", "D", "A", "E", "B", "F#", "C#"]);
  if (flatMajors.has(tonic)) return true;
  // Am, Dm, Gm, Cm и др. — бемольная орфография (Bb вместо A#)
  if (mode === "minor") return !sharpMinors.has(tonic);
  if (sharpMajors.has(tonic)) return false;
  return false;
}

function spell(note, flats) {
  const i = noteIndex(note);
  if (i < 0) return note;
  return flats ? NOTES_FLAT[i] : NOTES_SHARP[i];
}

function transpose(note, semitones, flats = false) {
  const i = noteIndex(note);
  if (i < 0) return note;
  return spell(NOTES_SHARP[(i + semitones + 120) % 12], flats);
}

function ch(root, quality, flats) {
  return `${spell(root, flats)}${quality}`;
}

function majorScale(root, flats) {
  return [0, 2, 4, 5, 7, 9, 11].map((s) => transpose(root, s, flats));
}

function minorScale(root, flats) {
  return [0, 2, 3, 5, 7, 8, 10].map((s) => transpose(root, s, flats));
}

function harmonicMinor(root, flats) {
  return [0, 2, 3, 5, 7, 8, 11].map((s) => transpose(root, s, flats));
}

function melodicMinor(root, flats) {
  return [0, 2, 3, 5, 7, 9, 11].map((s) => transpose(root, s, flats));
}

function guessKey(chord) {
  if (chord.isMinor) return { tonic: chord.root, mode: "minor" };
  if (chord.isDom7) {
    // treat as V of a key a fifth down for bluesy starts, but keep root as tonal center option
    return { tonic: chord.root, mode: "mixo" };
  }
  return { tonic: chord.root, mode: "major" };
}

function fixKeyLabel(key) {
  const flats = preferFlats(key.tonic, key.mode === "mixo" ? "major" : key.mode);
  const t = spell(key.tonic, flats);
  if (key.mode === "minor") return `${t} минор`;
  if (key.mode === "mixo") return `${t} Mixolydian / доминантный центр`;
  return `${t} мажор`;
}

function degreeMap(key) {
  const flats = preferFlats(key.tonic, key.mode === "mixo" ? "major" : key.mode);
  const T = key.tonic;
  if (key.mode === "minor") {
    return {
      flats,
      i: ch(T, "m", flats),
      i7: ch(T, "m7", flats),
      i9: ch(T, "m9", flats),
      iim7b5: ch(transpose(T, 2), "m7b5", flats),
      bIII: ch(transpose(T, 3), "", flats),
      bIIImaj7: ch(transpose(T, 3), "maj7", flats),
      iv: ch(transpose(T, 5), "m", flats),
      iv7: ch(transpose(T, 5), "m7", flats),
      IV: ch(transpose(T, 5), "", flats),
      IV7: ch(transpose(T, 5), "7", flats),
      v: ch(transpose(T, 7), "m", flats),
      v7: ch(transpose(T, 7), "m7", flats),
      V: ch(transpose(T, 7), "", flats),
      V7: ch(transpose(T, 7), "7", flats),
      V7alt: ch(transpose(T, 7), "7alt", flats),
      V9: ch(transpose(T, 7), "9", flats),
      V7sus: ch(transpose(T, 7), "7sus4", flats),
      bVI: ch(transpose(T, 8), "", flats),
      bVImaj7: ch(transpose(T, 8), "maj7", flats),
      bVII: ch(transpose(T, 10), "", flats),
      bVII7: ch(transpose(T, 10), "7", flats),
      VIIdim7: ch(transpose(T, 11), "dim7", flats),
      // secondary / chromatic
      II7: ch(transpose(T, 2), "7", flats),
      III7: ch(transpose(T, 3), "7", flats),
      "bII7": ch(transpose(T, 1), "7", flats),
      subV: ch(transpose(T, 1), "7", flats), // tritone of V is bII7
      Imaj: ch(T, "", flats),
      Isus2: ch(T, "sus2", flats),
      iadd9: ch(T, "madd9", flats),
      imaj7: ch(T, "m(maj7)", flats),
      bVIaug: ch(transpose(T, 8), "aug", flats),
      bIaug: ch(transpose(T, 11), "aug", flats),
      bIImaj: ch(transpose(T, 1), "", flats),
      bIImaj7: ch(transpose(T, 1), "maj7", flats),
      V7sharp9: ch(transpose(T, 7), "7#9", flats),
      V7flat9: ch(transpose(T, 7), "7b9", flats),
    };
  }

  // major / mixo treated as major center with mixo colors available
  return {
    flats,
    I: ch(T, "", flats),
    Imaj7: ch(T, "maj7", flats),
    Imaj9: ch(T, "maj9", flats),
    I6: ch(T, "6", flats),
    Iadd9: ch(T, "add9", flats),
    Isus2: ch(T, "sus2", flats),
    Isus4: ch(T, "sus4", flats),
    I7: ch(T, "7", flats),
    ii: ch(transpose(T, 2), "m", flats),
    ii7: ch(transpose(T, 2), "m7", flats),
    ii9: ch(transpose(T, 2), "m9", flats),
    iii: ch(transpose(T, 4), "m", flats),
    iii7: ch(transpose(T, 4), "m7", flats),
    IV: ch(transpose(T, 5), "", flats),
    IVmaj7: ch(transpose(T, 5), "maj7", flats),
    IV7: ch(transpose(T, 5), "7", flats),
    IVadd9: ch(transpose(T, 5), "add9", flats),
    V: ch(transpose(T, 7), "", flats),
    V7: ch(transpose(T, 7), "7", flats),
    V9: ch(transpose(T, 7), "9", flats),
    V13: ch(transpose(T, 7), "13", flats),
    V7sus: ch(transpose(T, 7), "7sus4", flats),
    V7alt: ch(transpose(T, 7), "7alt", flats),
    vi: ch(transpose(T, 9), "m", flats),
    vi7: ch(transpose(T, 9), "m7", flats),
    viiø: ch(transpose(T, 11), "m7b5", flats),
    viidim: ch(transpose(T, 11), "dim", flats),
    // borrowed / modal mixture
    bVII: ch(transpose(T, 10), "", flats),
    bVII7: ch(transpose(T, 10), "7", flats),
    bVI: ch(transpose(T, 8), "", flats),
    bVImaj7: ch(transpose(T, 8), "maj7", flats),
    bIII: ch(transpose(T, 3), "", flats),
    iv: ch(transpose(T, 5), "m", flats),
    i: ch(T, "m", flats),
    i7: ch(T, "m7", flats),
    // secondaries
    V7ofV: ch(transpose(T, 2), "7", flats),
    V7ofii: ch(transpose(T, 9), "7", flats),
    V7ofvi: ch(transpose(T, 4), "7", flats),
    V7ofIV: ch(T, "7", flats),
    subV: ch(transpose(T, 1), "7", flats),
    III7: ch(transpose(T, 4), "7", flats),
    // lydian / color
    II: ch(transpose(T, 2), "", flats),
    "II7": ch(transpose(T, 2), "7", flats),
    "#IVdim": ch(transpose(T, 6), "dim7", flats),
    Iaug: ch(T, "aug", flats),
    Imaj7sharp11: ch(T, "maj7#11", flats),
    bVIaug: ch(transpose(T, 8), "aug", flats),
    bIIIaug: ch(transpose(T, 3), "aug", flats),
    bIImaj: ch(transpose(T, 1), "", flats),
    bIImaj7: ch(transpose(T, 1), "maj7", flats),
    V7sharp9: ch(transpose(T, 7), "7#9", flats),
    V7flat9: ch(transpose(T, 7), "7b9", flats),
    viidim7: ch(transpose(T, 11), "dim7", flats),
  };
}

function startLabel(answers, d) {
  // Prefer user's exact spelling if it matches the key center
  return answers.start;
}

/* ---------- catalog ---------- */

function buildCatalog(answers) {
  const start = parseChord(answers.start);
  const key = guessKey(start);
  // If user started on minor-looking chord but we guessed mixo from 7, keep dominant catalog branch
  const d = degreeMap(key);
  const S = startLabel(answers, d);
  const ideas = [];

  const add = (family, style, kind, path, why, tags = []) => {
    ideas.push({ family, style, kind, path, why, tags });
  };

  const isMin = key.mode === "minor";

  // ===== DIATONIC / POP =====
  if (isMin) {
    add("Диатоника / поп-рок", "diatonic", "Aeolian loop",
      [S, d.bVII, d.bVI, d.bVII],
      "Классический минорный «степ»: i–bVII–bVI. На гитаре часто барре-сдвиг.",
      ["bright", "lift", "chorus", "home"]);
    add("Диатоника / поп-рок", "diatonic", "i–iv–v",
      [S, d.iv, d.v, S],
      "Натуральный минор без доминанты — фолк/инди-окраска.",
      ["dark", "home", "verse", "fall"]);
    add("Диатоника / поп-рок", "diatonic", "i–bVI–bVII–i",
      [S, d.bVI, d.bVII, S],
      "Широкий минорный оборот, хорошо тянет в припев.",
      ["lift", "chorus", "bright"]);
    add("Диатоника / поп-рок", "diatonic", "i–bIII–bVII–iv",
      [S, d.bIII, d.bVII, d.iv],
      "Более «песенный» контур с bIII как мажорным светом.",
      ["verse", "wander", "dream"]);
    add("Диатоника / поп-рок", "diatonic", "Andalusian",
      [S, d.bVII, d.bVI, d.V7],
      "Андалузский каданс: нисходящий бас + доминанта в конце.",
      ["fall", "tense", "groovy", "solo"]);
  } else {
    add("Диатоника / поп-рок", "diatonic", "I–V–vi–IV",
      [S, d.V, d.vi, d.IV],
      "Самый узнаваемый поп-каркас. Меняйте ритм — песня уже другая.",
      ["bright", "lift", "chorus", "home"]);
    add("Диатоника / поп-рок", "diatonic", "I–vi–IV–V",
      [S, d.vi, d.IV, d.V],
      "50s doo-wop / ballad turnaround.",
      ["home", "verse", "bright", "dream"]);
    add("Диатоника / поп-рок", "diatonic", "I–IV–V–IV",
      [S, d.IV, d.V, d.IV],
      "Классика рока и кантри — телесный рифф.",
      ["groovy", "lift", "chorus", "home"]);
    add("Диатоника / поп-рок", "diatonic", "vi–IV–I–V (от относительного)",
      [d.vi, d.IV, S, d.V],
      "Если стартовать «как будто vi» — мгновенный припевный характер.",
      ["lift", "chorus", "bright"]);
    add("Диатоника / поп-рок", "diatonic", "I–iii–IV–V",
      [S, d.iii, d.IV, d.V],
      "iii даёт мягкий подъём без ухода в минорную драму.",
      ["verse", "bright", "dream"]);
    add("Диатоника / поп-рок", "diatonic", "I–V–IV–V",
      [S, d.V, d.IV, d.V],
      "Прямой, гитарный, без vi — больше «стены» звука.",
      ["lift", "groovy", "chorus"]);
  }

  // ===== CLASSICAL CADENCES =====
  if (isMin) {
    add("Каденции / классика", "classical", "Автентическая (гарм. минор)",
      [S, d.iv, d.V7, S],
      "iv–V7–i: напряжение гармонического минора.",
      ["tense", "home", "verse", "solo"]);
    add("Каденции / классика", "classical", "Плагальная",
      [S, d.iv, S],
      "Amen-каденция в миноре — тихий конец фразы.",
      ["fall", "dark", "intro", "home"]);
    add("Каденции / классика", "classical", "Фригийский оборот",
      [S, d.bVII, d.bVI, d.V7],
      "Нисходящие ступени к доминанте — сильный жест.",
      ["fall", "tense", "bridge"]);
    add("Каденции / классика", "classical", "Обманная",
      [d.V7, d.bVI, d.bVII, S],
      "V7 → bVI вместо i: обман, потом возврат.",
      ["twist", "tense", "bridge"]);
  } else {
    add("Каденции / классика", "classical", "Автентическая Perfect",
      [d.IV, d.V7, S],
      "IV–V7–I — учебниковая полная каденция.",
      ["home", "tense", "verse"]);
    add("Каденции / классика", "classical", "Плагальная Amen",
      [S, d.IV, S],
      "Мягкое «аминь» без доминанты.",
      ["home", "fall", "intro", "dream"]);
    add("Каденции / классика", "classical", "Половинная",
      [S, d.ii, d.V7],
      "Остановка на V — вопрос без ответа (куплет → припев).",
      ["tense", "verse", "lift"]);
    add("Каденции / классика", "classical", "Обманная V–vi",
      [d.V7, d.vi, d.IV, S],
      "V7 → vi: классический обманный каданс.",
      ["twist", "dream", "bridge"]);
    add("Каденции / классика", "classical", "I–IV–viiø–I",
      [S, d.IV, d.viiø, S],
      "viiø как «лёгкая доминанта» — камерный классический вкус.",
      ["home", "dream", "verse"]);
  }

  // ===== BLUES =====
  {
    const I7 = isMin ? d.i7 : d.I7;
    const IV7 = d.IV7;
    const V7 = d.V7;
    add("Блюз", "blues", "12-takt (схема)",
      [I7, I7, I7, I7, IV7, IV7, I7, I7, V7, IV7, I7, V7],
      "Стандартный 12-тактовый блюз. Играйте доминанты на всех ступенях.",
      ["groovy", "solo", "tense", "lift"]);
    add("Блюз", "blues", "Quick change",
      [I7, IV7, I7, I7, IV7, IV7, I7, I7, V7, IV7, I7, V7],
      "Quick IV во 2-м такте — более «городской» блюз.",
      ["groovy", "solo", "lift"]);
    add("Блюз", "blues", "Turnaround (I–VI–II–V)",
      [I7, isMin ? d.III7 : d.V7ofii, isMin ? d.II7 : d.V7ofV, V7],
      "Классический turnaround в последние такты формы.",
      ["tense", "home", "solo", "jazz"]);
    add("Блюз", "blues", "Minor blues",
      [isMin ? S : d.i, isMin ? d.iv7 : ch(transpose(key.tonic, 5), "m7", d.flats), isMin ? S : d.i, d.V7alt],
      "Минорный блюз: i–iv–i–V7alt. Для тёмного грува.",
      ["dark", "groovy", "solo", "fall"]);
    add("Блюз", "blues", "Stormy Monday vibe",
      [I7, d.IV7, isMin ? d.bVI : d.IVmaj7, I7, d.II7 || d.V7ofV, d.V7],
      "Более джазовый блюз с VI/II красками.",
      ["dream", "solo", "jazz", "wander"]);
  }

  // ===== JAZZ =====
  if (isMin) {
    add("Джаз", "jazz", "iiø–V–i",
      [d.iim7b5, d.V7alt, S],
      "Малая каденция минора. V7alt → i — базовый джазовый жест.",
      ["tense", "home", "solo", "dream"]);
    add("Джаз", "jazz", "Minor turnaround",
      [S, d.bVImaj7, d.iim7b5, d.V7alt],
      "i–bVImaj7–iiø–V7alt: стандартный минорный оборот.",
      ["home", "dream", "verse", "solo"]);
    add("Джаз", "jazz", "Line cliché i–i(maj7)–i7–i6",
      [ch(key.tonic, "m", d.flats), ch(key.tonic, "m(maj7)", d.flats), d.i7, ch(key.tonic, "m6", d.flats)],
      "Нисходящий хроматический голос в миноре — баллада/босса.",
      ["dream", "fall", "intro", "latin"]);
    add("Джаз", "jazz", "Tritone sub",
      [d.iim7b5, d.subV, S],
      "iiø–bII7–i: тритоновая замена доминанты.",
      ["twist", "tense", "jazz", "solo"]);
    add("Джаз", "jazz", "Backdoor (минорный вкус)",
      [S, d.iv7, d.bVII7, d.bIIImaj7],
      "Backdoor-ощущение через bVII7 к относительному мажору.",
      ["wander", "dream", "bridge"]);
  } else {
    add("Джаз", "jazz", "ii–V–I",
      [d.ii7, d.V7, d.Imaj7],
      "Главная джазовая каденция. Смените войсинги — целая жизнь.",
      ["home", "tense", "solo", "dream"]);
    add("Джаз", "jazz", "ii–V–I–VI7",
      [d.ii7, d.V7, d.Imaj7, d.V7ofii],
      "Turnaround: VI7 ведёт обратно к ii.",
      ["home", "wander", "solo"]);
    add("Джаз", "jazz", "I–VI–II–V",
      [d.Imaj7, d.V7ofii, d.V7ofV, d.V7],
      "Ритм-чендж / turnaround ядро.",
      ["lift", "groovy", "solo", "jazz"]);
    add("Джаз", "jazz", "Secondary dominants chain",
      [S, d.V7ofvi, d.vi7, d.V7ofV, d.V7, d.Imaj7],
      "Цепочка вторичных доминант — «путешествие домой».",
      ["wander", "lift", "tense"]);
    add("Джаз", "jazz", "Tritone substitution",
      [d.ii7, d.subV, d.Imaj7],
      "ii–bII7–I: хроматический бас вниз.",
      ["twist", "fall", "dream", "tense"]);
    add("Джаз", "jazz", "Backdoor progression",
      [d.IVmaj7, d.bVII7, d.Imaj7],
      "IV–bVII7–I: backdoor cadence (Steely Dan и далее).",
      ["twist", "dream", "bridge", "soul"]);
    add("Джаз", "jazz", "Coltrane-ish thirds (локально)",
      [d.Imaj7, ch(transpose(key.tonic, 4), "maj7", d.flats), ch(transpose(key.tonic, 8), "maj7", d.flats), d.Imaj7],
      "Мажорные тональности по большим терциям — компактный Coltrane-жест.",
      ["wander", "twist", "solo"]);
    add("Джаз", "jazz", "Imaj7–iii7–vi7–ii7–V7",
      [d.Imaj7, d.iii7, d.vi7, d.ii7, d.V7],
      "Диатонический спуск септаккордов — баллада/стандарт.",
      ["fall", "dream", "verse"]);
  }

  // ===== MODAL =====
  if (isMin) {
    add("Модальность", "modal", "Dorian vamp",
      [S, d.IV, S, d.IV],
      "i–IV (мажорная IV): дорийский свет внутри минора.",
      ["dream", "groovy", "solo", "bright"]);
    add("Модальность", "modal", "Dorian 7s",
      [d.i7, ch(transpose(key.tonic, 5), "7", d.flats), d.i7, d.bVII7],
      "Дорийский грув с доминантной IV и bVII7.",
      ["groovy", "solo", "lift"]);
    add("Модальность", "modal", "Phrygian",
      [S, ch(transpose(key.tonic, 1), "", d.flats), S],
      "i–bII: фригийский колорит (испанский/металл/саундтрек).",
      ["dark", "tense", "twist", "metal"]);
    add("Модальность", "modal", "Aeolian metal/rock",
      [S, d.bVII, d.bVI, d.bVII],
      "Тяжёлый aeolian-рифующий контур.",
      ["dark", "groovy", "metal", "chorus"]);
  } else {
    add("Модальность", "modal", "Mixolydian vamp",
      [d.I7, d.bVII, d.I7, d.IV],
      "I7–bVII: миксолидийский рок/фолк-грув.",
      ["groovy", "lift", "solo", "bright"]);
    add("Модальность", "modal", "Lydian #11 color",
      [d.Imaj7, d.II, d.Imaj7, d.V],
      "I–II (мажорная II): лидийский блеск.",
      ["dream", "bright", "intro", "solo"]);
    add("Модальность", "modal", "Sus pedal",
      [d.V7sus, d.V7, S],
      "Педаль на Vsus → V → I: модальная задержка разрешения.",
      ["tense", "intro", "home"]);
    add("Модальность", "modal", "I–bVII–IV",
      [S, d.bVII, d.IV, S],
      "Миксо/рок-классика (Sweet Home-тип контура без цитат).",
      ["groovy", "lift", "chorus"]);
  }

  // ===== SOUL / GOSPEL =====
  if (isMin) {
    add("Соул / госпел / R&B", "soul", "Minor gospel lift",
      [S, d.iv7, d.V7sus, d.V7, S],
      "Минорный госпел-подход к доминанте через sus.",
      ["lift", "tense", "chorus", "soul"]);
    add("Соул / госпел / R&B", "soul", "i7–iv7–bVIImaj7–bIIImaj7",
      [d.i7, d.iv7, ch(transpose(key.tonic, 10), "maj7", d.flats), d.bIIImaj7],
      "Тёплый R&B-минор с мажорными красками сверху.",
      ["dream", "groovy", "verse"]);
  } else {
    add("Соул / госпел / R&B", "soul", "IV–I gospel",
      [d.IV, S, d.IV, S],
      "Плагальный госпел-пульс. Добавьте 7sus на V между ними.",
      ["home", "lift", "chorus", "groovy"]);
    add("Соул / госпел / R&B", "soul", "1–3–4 walk",
      [d.I, d.III7, d.IV, d.IVmaj7],
      "Хроматический/терцовый подъём к IV — госпел-ход.",
      ["lift", "soul", "bright"]);
    add("Соул / госпел / R&B", "soul", "7sus chain",
      [d.Imaj7, d.V7sus, d.V7, d.vi7, d.V7ofV, d.V7sus, d.V7, d.Imaj7],
      "Подвешенные доминанты — нео-соул/госпел дыхание.",
      ["dream", "soul", "verse"]);
    add("Соул / госпел / R&B", "soul", "ii7–V7sus–Imaj9",
      [d.ii7, d.V7sus, d.Imaj9],
      "Мягкое R&B-разрешение в maj9.",
      ["dream", "home", "chorus"]);
  }

  // ===== LATIN =====
  add("Латина / босса", "latin", "Bossa ii–V–I",
    isMin ? [d.iim7b5, d.V7, d.i9 || S] : [d.ii7, d.V13, d.Imaj9],
    "Босса-каденция: длинные септы, мягкий ритм, мало атак.",
    ["dream", "home", "intro", "verse"]);
  add("Латина / босса", "latin", "Descending maj7",
    isMin
      ? [d.bIIImaj7, ch(transpose(key.tonic, 1), "maj7", d.flats), d.i7, d.V7]
      : [d.Imaj7, ch(transpose(key.tonic, -1), "maj7", d.flats), d.viiø, d.iii7],
    "Нисходящие maj7 — босса/латино-баллада.",
    ["fall", "dream", "wander"]);
  if (!isMin) {
    add("Латина / босса", "latin", "Montuno-ish I–IV",
      [d.I, d.IV, d.I, d.V7],
      "Простой монтажный пульс под латино-грув.",
      ["groovy", "lift", "chorus"]);
  }

  // ===== ROCK / METAL =====
  if (isMin) {
    add("Рок / металл / модал", "metal", "Power i–bVII–bVI",
      [S, d.bVII, d.bVI, d.bVII],
      "Силовые/барре: aeolian-стена.",
      ["dark", "lift", "chorus", "groovy"]);
    add("Рок / металл / модал", "metal", "Phrygian thrash",
      [S, ch(transpose(key.tonic, 1), "", d.flats), d.bVII, S],
      "i–bII–bVII: фригийский металл-ход.",
      ["tense", "twist", "solo", "dark"]);
    add("Рок / металл / модал", "metal", "Harmonic minor drama",
      [S, d.bVI, d.V7, S],
      "Гармонический минор для «саундтрекового» надрыва.",
      ["tense", "bridge", "lift"]);
  } else {
    add("Рок / металл / модал", "metal", "I–bVII–IV–I",
      [S, d.bVII, d.IV, S],
      "Хард-рок миксолидийский каркас.",
      ["lift", "groovy", "chorus"]);
    add("Рок / металл / модал", "metal", "I5–bIII–IV",
      [ch(key.tonic, "5", d.flats), d.bIII, d.IV, ch(key.tonic, "5", d.flats)],
      "Параллельный минорный свет (bIII) в мажорном риффе.",
      ["twist", "lift", "groovy"]);
  }

  // ===== CHROMATIC / BORROWED =====
  if (isMin) {
    add("Хром / заимствования", "chromatic", "Parallel major flash",
      [S, d.Imaj, d.bVII, S],
      "Вспышка одноимённого мажора — внезапный свет.",
      ["twist", "bright", "bridge"]);
    add("Хром / заимствования", "chromatic", "Chromatic bass down",
      [S, ch(transpose(key.tonic, -1), "7", d.flats), d.bVII7 || d.bVII, d.bVI],
      "Хроматический бас вниз от тоники.",
      ["fall", "wander", "dream"]);
    add("Хром / заимствования", "chromatic", "Picardy-ish end",
      [d.iv, d.V7, d.Imaj],
      "Минорная фраза → мажорная тоника (Пикардийская терция).",
      ["twist", "home", "intro"]);
  } else {
    add("Хром / заимствования", "chromatic", "Modal mixture iv",
      [S, d.iv, d.V, S],
      "Заимствование iv из параллельного минора — мгновенная тень.",
      ["dark", "twist", "verse", "fall"]);
    add("Хром / заимствования", "chromatic", "I–bVI–bVII–I",
      [S, d.bVI, d.bVII, S],
      "Эпический borrowed контур (саундтрек/альт-рок).",
      ["lift", "twist", "chorus"]);
    add("Хром / заимствования", "chromatic", "I–Imaj7–I7–IV",
      [S, d.Imaj7, d.I7, d.IV],
      "Нисходящий голос 8–7–b7 внутри I → в IV.",
      ["fall", "soul", "verse", "dream"]);
    add("Хром / заимствования", "chromatic", "Tritone + mixture",
      [d.ii7, d.subV, d.Imaj7, d.bVII],
      "Тритоновая замена и сразу bVII — двойной сюрприз.",
      ["twist", "wander", "bridge"]);
    add("Хром / заимствования", "chromatic", "Descending #IV°",
      [S, d["#IVdim"], d.IV, d.Imaj7],
      "#IVdim как проход к IV — стандартный «украшающий» хром.",
      ["home", "dream", "verse"]);
  }

  // Circle of fifths wander
  if (isMin) {
    add("Квинтовый круг", "diatonic", "Fifths in minor",
      [S, d.iv, d.bVII, d.bIII, d.bVI, d.iim7b5, d.V7, S],
      "Длинная дуга по квинтам в миноре — куплет-путешествие.",
      ["wander", "verse", "fall"]);
  } else {
    add("Квинтовый круг", "diatonic", "Circle diatonic 7ths",
      [d.Imaj7, d.IV, d.viiø, d.iii7, d.vi7, d.ii7, d.V7, d.Imaj7],
      "Полный диатонический круг септаккордов.",
      ["wander", "dream", "verse", "solo"]);
  }

  // Part-specific extras
  if (answers.part === "bridge") {
    add("Форма: бридж", "classical", "Bridge away-and-home",
      isMin ? [d.bVI, d.bVII, d.V7, S] : [d.vi, d.IV, d.ii7, d.V7],
      "Уводим от тоники и готовим возврат доминантой.",
      ["bridge", "wander", "tense"]);
  }
  if (answers.part === "intro") {
    add("Форма: интро", "modal", "Intro sus / color",
      isMin ? [d.Isus2 || d.iadd9, S] : [d.Isus2, d.Iadd9, S],
      "Короткий цветной вход без полной каденции.",
      ["intro", "dream", "home"]);
  }
  if (answers.part === "solo") {
    add("Форма: соло", "modal", "Static vamp for solo",
      isMin ? [d.i7, d.i7, d.bVII7, d.iv7] : [d.I7, d.I7, d.IV7, d.I7],
      "Статичный вамп — соло само расскажет историю.",
      ["solo", "groovy", "home"]);
  }

  return { key, ideas, degrees: d };
}

function scoreIdea(idea, answers) {
  let score = 0;
  const tags = new Set(idea.tags || []);
  if (tags.has(answers.mood)) score += 3;
  if (tags.has(answers.move)) score += 3;
  if (tags.has(answers.part)) score += 2;
  if (answers.style && answers.style !== "all") {
    if (idea.style === answers.style) score += 6;
    else score -= 1;
  }
  return score;
}

function progressionsFor(answers) {
  const { key, ideas } = buildCatalog(answers);
  const ranked = ideas
    .map((idea) => ({ ...idea, score: scoreIdea(idea, answers) }))
    .sort((a, b) => b.score - a.score);

  if (answers.style && answers.style !== "all") {
    const filtered = ranked.filter((i) => i.style === answers.style || i.score >= 5);
    return { key, ideas: filtered.length ? filtered : ranked.slice(0, 12) };
  }
  return { key, ideas: ranked };
}

function melodyFor(answers, key) {
  const flats = preferFlats(key.tonic, key.mode === "mixo" ? "major" : key.mode);
  const T = key.tonic;
  let scales = [];

  if (key.mode === "minor") {
    scales = [
      { name: "Aeolian (нат. минор)", notes: minorScale(T, flats) },
      { name: "Dorian", notes: [0, 2, 3, 5, 7, 9, 10].map((s) => transpose(T, s, flats)) },
      { name: "Harmonic minor", notes: harmonicMinor(T, flats) },
      { name: "Melodic minor", notes: melodicMinor(T, flats) },
      { name: "Minor pentatonic", notes: [0, 3, 5, 7, 10].map((s) => transpose(T, s, flats)) },
      { name: "Blues", notes: [0, 3, 5, 6, 7, 10].map((s) => transpose(T, s, flats)) },
    ];
  } else if (key.mode === "mixo") {
    scales = [
      { name: "Mixolydian", notes: [0, 2, 4, 5, 7, 9, 10].map((s) => transpose(T, s, flats)) },
      { name: "Major pentatonic", notes: [0, 2, 4, 7, 9].map((s) => transpose(T, s, flats)) },
      { name: "Blues", notes: [0, 3, 5, 6, 7, 10].map((s) => transpose(T, s, flats)) },
    ];
  } else {
    scales = [
      { name: "Ionian (мажор)", notes: majorScale(T, flats) },
      { name: "Lydian", notes: [0, 2, 4, 6, 7, 9, 11].map((s) => transpose(T, s, flats)) },
      { name: "Mixolydian", notes: [0, 2, 4, 5, 7, 9, 10].map((s) => transpose(T, s, flats)) },
      { name: "Major pentatonic", notes: [0, 2, 4, 7, 9].map((s) => transpose(T, s, flats)) },
      { name: "Blues (поверх мажора)", notes: [0, 3, 5, 6, 7, 10].map((s) => transpose(T, s, flats)) },
    ];
  }

  const tips = [];
  if (answers.mood === "tense") tips.push("На доминанте: guide tones (3 и b7), потом approach chromatic снизу/сверху.");
  if (answers.mood === "dream") tips.push("Держите 9/11/#11 как долгие тона над maj7 и m7.");
  if (answers.mood === "groovy") tips.push("Риффуйте pentatonic/blues, а смены аккордов подчёркивайте арпеджио на сильной доле.");
  if (answers.mood === "dark") tips.push("Aeolian + occasional b2 (phrygian) на переходах — тень без смены формы.");
  if (answers.mood === "bright") tips.push("Пентатоника + прыжки 1→5→6; на припеве — выше позицией.");
  if (answers.move === "wander") tips.push("При модуляции целитесь в 3-ю нового аккорда — ухо считывает смену быстрее.");
  if (answers.part === "solo") tips.push("Сначала мотив из 3–4 нот, потом sequence по квинтам/ступеням.");
  if (!tips.length) tips.push("Играйте арпеджио текущего аккорда, затем соединяйте хроматическими подходами.");

  return { scales, tips };
}


if (typeof window !== "undefined") {
  window.LadCatalog = {
    START_CHORDS,
    MOODS,
    MOVES,
    PARTS,
    STYLES,
    parseChord,
    guessKey,
    degreeMap,
    buildCatalog,
    progressionsFor,
    melodyFor,
    scoreIdea,
  };
  window.START_CHORDS = START_CHORDS;
  window.MOODS = MOODS;
  window.progressionsFor = progressionsFor;
  window.parseChord = parseChord;
  window.guessKey = guessKey;
  window.degreeMap = degreeMap;
  window.buildCatalog = buildCatalog;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    START_CHORDS,
    MOODS,
    MOVES,
    PARTS,
    STYLES,
    parseChord,
    guessKey,
    degreeMap,
    buildCatalog,
    progressionsFor,
    melodyFor,
    scoreIdea,
  };
}
