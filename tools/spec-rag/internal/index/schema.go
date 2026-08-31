package index

const schemaSQL = `
PRAGMA foreign_keys = ON;
CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE features (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Draft', 'Active', 'Retired')),
    source_path TEXT NOT NULL UNIQUE,
    overview TEXT NOT NULL,
    context TEXT NOT NULL,
    traceability TEXT NOT NULL
);
CREATE TABLE limitations (
    id INTEGER PRIMARY KEY,
    feature_slug TEXT NOT NULL REFERENCES features(slug) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    text TEXT NOT NULL,
    UNIQUE(feature_slug, ordinal)
);
CREATE TABLE requirements (
    id TEXT PRIMARY KEY,
    feature_slug TEXT NOT NULL REFERENCES features(slug) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK(category IN ('Functional', 'Quality')),
    title TEXT NOT NULL,
    statement TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    source_path TEXT NOT NULL,
    UNIQUE(feature_slug, ordinal)
);
CREATE TABLE retired_requirements (
    id TEXT PRIMARY KEY,
    feature_slug TEXT NOT NULL REFERENCES features(slug) ON DELETE CASCADE,
    retirement_date TEXT NOT NULL,
    reason TEXT NOT NULL,
    replacement_id TEXT,
    ordinal INTEGER NOT NULL,
    source_path TEXT NOT NULL,
    UNIQUE(feature_slug, ordinal)
);
CREATE TABLE verification (
    requirement_id TEXT PRIMARY KEY REFERENCES requirements(id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK(method IN ('Test', 'Inspection', 'Demonstration', 'Analysis')),
    evidence_target TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Existing', 'Partial', 'Gap', 'Planned'))
);
CREATE TABLE search_documents (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('feature', 'requirement', 'limitation', 'retired_requirement')),
    feature_slug TEXT NOT NULL REFERENCES features(slug) ON DELETE CASCADE,
    requirement_id TEXT,
    title TEXT NOT NULL,
    display_text TEXT NOT NULL,
    search_text TEXT NOT NULL,
    status TEXT NOT NULL,
    evidence_status TEXT,
    source_path TEXT NOT NULL
);
CREATE VIRTUAL TABLE search_fts USING fts5(
    id UNINDEXED,
    kind UNINDEXED,
    feature_slug,
    title,
    search_text,
    status UNINDEXED,
    evidence_status UNINDEXED
);
`
