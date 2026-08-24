// Mirrors TravelMemory/Features/TripIdeas.swift — the plan() behind
// "Suggested destinations": three months starting NEXT month, planned
// TOGETHER, under Tariq's six rules:
//   1. No destination appears in more than one month.
//   2. Hearts first — a heart kept WITH the row's month IS the answer.
//   3. His own filtering habits: the weather he searches for is the weather
//      he is offered.
//   4. A nonstop from his own airport(s), or it is not a trip he can take
//      (failing OPEN where the route data is silent about an origin).
//   5. A border his passport opens, or a visa he already holds.
//   6. Never hot — unless rule 2 put it there, which overrides on purpose.
// Rotation ("sv.ideas.rotation") advances by 3 once per page load, mirroring
// the app's once-per-launch @AppStorage step.
//
// Deliberate divergences:
//  - No past trips on the web, so the TasteProfile signal REDUCES to nothing:
//    every taste input (tag counts, revealed warmth bands, repeat countries,
//    declared place likes, visited-city demotion) comes from the trip
//    archive, and with zero trips the profile never reaches its 3-trip
//    readiness bar — ranked() is then the identity over catalogue order with
//    no reason sentences. That identity is what plan() uses here; nothing is
//    invented to substitute. Stated preferences (prefs.score) still reorder
//    the pool, exactly as in the app.
//  - Faithful to the CODE, not the intent note: the Swift view advances and
//    stores the rotation but plan() never consumes it as an offset into the
//    ranking — the counter is kept and stepped here the same way, and the
//    picks are the top of the ordering, same as the app today.

import { FREE_REQUIREMENTS, warmthBand } from './store.js';

const ROTATION_KEY = 'sv.ideas.rotation';

/// Advanced once per page load, not once per plan() — the app's flag makes
/// "every entry" mean every launch, not every glance back at Home.
let advancedThisLoad = false;

export function currentRotation(storage = globalThis.localStorage) {
  const n = parseInt(storage.getItem(ROTATION_KEY) ?? '0', 10);
  return Number.isFinite(n) ? n : 0;
}

export function advanceRotationOncePerLoad(storage = globalThis.localStorage) {
  if (advancedThisLoad) return currentRotation(storage);
  advancedThisLoad = true;
  const next = currentRotation(storage) + 3;
  storage.setItem(ROTATION_KEY, String(next));
  return next;
}

/// Tests only — a page load happens once, but a test file loads many plans.
export function _resetLoadFlagForTests() {
  advancedThisLoad = false;
}

/// The three months, starting next month — the nearer month anchors the
/// other two rather than being the useful one itself. Gregorian by name.
export function nextThreeMonths(now = new Date()) {
  const current = now.getMonth() + 1; // 1..12
  return [1, 2, 3].map((i) => ((current + i - 1) % 12) + 1);
}

/// Rules 4 and 5: a nonstop from his airport, and a border he can cross.
/// Both fail OPEN when the data is silent: an origin we gathered no routes
/// for means the file says nothing, not that nothing flies; an unstated
/// passport (or a destination with no visa row) filters nothing.
export function reachable(city, { store, filter, prefs, papers }) {
  // Any of the stated airports will do — a person who would fly from Dammam
  // or Bahrain has two sets of nonstops, not one.
  const from = prefs
    .departures(filter.origin)
    .filter((iata) => store.hasRoutes(iata));
  if (from.length > 0 && !from.some((iata) => store.route(iata, city) != null)) {
    return false;
  }

  const passport = filter.passport;
  if (passport == null) return true;
  const visa = store.visa(city, passport);
  if (visa == null) return true;
  if (visa.requirement === 'restricted') return false;
  // Open without asking, or open because he holds the paper for it.
  const free = FREE_REQUIREMENTS.includes(visa.requirement);
  const blocs = visa.bloc ? new Set([visa.bloc]) : new Set();
  const held = papers.documentsFor(city.country_code, blocs).length > 0;
  return free || held;
}

/// Rules 3 and 6: the weather he searches for, and never the weather nobody
/// asked for. No climate row at all means no suggestion — a card that cannot
/// state its weather cannot earn its place.
export function wanted(city, month, { store, filter }) {
  const t = store.temps(city, month);
  if (!t) return false;
  const band = warmthBand(t.t_max_avg_c);
  if (filter.bands.size > 0) return filter.bands.has(band);
  return band !== 'hot';
}

/// Every month's three, chosen together so no destination appears twice.
/// Returns { month: [{city, reason}] } where reason is 'kept_for_month' for
/// rule-2 picks and null otherwise (the taste sentences need past trips,
/// which the web does not have — see the header comment).
export function plan({
  store,
  filter,
  prefs,
  shortlist,
  papers,
  now = new Date(),
  storage = globalThis.localStorage,
}) {
  advanceRotationOncePerLoad(storage);

  const months = nextThreeMonths(now);
  const used = new Set();
  const out = {};
  const context = { store, filter, prefs, papers };

  for (const month of months) {
    const picks = [];

    // Rule 2 — the hearts kept for THIS month, walked in catalogue order
    // (as the Swift loop over store.cities does). Rule 6 does not apply.
    for (const city of store.cities) {
      if (picks.length >= 3) break;
      if (used.has(city.id)) continue;
      if (shortlist.keptMonth(city.id) !== month) continue;
      if (!reachable(city, context)) continue;
      used.add(city.id);
      picks.push({ city, reason: 'kept_for_month' });
    }

    // Rules 3–6 — everything else, filtered by what he can actually reach
    // and would actually enjoy.
    if (picks.length < 3) {
      const pool = store.cities.filter(
        (city) =>
          !used.has(city.id) &&
          reachable(city, context) &&
          wanted(city, month, { store, filter })
      );
      // Taste ranking: with no trips the profile is not ready, so the
      // ranked order is the pool's own (catalogue) order, reasons null.
      const ranked = pool.map((city) => ({ city, reason: null }));
      // Stated preferences outrank the inferred taste — a stable sort by
      // preference score leaves the underlying order intact inside each
      // score, exactly the Swift enumerated tie-break.
      const ordered = prefs.isEmpty
        ? ranked
        : ranked
            .map((element, offset) => ({ element, offset }))
            .sort((a, b) => {
              const sa = prefs.score(a.element.city, month, store) ?? 0;
              const sb = prefs.score(b.element.city, month, store) ?? 0;
              return sa === sb ? a.offset - b.offset : sb - sa;
            })
            .map((p) => p.element);
      for (const pick of ordered) {
        if (picks.length >= 3) break;
        used.add(pick.city.id);
        picks.push(pick);
      }
    }
    out[month] = picks;
  }
  return out;
}
