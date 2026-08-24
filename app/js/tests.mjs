// Tests for the planning-brain port. Run with: node tests.mjs
// Loads the REAL data bundle straight from the iOS repo's JSON files.

import fs from 'node:fs';
import path from 'node:path';

// ---- localStorage shim, before anything constructs ----
class MemStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}
globalThis.localStorage = new MemStorage();

const { fold, skeleton, matches, matchesLoosely, nameKey } = await import('./searchtext.js');
const {
  TravelDataStore,
  warmthBand,
  rainLevel,
  visaGroupOf,
  FREE_REQUIREMENTS,
  homeFirst,
} = await import('./store.js');
const { TravelPreferences } = await import('./prefs.js');
const { Shortlist } = await import('./shortlist.js');
const { TravelDocuments, documentId, hasExpired } = await import('./papers.js');
const { NextTripFilter, rainAdmits, nextRainWanted } = await import('./filter.js');
const ideas = await import('./ideas.js');

// ---- tiny harness ----
let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.error('FAIL: ' + label);
  }
}
function assertEq(actual, expected, label) {
  assert(
    actual === expected,
    `${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

// ---- load the real bundle ----
const DATA_DIR = '/Users/tariqalmalki/Projects/souvenir/TravelMemory/NextTrip';
const readJSON = (name) =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));

const citiesFile = readJSON('TravelData-cities.json');
const climateFile = readJSON('TravelData-climate.json');
const originsFile = readJSON('TravelData-origins.json');
const airportsFile = readJSON('TravelData-airports.json');

const visas = {};
const routes = [];
for (const file of fs.readdirSync(DATA_DIR)) {
  if (file.startsWith('TravelData-visas_') && file.endsWith('.json')) {
    const passport = file.slice('TravelData-visas_'.length, -'.json'.length).toUpperCase();
    if (passport.length === 2) visas[passport] = readJSON(file).records;
  }
  if (file.startsWith('TravelData-routes_') && file.endsWith('.json')) {
    routes.push(...readJSON(file).records);
  }
}

const store = new TravelDataStore({
  cities: citiesFile.records,
  climate: climateFile.records,
  visas,
  routes,
  origins: originsFile.records,
  airports: airportsFile.records,
  cityAirports: airportsFile.city_airports,
});

console.log(
  `Bundle: ${store.cities.length} cities, ${Object.keys(store.visas).length} passports, ` +
    `${Object.keys(store.routes).length} route origins, ${store.origins.length} origins`
);

// ---- SearchText ----
assertEq(fold('الطائف'), fold('الطايف'), 'fold: الطائف meets الطايف');
assertEq(fold('مِصر'), 'مصر', 'fold: harakat drop');
assertEq(fold('ألمانيا'), fold('المانيا'), 'fold: hamza-on-alef meets bare alef');
assertEq(fold('Zürich'), 'zurich', 'fold: Latin accents drop');
assertEq(fold('الطائف').startsWith('ال'), false, 'fold: leading ال dropped');
assertEq(fold('اليابان'), 'يابان', 'fold: ال dropped from country name');

assertEq(skeleton('صبنجة'), skeleton('سبانجا'), 'skeleton: صبنجة meets سبانجا');
assertEq(skeleton('صبنجة'), 'سبنج', 'skeleton: emphatics and long vowels collapse');
assert(
  matchesLoosely('سايغ', ['سيجيريا']),
  'matchesLoosely: 2-char skeleton key matches from the start of a name'
);
assert(
  !matchesLoosely('سايغ', ['ماسيج']),
  'matchesLoosely: 2-char key does NOT match mid-name'
);
assert(!matchesLoosely('و', ['سيجيريا']), 'matchesLoosely: key under 2 chars refuses');

const tokyo = store.cities.find((c) => c.name_en === 'Tokyo');
assert(tokyo != null, 'data: Tokyo record exists');
if (tokyo) {
  const tokyoNames = [
    tokyo.name_ar,
    tokyo.name_en,
    tokyo.country_name_ar,
    tokyo.country_name_en,
    ...(tokyo.aliases_ar ?? []),
  ];
  assert(matches('طوكيو', tokyoNames), 'matches: طوكيو finds the Tokyo record');
  assert(matches('اليابان', tokyoNames), 'matches: country name answers too');
  assert(!matches('باريس', tokyoNames), 'matches: unrelated query refuses');
}
assertEq(nameKey('Sofia (Vitosha)'), fold('Sofia'), 'nameKey strips parenthetical');
assertEq(nameKey('Denizli (Pamukkale)'), nameKey('Denizli'), 'nameKey: both spellings meet');
assertEq(nameKey('موشي (كليمنجارو)'), fold('موشي'), 'nameKey: Arabic parenthetical strips');

// ---- Warmth band edges (rounded FIRST, so .9 promotes) ----
assertEq(warmthBand(14.4), 'cold', 'band: 14.4 → cold');
assertEq(warmthBand(14.9), 'mild', 'band: 14.9 rounds to 15 → mild');
assertEq(warmthBand(15), 'mild', 'band: 15 → mild');
assertEq(warmthBand(28.4), 'mild', 'band: 28.4 → mild');
assertEq(warmthBand(28.9), 'warm', 'band: 28.9 rounds to 29 → warm');
assertEq(warmthBand(29), 'warm', 'band: 29 → warm');
assertEq(warmthBand(33.4), 'warm', 'band: 33.4 → warm');
assertEq(warmthBand(33.9), 'hot', 'band: 33.9 rounds to 34 → hot');
assertEq(warmthBand(34), 'hot', 'band: 34 → hot');
assertEq(warmthBand(32.5), 'warm', 'band: 32.5 rounds to 33 → warm');
assertEq(warmthBand(33.5), 'hot', 'band: 33.5 rounds half away from zero to 34 → hot');

// ---- Rain level edges (no rounding) ----
assertEq(rainLevel(9.9), 'none', 'rain: 9.9 → none');
assertEq(rainLevel(10), 'light', 'rain: 10 → light');
assertEq(rainLevel(49.9), 'light', 'rain: 49.9 → light');
assertEq(rainLevel(50), 'moderate', 'rain: 50 → moderate');
assertEq(rainLevel(119.9), 'moderate', 'rain: 119.9 → moderate');
assertEq(rainLevel(120), 'heavy', 'rain: 120 → heavy');

// ---- Visa vocabulary ----
assertEq(visaGroupOf('visa_free'), 'no_visa', 'group: visa_free → no_visa');
assertEq(visaGroupOf('freedom_of_movement'), 'no_visa', 'group: freedom_of_movement → no_visa');
assertEq(visaGroupOf('evisa'), 'permit', 'group: evisa → permit');
assertEq(visaGroupOf('eta'), 'permit', 'group: eta → permit');
assertEq(visaGroupOf('visa_on_arrival'), 'permit', 'group: visa_on_arrival → permit');
assertEq(visaGroupOf('visa_waiver'), 'permit', 'group: visa_waiver → permit');
assertEq(visaGroupOf('embassy_visa'), 'embassy', 'group: embassy_visa → embassy');
assertEq(visaGroupOf('restricted'), null, 'group: restricted is not an offer');
assertEq(visaGroupOf('unclear'), null, 'group: unclear is not an offer');
assert(
  FREE_REQUIREMENTS.length === 3 &&
    ['visa_free', 'freedom_of_movement', 'visa_waiver'].every((r) =>
      FREE_REQUIREMENTS.includes(r)
    ),
  'free set: exactly visa_free, freedom_of_movement, visa_waiver'
);

// ---- SA-first ordering ----
assertEq(store.passports()[0], 'SA', 'passports: SA leads');
const restPassports = store.passports().slice(1);
assert(
  restPassports.every((c, i) => i === 0 || restPassports[i - 1] <= c),
  'passports: rest stay alphabetical'
);
assertEq(store.originCountries()[0], 'SA', 'origin countries: SA leads');
assertEq(homeFirst(['AE', 'BH', 'SA']).join(','), 'SA,AE,BH', 'homeFirst reorders');
assertEq(homeFirst(['AE', 'BH']).join(','), 'AE,BH', 'homeFirst leaves SA-less lists alone');

// ---- Store lookups ----
if (tokyo) {
  const t = store.temps(tokyo, 1);
  assert(t != null && t.month === 1, 'temps: Tokyo January exists');
  const visaSA = store.visa(tokyo, 'SA');
  assert(visaSA != null, 'visa: SA → Japan row exists');
  assertEq(store.visa(tokyo, null), null, 'visa: null passport answers null, never borrows');
}
assert(store.hasRoutes('RUH'), 'routes: RUH was gathered');
assert(!store.hasRoutes('ZZZ'), 'routes: unknown airport is silent');

// ---- Preferences: departures + score ----
{
  const stg = new MemStorage();
  const prefs = new TravelPreferences(stg);
  assert(prefs.isEmpty, 'prefs: starts empty');
  assertEq(prefs.departures('JED').join(','), 'JED', 'departures: fallback used when nothing stated');
  assertEq(prefs.departures('').length, 0, 'departures: empty fallback means none');
  prefs.addAirport('RUH');
  prefs.addAirport('DMM');
  assertEq(prefs.departures('JED').join(','), 'DMM,RUH', 'departures: stated airports, sorted, beat fallback');
  const reloaded = new TravelPreferences(stg);
  assertEq(reloaded.airports.size, 2, 'prefs: airports persist through sv.prefs');

  // Synthetic city/climate to pin the exact weights.
  const synthStore = new TravelDataStore({
    cities: [
      {
        id: 'x1',
        name_en: 'X',
        name_ar: 'س',
        country_code: 'XX',
        country_name_en: 'Xland',
        country_name_ar: 'س',
        lat: 0,
        lon: 0,
        tags: ['sea', 'history'],
      },
    ],
    climate: [
      {
        city_id: 'x1',
        months: [{ month: 5, t_max_avg_c: 27.0, t_min_avg_c: 18.0, p_mm_avg: 60.0 }],
      },
    ],
    visas: { SA: [] },
    routes: [],
    origins: [],
    airports: [],
    cityAirports: [],
  });
  const city = synthStore.cities[0];
  const p2 = new TravelPreferences(new MemStorage());
  assertEq(p2.score(city, 5, synthStore), null, 'score: null while nothing stated');
  p2.tags = new Set(['sea', 'history', 'nature']);
  p2.bands = new Set(['mild']);
  p2.rain = new Set(['moderate']);
  p2.save();
  // two tags ×2 = 4, band mild (27 → mild) +3, rain 60mm (moderate) +2 = 9
  assertEq(p2.score(city, 5, synthStore), 9, 'score: tags ×2 + band 3 + rain 2');
  p2.rain = new Set(['light']);
  assertEq(p2.score(city, 5, synthStore), 7, 'score: rain level must match to count');
  assertEq(p2.score(city, 12, synthStore), 4, 'score: no climate row, only tags count');
}

// ---- Shortlist ----
{
  const stg = new MemStorage();
  const list = new Shortlist(stg);
  list.toggle('city-1', 9);
  assert(list.contains('city-1'), 'shortlist: toggled on');
  assertEq(list.keptMonth('city-1'), 9, 'shortlist: month rides with the heart');
  list.toggle('city-2'); // monthless heart
  assertEq(list.keptMonth('city-2'), null, 'shortlist: monthless heart has no month');
  list.stampMissingMonths(4);
  assertEq(list.keptMonth('city-2'), 4, 'shortlist: missing months stamped');
  assertEq(list.keptMonth('city-1'), 9, 'shortlist: stamped hearts keep their own month');
  const reloaded = new Shortlist(stg);
  assertEq(reloaded.count, 2, 'shortlist: persists through sv.shortlist');
  assertEq(reloaded.keptMonth('city-2'), 4, 'shortlist: months persist');
  reloaded.toggle('city-1');
  assert(!reloaded.contains('city-1'), 'shortlist: toggled off');
  assertEq(reloaded.keptMonth('city-1'), null, 'shortlist: month goes with the heart');
}

// ---- Papers ----
{
  const stg = new MemStorage();
  const papers = new TravelDocuments(stg);
  assert(papers.isEmpty, 'papers: starts empty');
  papers.save({ kind: 'visa', countryCode: 'US', expiry: '2027-01-01' });
  papers.save({ kind: 'visa', countryCode: '', bloc: 'schengen', expiry: null });
  papers.save({ kind: 'residency', countryCode: 'US', expiry: null });
  assertEq(papers.documents.length, 3, 'papers: three saved');
  assertEq(documentId(papers.documents[1]), 'schengen-visa', 'papers: bloc identity');

  assertEq(papers.documentsFor('US').length, 2, 'papers: country match, both kinds');
  assertEq(papers.documentsFor('FR').length, 0, 'papers: no bloc offered → bloc doc silent');
  assertEq(
    papers.documentsFor('FR', new Set(['schengen'])).length,
    1,
    'papers: bloc doc admits via the destination blocs'
  );
  assertEq(
    papers.best('US').kind,
    'residency',
    'papers: residency outranks visa for the same country'
  );
  assertEq(
    papers.best('FR', new Set(['schengen'])).bloc,
    'schengen',
    'papers: bloc doc is best when it is all there is'
  );
  assert(
    !hasExpired({ kind: 'visa', countryCode: 'US', expiry: null }),
    'papers: unknown expiry is not expired'
  );
  assert(
    hasExpired({ kind: 'visa', countryCode: 'US', expiry: '2020-01-01' }, new Date('2026-08-24')),
    'papers: past expiry is expired'
  );
  // upsert: same (place, kind) replaces
  papers.save({ kind: 'visa', countryCode: 'US', expiry: '2030-01-01' });
  assertEq(papers.documents.length, 3, 'papers: upsert replaces, never duplicates');
  const reloaded = new TravelDocuments(stg);
  assertEq(reloaded.documents.length, 3, 'papers: persists through sv.papers');
}

// ---- Filter ----
{
  const stg = new MemStorage();
  const filter = new NextTripFilter(store, { storage: stg, lang: 'ar' });
  assert(filter.month >= 1 && filter.month <= 12, 'filter: month in range');
  assertEq(filter.passport, null, 'filter: passport starts unset, never guessed');
  assert(filter.barExpanded, 'filter: bar open on first visit');
  assertEq(filter.rain, 'any', 'filter: rain starts off');

  const all = filter.matches();
  assertEq(all.length, store.cities.length, 'filter: no chips → every city');
  // Sorted by Arabic name
  const collator = new Intl.Collator('ar', { numeric: true });
  assert(
    all.every((c, i) => i === 0 || collator.compare(all[i - 1].name_ar, c.name_ar) <= 0),
    'filter: results sorted by reading-language name'
  );

  // Query: exact first, loose appended
  filter.query = 'طوكيو';
  const hits = filter.matches();
  assert(hits.length >= 1 && hits[0].name_en === 'Tokyo', 'filter: طوكيو puts Tokyo first');
  const ids = hits.map((c) => c.id);
  assertEq(new Set(ids).size, ids.length, 'filter: exact+loose merge never duplicates');
  filter.query = '';

  // Visa chips do nothing while the passport is unknown
  filter.visaGroups = new Set(['no_visa']);
  assertEq(
    filter.matches().length,
    store.cities.length,
    'filter: visa chips inert without a passport'
  );
  filter.passport = 'SA';
  const noVisa = filter.matches();
  assert(noVisa.length > 0 && noVisa.length < store.cities.length, 'filter: no_visa narrows');
  assert(
    noVisa.every((c) => {
      const v = store.visa(c, 'SA');
      return v && visaGroupOf(v.requirement) === 'no_visa';
    }),
    'filter: every no_visa hit really is one'
  );
  // Schengen widens the same row rather than narrowing it
  filter.schengen = true;
  const widened = filter.matches();
  assert(widened.length >= noVisa.length, 'filter: Schengen widens the visa row');
  assert(
    widened.every((c) => {
      const v = store.visa(c, 'SA');
      const kind = v && visaGroupOf(v.requirement) === 'no_visa';
      const bloc = v && v.bloc === 'schengen';
      return kind || bloc;
    }),
    'filter: widened set is the union, not the intersection'
  );
  filter.visaGroups = new Set();
  filter.schengen = false;

  // Bands
  filter.bands = new Set(['cold']);
  const cold = filter.matches();
  assert(
    cold.every((c) => warmthBand(store.temps(c, filter.month).t_max_avg_c) === 'cold'),
    'filter: band chip holds'
  );
  filter.bands = new Set();

  // Rain ladder
  filter.rain = 'heavy';
  const wet = filter.matches();
  assert(
    wet.every((c) => {
      const mm = store.temps(c, filter.month)?.p_mm_avg;
      return mm != null && rainLevel(mm) === 'heavy';
    }),
    'filter: heavy rung admits only heavy'
  );
  assertEq(nextRainWanted('any'), 'some', 'rain chip cycles up');
  assertEq(nextRainWanted('heavy'), 'any', 'rain chip wraps to off');
  assert(rainAdmits('some', 'light'), 'rain ladder: some admits light');
  assert(!rainAdmits('moderate', 'light'), 'rain ladder: moderate refuses light');
  filter.rain = 'any';

  // Nonstop
  filter.origin = 'RUH';
  filter.nonstopOnly = true;
  const nonstop = filter.matches();
  assert(
    nonstop.every((c) => store.route('RUH', c) != null),
    'filter: nonstop keeps only routed cities'
  );
  assert(nonstop.length < store.cities.length, 'filter: nonstop actually narrows');

  // byDocument
  filter.reset();
  filter.byDocument = new Set(['bloc:schengen']);
  const byDoc = filter.matches();
  assert(
    byDoc.length > 0 &&
      byDoc.every((c) => store.visa(c, filter.passport)?.bloc === 'schengen'),
    'filter: bloc document reaches all its members'
  );
  filter.byDocument = new Set();

  // Persistence: reload from the same storage
  filter.month = 12;
  filter.bands = new Set(['mild']);
  const reloaded = new NextTripFilter(store, { storage: stg, lang: 'ar' });
  assertEq(reloaded.month, 12, 'filter: month persists through sv.filter');
  assert(reloaded.bands.has('mild'), 'filter: bands persist');
  assertEq(reloaded.passport, 'SA', 'filter: passport persists when a file ships for it');
  assertEq(reloaded.tags.size, 0, 'filter: stored tags never load (row is hidden)');

  // nonstop cannot outlive its airport
  filter.origin = '';
  filter.nonstopOnly = true;
  const reloaded2 = new NextTripFilter(store, { storage: stg });
  assert(!reloaded2.nonstopOnly, 'filter: nonstop off when the origin was cleared');

  // A stored passport with no shipped file does not survive
  const stg2 = new MemStorage();
  stg2.setItem('sv.filter', JSON.stringify({ passport: 'GB', month: 5 }));
  const f2 = new NextTripFilter(store, { storage: stg2 });
  assertEq(f2.passport, null, 'filter: unshipped passport does not survive a reload');
}

// ---- Ideas: months ----
{
  const aug = new Date('2026-08-24T12:00:00');
  assertEq(ideas.nextThreeMonths(aug).join(','), '9,10,11', 'months: start next month');
  const nov = new Date('2026-11-15T12:00:00');
  assertEq(ideas.nextThreeMonths(nov).join(','), '12,1,2', 'months: wrap over the year end');
}

// ---- Ideas: rotation once per load ----
{
  const stg = new MemStorage();
  ideas._resetLoadFlagForTests();
  assertEq(ideas.currentRotation(stg), 0, 'rotation: starts at 0');
  ideas.advanceRotationOncePerLoad(stg);
  assertEq(ideas.currentRotation(stg), 3, 'rotation: steps by 3');
  ideas.advanceRotationOncePerLoad(stg);
  assertEq(ideas.currentRotation(stg), 3, 'rotation: only once per load');
  ideas._resetLoadFlagForTests();
  ideas.advanceRotationOncePerLoad(stg);
  assertEq(ideas.currentRotation(stg), 6, 'rotation: next load steps again');
}

// ---- Ideas: reachable ----
{
  const stg = new MemStorage();
  const filter = new NextTripFilter(store, { storage: stg });
  const prefs = new TravelPreferences(stg);
  const papers = new TravelDocuments(stg);
  const ctx = { store, filter, prefs, papers };

  filter.origin = 'RUH';
  const routedIds = new Set(Object.keys(store.routes['RUH'] ?? {}));
  const routedCity = store.cities.find((c) => routedIds.has(c.id));
  const unroutedCity = store.cities.find((c) => !routedIds.has(c.id));
  assert(routedCity && unroutedCity, 'data: RUH has routed and unrouted cities');
  assert(
    !ideas.reachable(unroutedCity, ctx),
    'reachable: no route from a stated airport (with route data) excludes'
  );
  assert(ideas.reachable(routedCity, ctx), 'reachable: a routed city passes (no passport set)');

  // Silence fails open: an origin with no gathered routes filters nothing.
  filter.origin = 'ZZZ';
  assert(
    ideas.reachable(unroutedCity, ctx),
    'reachable: an origin the data is silent about excludes nothing'
  );

  // Stated airports beat the filter origin
  filter.origin = '';
  prefs.addAirport('RUH');
  assert(
    !ideas.reachable(unroutedCity, ctx),
    'reachable: stated airports apply the same route rule'
  );
  prefs.removeAirport('RUH');

  // Visa side: restricted closes, free opens, held paper opens
  filter.passport = 'SA';
  const saRows = store.visas['SA'];
  const freeCity = store.cities.find((c) =>
    FREE_REQUIREMENTS.includes(saRows[c.country_code]?.requirement)
  );
  const embassyCity = store.cities.find(
    (c) => saRows[c.country_code]?.requirement === 'embassy_visa'
  );
  assert(freeCity && embassyCity, 'data: free and embassy destinations exist for SA');
  assert(ideas.reachable(freeCity, ctx), 'reachable: free requirement opens the border');
  assert(!ideas.reachable(embassyCity, ctx), 'reachable: embassy visa not held closes it');
  papers.save({ kind: 'visa', countryCode: embassyCity.country_code, expiry: null });
  assert(ideas.reachable(embassyCity, ctx), 'reachable: the held paper opens it');
  papers.remove({ kind: 'visa', countryCode: embassyCity.country_code });

  // A bloc paper opens every member
  const schengenCity = store.cities.find(
    (c) =>
      saRows[c.country_code]?.bloc === 'schengen' &&
      !FREE_REQUIREMENTS.includes(saRows[c.country_code]?.requirement)
  );
  if (schengenCity) {
    assert(!ideas.reachable(schengenCity, ctx), 'reachable: Schengen member closed unheld');
    papers.save({ kind: 'visa', countryCode: '', bloc: 'schengen', expiry: null });
    assert(ideas.reachable(schengenCity, ctx), 'reachable: one Schengen paper opens members');
    papers.remove({ kind: 'visa', countryCode: '', bloc: 'schengen' });
  }
}

// ---- Ideas: plan ----
{
  const stg = new MemStorage();
  const filter = new NextTripFilter(store, { storage: stg });
  const prefs = new TravelPreferences(stg);
  const papers = new TravelDocuments(stg);
  const shortlist = new Shortlist(stg);
  const now = new Date('2026-08-24T12:00:00');

  ideas._resetLoadFlagForTests();
  const months = ideas.nextThreeMonths(now);
  const p = ideas.plan({ store, filter, prefs, shortlist, papers, now, storage: stg });

  assertEq(Object.keys(p).length, 3, 'plan: three months');
  assertEq(months.join(','), '9,10,11', 'plan: September, October, November from an August now');
  assert(
    months.every((m) => Array.isArray(p[m])),
    'plan: every month answered'
  );
  const allPicked = months.flatMap((m) => p[m].map((x) => x.city.id));
  assertEq(new Set(allPicked).size, allPicked.length, 'plan: no city repeats across months');
  assert(
    months.every((m) => p[m].length <= 3),
    'plan: at most three per month'
  );
  assert(
    months.every((m) =>
      p[m].every((pick) => {
        const t = store.temps(pick.city, m);
        return t && warmthBand(t.t_max_avg_c) !== 'hot';
      })
    ),
    'plan: never hot without a heart'
  );

  // Hearts: a HOT city kept for September must appear there anyway (rule 2
  // overrides rule 6), and be exempt from the hot rule.
  const hotInSept = store.cities.find((c) => {
    const t = store.temps(c, 9);
    return t && warmthBand(t.t_max_avg_c) === 'hot';
  });
  assert(hotInSept != null, 'data: a hot September city exists');
  if (hotInSept) {
    const withoutHeart = ideas.plan({ store, filter, prefs, shortlist, papers, now, storage: stg });
    assert(
      !withoutHeart[9].some((x) => x.city.id === hotInSept.id),
      'plan: the hot city stays out while unhearted'
    );
    shortlist.toggle(hotInSept.id, 9);
    const withHeart = ideas.plan({ store, filter, prefs, shortlist, papers, now, storage: stg });
    const pick = withHeart[9].find((x) => x.city.id === hotInSept.id);
    assert(pick != null, 'plan: the hearted hot city appears in its kept month');
    assertEq(pick?.reason, 'kept_for_month', 'plan: heart pick carries its reason');
    assert(
      !withHeart[10].some((x) => x.city.id === hotInSept.id) &&
        !withHeart[11].some((x) => x.city.id === hotInSept.id),
      'plan: the hearted city appears once, in its own month'
    );
    shortlist.toggle(hotInSept.id);
  }

  // A heart kept for October never leaks into September's row. The candidate
  // must not already sit in the unhearted plan: rule 1 (no repeats) beats
  // rule 2 for later months — a city September's pool already took is `used`
  // before October's hearts run, in Swift and here alike.
  const baseline = ideas.plan({ store, filter, prefs, shortlist, papers, now, storage: stg });
  const takenIds = new Set(months.flatMap((m) => baseline[m].map((x) => x.city.id)));
  const mildSomewhere = store.cities.find((c) => {
    const t = store.temps(c, 10);
    return t && warmthBand(t.t_max_avg_c) !== 'hot' && !takenIds.has(c.id);
  });
  if (mildSomewhere) {
    shortlist.toggle(mildSomewhere.id, 10);
    const p2 = ideas.plan({ store, filter, prefs, shortlist, papers, now, storage: stg });
    assert(
      p2[10].some((x) => x.city.id === mildSomewhere.id && x.reason === 'kept_for_month'),
      'plan: heart answers its own month'
    );
    shortlist.toggle(mildSomewhere.id);
  }

  // reachable applies inside plan: with RUH stated, every pick has a route.
  filter.origin = 'RUH';
  const p3 = ideas.plan({ store, filter, prefs, shortlist, papers, now, storage: stg });
  assert(
    months.every((m) => p3[m].every((x) => store.route('RUH', x.city) != null)),
    'plan: every pick reachable nonstop from the stated origin'
  );

  // Stated preferences outrank (stable): a cold-lover's September picks all
  // score at least as high as any other candidate in the pool.
  prefs.bands = new Set(['cold']);
  prefs.save();
  const p4 = ideas.plan({ store, filter, prefs, shortlist, papers, now, storage: stg });
  const septPicks = p4[9];
  if (septPicks.length === 3) {
    const worstPicked = Math.min(...septPicks.map((x) => prefs.score(x.city, 9, store) ?? 0));
    const pool = store.cities.filter((c) => {
      const t = store.temps(c, 9);
      return (
        t &&
        warmthBand(t.t_max_avg_c) !== 'hot' &&
        store.route('RUH', c) != null &&
        !septPicks.some((x) => x.city.id === c.id)
      );
    });
    assert(
      pool.every((c) => (prefs.score(c, 9, store) ?? 0) <= worstPicked),
      'plan: no unpicked candidate outscores a picked one'
    );
  }
}

// ---- done ----
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
