// Mirrors TravelMemory/NextTrip/NextTripFilter.swift: the finder's filter —
// month, visa groups + Schengen widening, warmth bands, rain ladder, papers
// ("where does my document take me"), origin/nonstop, and the two-pass name
// search (exact matches first, skeleton matches appended after, never as a
// rescue). Defaults are settings, not searches.
// Deliberate divergences:
//  - persisted to one localStorage key "sv.filter" instead of per-suffix
//    UserDefaults keys (same values, same load rules);
//  - the "new to me" chip is OMITTED: it needs the trip archive
//    (PlacesVisited), and the web has no past trips to check against;
//  - sorting uses Intl.Collator (numeric, per reading language) as the
//    closest analogue of localizedStandardCompare;
//  - summary() is not ported — it is localized UI text, not planning logic.

import { fold, matches as textMatches, matchesLoosely, nameKey } from './searchtext.js';
import { rainLevel, warmthBand, visaGroupOf } from './store.js';
import { Shortlist } from './shortlist.js';

export { nameKey };

const KEY = 'sv.filter';

/// How wet a month a person is asking for — a ladder, not a set of boxes.
/// Each rung means "this much or more".
export const RAIN_WANTED = ['any', 'some', 'moderate', 'heavy'];

/// The next rung, wrapping back to off — the whole chip is one button.
export function nextRainWanted(wanted) {
  const i = RAIN_WANTED.indexOf(wanted);
  return RAIN_WANTED[(i + 1) % RAIN_WANTED.length];
}

export function rainAdmits(wanted, level) {
  switch (wanted) {
    case 'any':
      return true;
    case 'some':
      return level !== 'none';
    case 'moderate':
      return level === 'moderate' || level === 'heavy';
    case 'heavy':
      return level === 'heavy';
    default:
      return true;
  }
}

/// The preferences vocabulary — four, each provable by a photograph.
export const DESTINATION_TAGS = ['nature', 'history', 'sea', 'mountain'];

/// Only tags that actually exist in the data are offered as filters,
/// in the order the data first shows them.
export function tagsPresent(store) {
  const seen = new Set();
  const ordered = [];
  for (const city of store.cities) {
    for (const tag of city.tags) {
      if (DESTINATION_TAGS.includes(tag) && !seen.has(tag)) {
        seen.add(tag);
        ordered.push(tag);
      }
    }
  }
  return ordered;
}

const FACES = ['search', 'favourites'];
const PRESENTATIONS = ['map', 'list'];

export class NextTripFilter {
  /// `store` validates the stored passport against the shipped visa files —
  /// only a passport we still ship a file for survives; `shortlist` is the
  /// hearts owner (defaults to its own instance over the same storage).
  constructor(store, { storage = globalThis.localStorage, shortlist = null, lang = 'ar' } = {}) {
    this.store = store;
    this.storage = storage;
    this.shortlist = shortlist ?? new Shortlist(storage);
    this.lang = lang;

    let s = null;
    try {
      s = JSON.parse(storage.getItem(KEY) ?? 'null');
    } catch {
      s = null;
    }
    s = s ?? {};

    // Only a passport we still ship a file for survives a reload; and no
    // passport at all is a perfectly good state to start in.
    const storedPassport = s.passport ?? '';
    this._passport =
      store && store.passports().includes(storedPassport) ? storedPassport : null;

    const storedOrigin = s.origin ?? '';
    this._origin = storedOrigin;
    // A nonstop filter with nowhere to fly from would empty the screen and
    // never say why, so it cannot outlive the airport it was set against.
    this._nonstopOnly = storedOrigin !== '' && s.nonstopOnly === true;
    this._schengen = s.schengen === true;
    this._originCountry = s.originCountry ?? 'SA';

    // Travelling month, 1..12. First run: the month AFTER the current one —
    // people plan forward. Gregorian on purpose.
    const savedMonth = s.month;
    if (Number.isInteger(savedMonth) && savedMonth >= 1 && savedMonth <= 12) {
      this._month = savedMonth;
    } else {
      this._month = (new Date().getMonth() + 1) % 12 + 1;
    }

    // Open by default, and only on the very first visit.
    this._barExpanded = typeof s.barExpanded === 'boolean' ? s.barExpanded : true;
    this._rain = RAIN_WANTED.includes(s.rain) ? s.rain : 'any';
    this._visaGroups = new Set(
      (s.visaGroups ?? []).filter((g) => visaGroupOfIsValid(g))
    );
    this._bands = new Set(
      (s.bands ?? []).filter((b) => ['cold', 'mild', 'warm', 'hot'].includes(b))
    );
    // Preferences hidden (Tariq, 10 Aug) — nothing loads into the tag
    // filter, so no stored choice can silently narrow the results of a row
    // that no longer exists on screen. (Changes still persist, as in Swift.)
    this._tags = new Set();

    this._face = FACES.includes(s.face) ? s.face : 'search';
    this._presentation = PRESENTATIONS.includes(s.presentation) ? s.presentation : 'map';

    /// Countries (or "bloc:<name>") whose held documents the person is
    /// filtering by. NOT persisted, deliberately: every other filter is a
    /// standing preference; this one is a question asked once and answered.
    this.byDocument = new Set();

    /// What was typed into the destination search. Not persisted: a filter
    /// is a standing preference, a search is a question asked once.
    this.query = '';
  }

