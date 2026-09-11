// Mirrors TravelMemory/NextTrip/TravelPreferences.swift: what somebody SAYS
// they want — tags, warmth bands, rain levels, departure airports — with the
// same departures(fallback:) rule and the same score weights (tags ×2,
// band +3, rain +2; nil when nothing is stated, so a stated preference can
// outrank the inferred taste).
// Deliberate divergence: persisted to one localStorage key "sv.prefs" instead
// of four UserDefaults keys; the stored values are the same sorted arrays.

import { warmthBand, rainLevel } from './store.js';

const KEY = 'sv.prefs';

export class TravelPreferences {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    let stored = null;
    try {
      stored = JSON.parse(storage.getItem(KEY) ?? 'null');
    } catch {
      stored = null;
    }
    /// Which kinds of place — multi-select: people are not one thing.
    this.tags = new Set(stored?.tags ?? []);
    /// Which weather is worth flying for. `hot` is not offered in the app's
    /// form — the suggestion rules refuse to propose it — but any stored
    /// value round-trips untouched, as the Swift raw-value decode does.
    this.bands = new Set(stored?.bands ?? []);
    /// How much rain is welcome — levels, not a yes-or-no.
    this.rain = new Set(stored?.rain ?? []);
    /// Which airports somebody would actually leave from — more than one.
    this.airports = new Set(stored?.airports ?? []);
  }

  /// Nothing stated yet.
  get isEmpty() {
    return (
      this.tags.size === 0 &&
      this.bands.size === 0 &&
      this.rain.size === 0 &&
      this.airports.size === 0
    );
  }

  /// The airports the suggestions should search from: what was stated, or
  /// the one the filter is set to, or nothing. Stated airports come back
  /// sorted, exactly as the Swift does.
  departures(fallback) {
    if (this.airports.size > 0) return [...this.airports].sort();
    return !fallback ? [] : [fallback];
  }

  /// How well a destination answers what was actually asked for.
  /// Null when nothing has been stated, so the caller can fall back to the
  /// inferred ranking rather than treating every place as an equal match.
  /// Weights: each matching tag ×2, warmth band +3, rain level +2.
  score(city, month, store) {
    if (this.isEmpty) return null;
    let score = 0;
    score += city.tags.filter((t) => this.tags.has(t)).length * 2;
    const t = store.temps(city, month);
    if (t) {
      if (this.bands.has(warmthBand(t.t_max_avg_c))) score += 3;
      if (t.p_mm_avg != null && this.rain.has(rainLevel(t.p_mm_avg))) score += 2;
    }
    return score;
  }

  save() {
    this.storage.setItem(
      KEY,
      JSON.stringify({
        tags: [...this.tags].sort(),
        bands: [...this.bands].sort(),
        rain: [...this.rain].sort(),
        airports: [...this.airports].sort(),
      })
    );
  }

  #toggle(set, value) {
    if (set.has(value)) set.delete(value);
    else set.add(value);
    this.save();
  }

  toggleTag(tag) {
    this.#toggle(this.tags, tag);
  }

  toggleBand(band) {
    this.#toggle(this.bands, band);
  }

  toggleRain(level) {
    this.#toggle(this.rain, level);
  }

  addAirport(iata) {
    this.airports.add(iata);
    this.save();
  }

  removeAirport(iata) {
    this.airports.delete(iata);
    this.save();
  }

  clear() {
    this.tags = new Set();
    this.bands = new Set();
    this.rain = new Set();
    this.airports = new Set();
    this.save();
  }
}
