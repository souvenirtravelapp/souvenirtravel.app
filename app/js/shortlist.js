// Mirrors TravelMemory/NextTrip/Shortlist.swift: the cities kept with a
// heart, plus the month each heart was pressed in — a memory, never a
// constraint. Same toggle/keptMonth/stampMissingMonths semantics.
// Deliberate divergence: one localStorage key "sv.shortlist" holding
// {ids, months} instead of two UserDefaults keys.

const KEY = 'sv.shortlist';

export class Shortlist {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    let stored = null;
    try {
      stored = JSON.parse(storage.getItem(KEY) ?? 'null');
    } catch {
      stored = null;
    }
    this.cityIDs = new Set(stored?.ids ?? []);
    /// cityID → month (1..12). Hearts kept before months existed simply
    /// have no entry.
    this.months = { ...(stored?.months ?? {}) };
  }

  get count() {
    return this.cityIDs.size;
  }

  contains(cityID) {
    return this.cityIDs.has(cityID);
  }

  /// Press or release the heart. When pressed, the month rides with it;
  /// a null month leaves the heart monthless, as the Swift optional does.
  toggle(cityID, month = null) {
    if (this.cityIDs.has(cityID)) {
      this.cityIDs.delete(cityID);
      delete this.months[cityID];
    } else {
      this.cityIDs.add(cityID);
      if (month != null) this.months[cityID] = month;
      else delete this.months[cityID];
    }
    this.save();
  }

  keptMonth(cityID) {
    return this.months[cityID] ?? null;
  }

  /// Hearts kept before months existed get one stamped the first time the
  /// shortlist is opened — arbitrary once, stable always.
  stampMissingMonths(month) {
    let changed = false;
    for (const id of this.cityIDs) {
      if (this.months[id] == null) {
        this.months[id] = month;
        changed = true;
      }
    }
    if (changed) this.save();
  }

  /// Used by the export/restore path, which hands over a whole set at once.
  replace(ids) {
    this.cityIDs = new Set(ids);
    this.save();
  }

  save() {
    this.storage.setItem(
      KEY,
      JSON.stringify({ ids: [...this.cityIDs].sort(), months: this.months })
    );
  }
}
