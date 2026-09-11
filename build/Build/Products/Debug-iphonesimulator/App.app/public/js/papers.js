// Mirrors TravelMemory/NextTrip/TravelDocuments.swift: what this traveller
// already HOLDS — a visa or a residency, for a country or for a bloc — and
// the documents(for:blocs:) / best(for:blocs:) admission logic. A held paper
// never edits the passport answer; it adds a second line beneath it.
// Deliberate divergences: the web adds and edits papers manually (no camera,
// so no photograph field); entries are plain objects
// {kind, countryCode, bloc?, expiry?} persisted to localStorage "sv.papers",
// with expiry an ISO "YYYY-MM-DD" string instead of a Date.

const KEY = 'sv.papers';

export const KINDS = ['visa', 'residency'];

/// One document per (place, kind) — the Swift identity:
/// (bloc ?? countryCode) + "-" + kind.
export function documentId(doc) {
  return (doc.bloc ?? doc.countryCode) + '-' + doc.kind;
}

/// Expired against a given day — false when no date is known, since an
/// unknown expiry is not an expired one.
export function hasExpired(doc, day = new Date()) {
  if (doc.expiry == null || doc.expiry === '') return false;
  return new Date(doc.expiry) < day;
}

export class TravelDocuments {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    let stored = null;
    try {
      stored = JSON.parse(storage.getItem(KEY) ?? 'null');
    } catch {
      stored = null;
    }
    /// Array of {kind, countryCode, bloc?, expiry?}. countryCode is the ISO2
    /// of the country the document is FOR (empty when it is a bloc's);
    /// bloc is a shared visa regime by NAME ("schengen"), so the countries
    /// it opens are read from the data every time.
    this.documents = Array.isArray(stored) ? stored : [];
  }

  /// Every document that admits its holder to this country — its own, and
  /// any bloc the country belongs to. `blocs` is what the visa data says
  /// about this destination for this passport, passed in rather than looked
  /// up, so this module never needs to know the store exists.
  /// Note: expiry is NOT checked here — the Swift method does not either.
  documentsFor(countryCode, blocs = new Set()) {
    const blocSet = blocs instanceof Set ? blocs : new Set(blocs);
    return this.documents.filter((doc) => {
      if (doc.bloc != null) return blocSet.has(doc.bloc);
      return doc.countryCode === countryCode;
    });
  }

  /// The one to show beside a destination: a residency outranks a visa, and
  /// a document naming the country itself outranks a bloc's.
  best(countryCode, blocs = new Set()) {
    const held = this.documentsFor(countryCode, blocs);
    return (
      held.find((d) => d.countryCode === countryCode && d.kind === 'residency') ??
      held.find((d) => d.countryCode === countryCode) ??
      held.find((d) => d.kind === 'residency') ??
      held[0] ??
      null
    );
  }

  /// Whether this document reaches a destination — the question the "where
  /// does this take me" filter asks of every city.
  reaches(doc, countryCode, blocs) {
    const blocSet = blocs instanceof Set ? blocs : new Set(blocs);
    if (doc.bloc != null) return blocSet.has(doc.bloc);
    return doc.countryCode === countryCode;
  }

  get isEmpty() {
    return this.documents.length === 0;
  }

  /// Upsert by identity — editing a paper replaces the record with the same
  /// (place, kind), as the Swift save does.
  save(doc) {
    const id = documentId(doc);
    const index = this.documents.findIndex((d) => documentId(d) === id);
    if (index >= 0) this.documents[index] = doc;
    else this.documents.push(doc);
    this.persist();
  }

  remove(doc) {
    const id = documentId(doc);
    this.documents = this.documents.filter((d) => documentId(d) !== id);
    this.persist();
  }

  persist() {
    this.storage.setItem(KEY, JSON.stringify(this.documents));
  }
}
