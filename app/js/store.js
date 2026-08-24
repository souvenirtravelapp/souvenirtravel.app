// Mirrors TravelMemory/NextTrip/TravelDataStore.swift: the same indexing the
// Swift loader builds from the bundle files, the same band and rain-level
// boundaries, the same visa vocabulary, and the same SA-first orderings.
// Deliberate divergence: the constructor takes plain objects (the parsed
// TravelData-*.json contents) instead of reading an app bundle — the web
// fetches the same files and hands their records in.

/// The one country that leads every list of countries in this app.
export const HOME_COUNTRY = 'SA';

/// Requirements that mean the border is open without holding a paper —
/// the exact set TripIdeas and the entry line use.
export const FREE_REQUIREMENTS = ['visa_free', 'freedom_of_movement', 'visa_waiver'];

/// Saudi first, then the rest in the order given (callers pass a sorted or
/// data-ordered list, as the Swift call sites do).
export function homeFirst(codes) {
  return codes.includes(HOME_COUNTRY)
    ? [HOME_COUNTRY, ...codes.filter((c) => c !== HOME_COUNTRY)]
    : codes;
}

// Swift's Double.rounded() rounds half AWAY FROM ZERO; JS Math.round rounds
// half toward +Infinity. Only differs on negative halves, but faithful is
// faithful.
function roundedHalfAwayFromZero(x) {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

/// Warmth in the chosen month, banded the way a traveller thinks about it.
/// Judged by the month's average daytime high — ROUNDED FIRST, so the band
/// always agrees with the number printed on the card (32.5 shows as 33° and
/// must therefore be hot). Tariq's bounds: mild reaches 28, warm is 29 to 33,
/// hot begins at 34.
export function warmthBand(tMax) {
  const r = roundedHalfAwayFromZero(tMax);
  if (r < 15) return 'cold';
  if (r < 29) return 'mild';
  if (r < 34) return 'warm';
  return 'hot';
}

export const WARMTH_BANDS = ['cold', 'mild', 'warm', 'hot'];

/// Monthly rainfall told the way a person packs. Under 10 mm a month is
/// functionally dry; 120 mm and up is umbrella weather most days.
/// No rounding — the Swift initializer switches on the raw millimetres.
export function rainLevel(monthlyMM) {
  if (monthlyMM < 10) return 'none';
  if (monthlyMM < 50) return 'light';
  if (monthlyMM < 120) return 'moderate';
  return 'heavy';
}

export const RAIN_LEVELS = ['none', 'light', 'moderate', 'heavy'];

/// The visa question as three answers. `unclear` and `restricted` stay
/// unfilterable (null): an answer we do not have and a door that is closed
/// are not ways to travel somewhere.
export function visaGroupOf(requirement) {
  switch (requirement) {
    case 'visa_free':
    case 'freedom_of_movement':
      return 'no_visa';
    case 'evisa':
    case 'eta':
    case 'visa_on_arrival':
    case 'visa_waiver':
      return 'permit';
    case 'embassy_visa':
      return 'embassy';
    default:
      return null;
  }
}

export const VISA_GROUPS = ['no_visa', 'permit', 'embassy'];

export class TravelDataStore {
  /// Plain objects in, the Swift loader's indexes out:
  ///  - cities:       array of city records (TravelData-cities.json records)
  ///  - climate:      array of climate records (one per city)
  ///  - visas:        { passportISO2: array of visa records } — one entry per
  ///                  TravelData-visas_xx.json file
  ///  - routes:       flat array of route rows (all routes_* files merged; a
  ///                  route is keyed by its origin airport, so files merge
  ///                  with nothing to reconcile)
  ///  - origins:      array of origin records, in data order
  ///  - airports:     array of airport records
  ///  - cityAirports: array of city ↔ airport links (city_airports table)
  constructor({ cities, climate, visas, routes, origins, airports, cityAirports } = {}) {
    this.cities = cities ?? [];
    this.origins = origins ?? [];

    // Keyed by city id — first record wins, as Swift's uniquingKeysWith does.
    this.climate = {};
    for (const c of climate ?? []) {
      if (!(c.city_id in this.climate)) this.climate[c.city_id] = c;
    }

    // Keyed by passport, then by destination country ISO2. Rows without a
    // destination_country are dropped, first record wins.
    this.visas = {};
    for (const [passport, rows] of Object.entries(visas ?? {})) {
      const byCountry = {};
      for (const v of rows) {
        if (v.destination_country == null) continue;
        if (!(v.destination_country in byCountry)) byCountry[v.destination_country] = v;
      }
      this.visas[passport.toUpperCase()] = byCountry;
    }

    // Keyed by departure airport, then city id — first record wins.
    this.routes = {};
    for (const r of routes ?? []) {
      const table = (this.routes[r.origin_iata] ??= {});
      if (!(r.city_id in table)) table[r.city_id] = r;
    }

    // Keyed by airport id — first record wins.
    this.airports = {};
    for (const a of airports ?? []) {
      if (!(a.id in this.airports)) this.airports[a.id] = a;
    }

    // Keyed by city id, in rank order.
    this.cityAirports = {};
    for (const link of cityAirports ?? []) {
      (this.cityAirports[link.city_id] ??= []).push(link);
    }
    for (const links of Object.values(this.cityAirports)) {
      links.sort((a, b) => a.rank - b.rank);
    }
  }

  #cityId(city) {
    return typeof city === 'string' ? city : city.id;
  }

  /// The month's temperatures for a city (record or id), or null.
  temps(city, month) {
    const record = this.climate[this.#cityId(city)];
    return record?.months.find((m) => m.month === month) ?? null;
  }

  /// The rule for this destination — for a stated passport, or nothing.
  /// The null-passport case returns null ON PURPOSE: an unstated passport has
  /// no visa rules, and inventing some is how the app once told a Londoner he
  /// needed what a Riyadh reader needs.
  visa(city, passport) {
    if (passport == null) return null;
    const c = typeof city === 'string' ? this.cities.find((x) => x.id === city) : city;
    if (!c) return null;
    return this.visas[passport]?.[c.country_code] ?? null;
  }

  isSchengen(city, passport) {
    return this.visa(city, passport)?.bloc === 'schengen';
  }

  /// The shared regimes a destination belongs to, for one passport — what a
  /// bloc document has to be matched against (blocsFor in the app).
  blocs(city, passport) {
    const bloc = this.visa(city, passport)?.bloc;
    return bloc ? new Set([bloc]) : new Set();
  }

  /// The nonstop link from a departure airport to a city (record or id).
  route(fromIata, city) {
    return this.routes[fromIata]?.[this.#cityId(city)] ?? null;
  }

  /// Whether any route at all was gathered for this airport. An origin with
  /// no rows means the data is SILENT about it, not that nothing flies — and
  /// a filter must not turn silence into "nowhere".
  hasRoutes(fromIata) {
    const table = this.routes[fromIata];
    return table != null && Object.keys(table).length > 0;
  }

  /// Where a traveller to this city actually lands: the top-ranked linked
  /// airport, or null for the cities honestly beyond 150 km of any.
  nearestAirport(city) {
    const link = this.cityAirports[this.#cityId(city)]?.[0];
    if (!link) return null;
    const airport = this.airports[link.airport_id];
    if (!airport) return null;
    return { airport, distanceKm: link.distance_km };
  }

  warmthBand(tMax) {
    return warmthBand(tMax);
  }

  rainLevel(monthlyMM) {
    return rainLevel(monthlyMM);
  }

  /// The passports a visas table exists for — Saudi first, then the rest
  /// alphabetically (availablePassports in the app).
  passports() {
    return homeFirst(Object.keys(this.visas).sort());
  }

  /// Countries anyone can depart from, in the order the data lists them,
  /// home country first.
  originCountries() {
    const seen = new Set();
    const listed = [];
    for (const o of this.origins) {
      if (!seen.has(o.country_code)) {
        seen.add(o.country_code);
        listed.push(o.country_code);
      }
    }
    return homeFirst(listed);
  }

  originsIn(country) {
    return this.origins.filter((o) => o.country_code === country);
  }

  origin(iata) {
    if (iata == null) return null;
    return this.origins.find((o) => o.iata === iata) ?? null;
  }

  /// What a passport's country is called — read from the data, never from a
  /// switch: every shipped passport appears as a destination in every other
  /// passport's file.
  passportCountryName(code, lang = 'ar') {
    for (const [holder, rows] of Object.entries(this.visas)) {
      if (holder === code) continue;
      const row = rows[code];
      if (row) {
        const name = lang === 'ar' ? row.destination_name_ar : row.destination_name_en;
        if (name != null) return name;
      }
    }
    return code;
  }

  /// How many countries the shared visa actually opens — counted from the
  /// data rather than written into a sentence.
  schengenCountryCount(passport) {
    if (passport == null) return 0;
    const rows = this.visas[passport];
    if (!rows) return 0;
    return Object.values(rows).filter((v) => v.bloc === 'schengen').length;
  }
}