  // ---- persisted properties (each set saves, mirroring didSet) ----

  get month() {
    return this._month;
  }
  set month(v) {
    this._month = v;
    this.#save();
  }

  get visaGroups() {
    return this._visaGroups;
  }
  set visaGroups(v) {
    this._visaGroups = v instanceof Set ? v : new Set(v);
    this.#save();
  }

  get bands() {
    return this._bands;
  }
  set bands(v) {
    this._bands = v instanceof Set ? v : new Set(v);
    this.#save();
  }

  get tags() {
    return this._tags;
  }
  set tags(v) {
    this._tags = v instanceof Set ? v : new Set(v);
    this.#save();
  }

  get face() {
    return this._face;
  }
  set face(v) {
    this._face = v;
    this.#save();
    // Old hearts, kept before months existed, are stamped on the first
    // visit to the shortlist so they stop drifting with the filter.
    if (v === 'favourites') this.shortlist.stampMissingMonths(this._month);
  }

  get presentation() {
    return this._presentation;
  }
  set presentation(v) {
    this._presentation = v;
    this.#save();
  }

  get passport() {
    return this._passport;
  }
  set passport(v) {
    this._passport = v;
    this.#save();
  }

  get origin() {
    return this._origin;
  }
  set origin(v) {
    this._origin = v;
    this.#save();
  }

  get originCountry() {
    return this._originCountry;
  }
  set originCountry(v) {
    this._originCountry = v;
    this.#save();
  }

  get nonstopOnly() {
    return this._nonstopOnly;
  }
  set nonstopOnly(v) {
    this._nonstopOnly = v;
    this.#save();
  }

  get schengen() {
    return this._schengen;
  }
  set schengen(v) {
    this._schengen = v;
    this.#save();
  }

  get rain() {
    return this._rain;
  }
  set rain(v) {
    this._rain = v;
    this.#save();
  }

  get barExpanded() {
    return this._barExpanded;
  }
  set barExpanded(v) {
    this._barExpanded = v;
    this.#save();
  }

