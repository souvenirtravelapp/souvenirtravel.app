// Mirrors TravelMemory/Design/SearchText.swift (fold, skeleton, matches,
// matchesLoosely) and NextTripFilter.nameKey from NextTripFilter.swift.
// Same rules, same thresholds, same tie-breaks. No deliberate divergence.

// The substitutions people actually make when typing — alef family to plain
// alef, ة to ه, ى to ي, ؤ to و, ئ to ي. Applied per code point after
// canonical decomposition, exactly as the Swift scalar map does.
const LETTER_MAP = {
  'أ': 'ا', // أ
  'إ': 'ا', // إ
  'آ': 'ا', // آ
  'ٱ': 'ا', // ٱ
  'ة': 'ه', // ة
  'ى': 'ي', // ى
  'ؤ': 'و', // ؤ
  'ئ': 'ي', // ئ
};

/// Folding a typed word down to what the person meant by it.
/// Case and surrounding space go; combining marks go (Arabic harakat and
/// Latin accents alike); tatweel and dagger alef go; the alef family becomes
/// ا, ة becomes ه, ى becomes ي, ؤ ئ become و ي; a standalone hamza goes;
/// a leading ال is dropped when more than three characters remain.
export function fold(text) {
  // Lowercase first, then canonical decomposition — the Swift order. NFD
  // separates a letter from its marks so accents and harakat fall out as
  // combining scalars.
  const decomposed = String(text).toLowerCase().normalize('NFD');
  let out = '';
  for (const ch of decomposed) {
    const v = ch.codePointAt(0);
    // Combining marks — Latin accents and Arabic vowel marks alike.
    if (v >= 0x0300 && v <= 0x036f) continue;
    // Through 065F, not 0652: decomposition splits أ إ آ ؤ ئ into a plain
    // letter plus a combining hamza at 0653–0655, and stopping at the vowel
    // marks would leave the hamza standing (الطائف would never meet الطايف).
    if (v >= 0x064b && v <= 0x065f) continue;
    if (v === 0x0640) continue; // tatweel
    if (v === 0x0670) continue; // dagger alef
    // A hamza standing alone carries no sound a typist reliably reaches for.
    // (Swift removes it after the map; nothing maps to it, so order is moot.)
    if (v === 0x0621) continue;
    out += LETTER_MAP[ch] ?? ch;
  }
  let folded = out.trim();
  const chars = Array.from(folded);
  if (folded.startsWith('ال') && chars.length > 3) folded = chars.slice(2).join('');
  return folded;
}

// Emphatic and plain letters meet — the same sound to a typist who did not
// stop to think.
const EMPHATIC_MAP = {
  'ص': 'س',
  'ط': 'ت',
  'ض': 'د',
  'ظ': 'ز',
  'ق': 'ك',
  'غ': 'ج', // Turkish ğ reaches Arabic as either
};

/// The consonant skeleton — a looser key, used only when the strict fold
/// finds nothing at all. Long vowels (ا و ي), ه, and spaces drop; emphatic
/// letters collapse onto their plain twins.
export function skeleton(text) {
  let out = '';
  for (const ch of fold(text)) {
    if (ch === 'ا' || ch === 'و' || ch === 'ي' || ch === 'ه') continue;
    // أبوظبي and أبو ظبي are one name written by two hands.
    if (ch === ' ') continue;
    out += EMPHATIC_MAP[ch] ?? ch;
  }
  return out;
}

/// Whether any of these names matches the query on its skeleton.
/// A two-character key is allowed, but only from the START of a name;
/// three characters or more can match anywhere.
export function matchesLoosely(query, names) {
  const key = skeleton(query);
  const keyLength = Array.from(key).length;
  if (keyLength < 2) return false;
  return names.some((name) => {
    const folded = skeleton(name);
    return keyLength >= 3 ? folded.includes(key) : folded.startsWith(key);
  });
}

/// True when `query`, folded, appears anywhere in any of `fields`, folded.
/// Contains rather than prefix — people search by the distinctive part of a
/// name as readily as its beginning. Null/empty fields never match; an empty
/// query matches everything.
export function matches(query, fields) {
  const needle = fold(query);
  if (!needle) return true;
  return fields.some((field) => {
    if (field == null || field === '') return false;
    return fold(field).includes(needle);
  });
}

/// The key visited-city names are matched on. A parenthetical is a label,
/// not part of the name: "Sofia (Vitosha)", "Sofia" and a trip typed as
/// either all reach the same record. The name before its bracket, trimmed,
/// then folded the same way the searches fold.
export function nameKey(name) {
  const base = String(name).split('(')[0] ?? String(name);
  return fold(base.trim());
}