  #save() {
    this.storage.setItem(
      KEY,
      JSON.stringify({
        month: this._month,
        visaGroups: [...this._visaGroups].sort(),
        bands: [...this._bands].sort(),
        tags: [...this._tags].sort(),
        face: this._face,
        presentation: this._presentation,
        passport: this._passport ?? '',
        origin: this._origin,
        originCountry: this._originCountry,
        nonstopOnly: this._nonstopOnly,
        schengen: this._schengen,
        rain: this._rain,
        barExpanded: this._barExpanded,
      })
    );
  }

  // ---- hearts ----

  get favourites() {
    return this.shortlist.cityIDs;
  }

  isFavourite(city) {
    return this.shortlist.contains(city.id);
  }

  toggleFavourite(city) {
    this.shortlist.toggle(city.id, this._month);
  }

  /// The shortlist face shows every kept city and no filter reaches it — a
  /// heart is a decision already made.
  shortlistCities(store = this.store) {
    const kept = this.shortlist.cityIDs;
    const collator = new Intl.Collator(this.lang, { numeric: true });
    const name = (c) => (this.lang === 'ar' ? c.name_ar : c.name_en);
    return store.cities
      .filter((c) => kept.has(c.id))
      .sort((a, b) => collator.compare(name(a), name(b)));
  }

  // ---- the question ----

  get isFiltering() {
    return (
      this._visaGroups.size > 0 ||
      this._bands.size > 0 ||
      this._tags.size > 0 ||
      this._nonstopOnly ||
      this._schengen ||
      this.byDocument.size > 0 ||
      this._rain !== 'any' ||
      this.query.trim() !== ''
    );
  }

  reset() {
    this.visaGroups = new Set();
    this.bands = new Set();
    this.tags = new Set();
    this.nonstopOnly = false;
    this.schengen = false;
    this.byDocument = new Set();
    this.rain = 'any';
    this.query = '';
  }

  /// Which cities answer the current filter. Both readings, always — the
  /// exact matches keep their place at the front; the looser ones follow,
  /// so nothing a person definitely asked for is pushed down by something
  /// they only maybe asked for.
  matches(store = this.store) {
    const exact = this.#matches(store, false);
    if (this.query.trim() === '') return exact;
    const loose = this.#matches(store, true);
    const seen = new Set(exact.map((c) => c.id));
    const merged = [...exact];
    for (const city of loose) {
      if (!seen.has(city.id)) {
        seen.add(city.id);
        merged.push(city);
      }
    }
    return merged;
  }

  #matches(store, loosely) {
    const collator = new Intl.Collator(this.lang, { numeric: true });
    const name = (c) => (this.lang === 'ar' ? c.name_ar : c.name_en);
    const query = this.query;
    const hasQuery = query.trim() !== '';

    const result = store.cities.filter((city) => {
      // The name first, and in both languages whichever is being read —
      // its own country too, and the editorial aliases.
      if (hasQuery) {
        const names = [
          city.name_ar,
          city.name_en,
          city.country_name_ar,
          city.country_name_en,
          ...(city.aliases_ar ?? []),
        ];
        if (loosely) {
          if (!matchesLoosely(query, names)) return false;
        } else {
          if (!textMatches(query, names)) return false;
        }
      }
      // Visa chips cannot narrow anything while the passport is unknown.
      // One row, one question, answered by ANY chip in it: "no visa needed"
      // and "Schengen" together want both sets, not their intersection.
      if (this._passport != null && (this._visaGroups.size > 0 || this._schengen)) {
        const visa = store.visa(city, this._passport);
        const group = visa ? visaGroupOf(visa.requirement) : null;
        const kindMatches = group != null ? this._visaGroups.has(group) : false;
        const blocMatches = this._schengen && visa?.bloc === 'schengen';
        if (!kindMatches && !blocMatches) return false;
      }
      // What a held document reaches: a country's own document, or any bloc
      // the country belongs to.
      if (this.byDocument.size > 0) {
        const bloc = store.visa(city, this._passport)?.bloc ?? null;
        const reached =
          this.byDocument.has(city.country_code) ||
          (bloc != null && this.byDocument.has('bloc:' + bloc));
        if (!reached) return false;
      }
      if (this._rain !== 'any') {
        const mm = store.temps(city, this._month)?.p_mm_avg;
        if (mm == null || !rainAdmits(this._rain, rainLevel(mm))) return false;
      }
      if (this._bands.size > 0) {
        const temps = store.temps(city, this._month);
        if (!temps || !this._bands.has(warmthBand(temps.t_max_avg_c))) return false;
      }
      if (this._tags.size > 0) {
        if (!city.tags.some((t) => this._tags.has(t))) return false;
      }
      // "New to me" is omitted on the web: it asks whether the trip archive
      // holds a visit to this city (PlacesVisited), and the web version has
      // no past trips to ask. Reintroduce alongside a trips store, never as
      // a guess.
      if (this._nonstopOnly && this._origin !== '' && store.hasRoutes(this._origin)) {
        if (store.route(this._origin, city) == null) return false;
      }
      return true;
    });

    return result.sort((a, b) => collator.compare(name(a), name(b)));
  }
}

function visaGroupOfIsValid(group) {
  return group === 'no_visa' || group === 'permit' || group === 'embassy';
}
