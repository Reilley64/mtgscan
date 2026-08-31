package index

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Reilley64/mtgscan/tools/spec-rag/internal/specparse"
)

func TestFTS5Available(t *testing.T) {
	if err := CheckFTS5(context.Background()); err != nil {
		t.Fatalf("FTS5 unavailable: %v", err)
	}
}

func TestManagerAllowsNoSpecs(t *testing.T) {
	ctx := context.Background()
	manager := NewManager(t.TempDir())
	defer manager.Close()
	status, err := manager.Status(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if status.Digest == "" || status.Counts != (Counts{}) {
		t.Fatalf("unexpected status: %#v", status)
	}
	results, err := manager.Search(ctx, "card", SearchFilters{})
	if err != nil || results == nil || len(results) != 0 {
		t.Fatalf("search results=%#v err=%v", results, err)
	}
	gaps, err := manager.EvidenceGaps(ctx, "", nil, 5)
	if err != nil || gaps == nil || len(gaps) != 0 {
		t.Fatalf("evidence gaps=%#v err=%v", gaps, err)
	}
	if _, err := manager.GetRequirement(ctx, "CARD-COLLECTION-REQ-001"); !IsNotFound(err) {
		t.Fatalf("requirement error=%v, want not found", err)
	}
	if _, err := manager.GetFeature(ctx, "card-collection"); !IsNotFound(err) {
		t.Fatalf("feature error=%v, want not found", err)
	}
}
func TestManagerBuildsInMemoryStoreAndQueries(t *testing.T) {
	ctx := context.Background()
	repo := makeRepo(t, map[string]string{"alpha-feature": specText("alpha-feature", "Alpha feature", "unusual punctuation bank/account quoted terms")})
	before := tree(t, repo)
	manager := NewManager(repo)
	defer manager.Close()
	status, err := manager.Status(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if status.Storage != "memory" {
		t.Fatalf("storage = %q, want memory", status.Storage)
	}
	if status.Counts.Features != 1 || status.Counts.Requirements != 2 || status.Counts.RetiredRequirements != 1 || status.Counts.Verification != 2 || status.Counts.Limitations != 1 || status.Counts.Documents != 5 {
		t.Fatalf("unexpected counts: %#v", status.Counts)
	}
	if after := tree(t, repo); strings.Join(before, "\n") != strings.Join(after, "\n") {
		t.Fatalf("index created repository artifacts: before=%v after=%v", before, after)
	}
	results, err := manager.Search(ctx, `bank/account "quoted" + weird`, SearchFilters{Limit: 5})
	if err != nil || len(results) == 0 {
		t.Fatalf("search: results=%#v err=%v", results, err)
	}
	exact, err := manager.Search(ctx, "ALPHA-FEATURE-REQ-002", SearchFilters{})
	if err != nil || len(exact) != 1 || exact[0].Kind != "retired_requirement" {
		t.Fatalf("exact retired lookup: %#v, %v", exact, err)
	}
	requirement, err := manager.GetRequirement(ctx, "ALPHA-FEATURE-REQ-001")
	if err != nil || requirement.EvidenceStatus != "Gap" {
		t.Fatalf("requirement=%#v err=%v", requirement, err)
	}
}

func TestSearchPreservesLimitsFiltersAndFallback(t *testing.T) {
	ctx := context.Background()
	specs := map[string]string{}
	for _, slug := range []string{"alpha-feature", "beta-feature", "gamma-feature", "delta-feature", "epsilon-feature", "zeta-feature", "eta-feature", "theta-feature"} {
		specs[slug] = specText(slug, strings.ReplaceAll(slug, "-", " "), "sharedword orange")
	}
	manager := NewManager(makeRepo(t, specs))
	defer manager.Close()
	results, err := manager.Search(ctx, "sharedword", SearchFilters{})
	if err != nil || len(results) != 5 {
		t.Fatalf("default limit: results=%d err=%v", len(results), err)
	}
	results, err = manager.Search(ctx, "sharedword", SearchFilters{Limit: 100})
	if err != nil || len(results) != 20 {
		t.Fatalf("capped limit: results=%d err=%v", len(results), err)
	}
	filtered, err := manager.Search(ctx, "quality", SearchFilters{Kind: "requirement", EvidenceStatus: "Planned"})
	if err != nil || len(filtered) != 5 {
		t.Fatalf("filtered results=%#v err=%v", filtered, err)
	}
	fallback, err := manager.Search(ctx, "orange no-such-token", SearchFilters{})
	if err != nil || len(fallback) == 0 {
		t.Fatalf("OR fallback: results=%#v err=%v", fallback, err)
	}
	feature, err := manager.GetFeature(ctx, "alpha-feature")
	if err != nil || len(feature.Limitations) != 1 || feature.Traceability == "" {
		t.Fatalf("feature=%#v err=%v", feature, err)
	}
	gaps, err := manager.EvidenceGaps(ctx, "", nil, 10)
	if err != nil || len(gaps) != 8 {
		t.Fatalf("gaps=%#v err=%v", gaps, err)
	}
}

func TestManagerReusesUnchangedStoreAndRebuildsChangedSource(t *testing.T) {
	ctx := context.Background()
	repo := makeRepo(t, map[string]string{"alpha-feature": specText("alpha-feature", "Alpha feature", "firsttoken")})
	manager := NewManager(repo)
	defer manager.Close()
	first, err := manager.currentLocked(ctx)
	if err != nil {
		t.Fatal(err)
	}
	firstStatus := first.Status()
	second, err := manager.currentLocked(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Fatal("manager rebuilt unchanged snapshot")
	}
	path := filepath.Join(repo, "docs", "features", "alpha-feature", "spec.md")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(strings.Replace(string(data), "firsttoken", "secondtoken", 1)), 0o644); err != nil {
		t.Fatal(err)
	}
	next, err := manager.currentLocked(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if next == first || next.Status().Digest == firstStatus.Digest {
		t.Fatalf("manager did not replace changed source: before=%#v after=%#v", firstStatus, next.Status())
	}
	results, err := next.Search(ctx, "secondtoken", SearchFilters{})
	if err != nil || len(results) == 0 {
		t.Fatalf("rebuilt store did not query changed content: %#v %v", results, err)
	}
}

func TestStoreUsesOneQueryOnlyForeignKeyEnabledMemoryDatabase(t *testing.T) {
	ctx := context.Background()
	repo := makeRepo(t, map[string]string{"alpha-feature": specText("alpha-feature", "Alpha feature", "first")})
	manager := NewManager(repo)
	defer manager.Close()
	store, err := manager.currentLocked(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var foreignKeys, queryOnly, tempStore int
	if err := store.db.QueryRowContext(ctx, `PRAGMA foreign_keys`).Scan(&foreignKeys); err != nil || foreignKeys != 1 {
		t.Fatalf("foreign keys=%d err=%v", foreignKeys, err)
	}
	if err := store.db.QueryRowContext(ctx, `PRAGMA query_only`).Scan(&queryOnly); err != nil || queryOnly != 1 {
		t.Fatalf("query_only=%d err=%v", queryOnly, err)
	}
	if err := store.db.QueryRowContext(ctx, `PRAGMA temp_store`).Scan(&tempStore); err != nil || tempStore != 2 {
		t.Fatalf("temp_store=%d err=%v", tempStore, err)
	}
	if _, err := store.db.ExecContext(ctx, `INSERT INTO features(slug, title, status, source_path, overview, context, traceability) VALUES ('bad', 'bad', 'Draft', 'bad', '', '', '')`); err == nil {
		t.Fatal("query-only database accepted a write")
	}
	var fts int
	if err := store.db.QueryRowContext(ctx, `SELECT count(*) FROM search_fts WHERE search_fts MATCH 'first'`).Scan(&fts); err != nil || fts == 0 {
		t.Fatalf("FTS5 unavailable in store: count=%d err=%v", fts, err)
	}
}

func TestBuildEnforcesForeignKeys(t *testing.T) {
	ctx := context.Background()
	repo := makeRepo(t, map[string]string{"alpha-feature": specText("alpha-feature", "Alpha feature", "first")})
	sources, err := specparse.ReadSources(repo)
	if err != nil {
		t.Fatal(err)
	}
	digest, _, err := DigestSources(sources)
	if err != nil {
		t.Fatal(err)
	}
	specs, err := specparse.ParseSources(sources)
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", "file:spec-rag-fk?mode=memory")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if err := build(ctx, db, digest, specs); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO requirements(id, feature_slug, category, title, statement, ordinal, source_path) VALUES ('BAD-REQ-999', 'missing', 'Functional', 'Bad', 'Bad shall fail.', 99, 'x')`); err == nil {
		t.Fatal("foreign key constraint accepted invalid requirement")
	}
}

func TestDigestChangesWhenSpecChanges(t *testing.T) {
	repo := makeRepo(t, map[string]string{"alpha-feature": specText("alpha-feature", "Alpha feature", "first")})
	digestA, _, err := ContentDigest(repo)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(repo, "docs", "features", "alpha-feature", "spec.md")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(strings.Replace(string(data), "first", "second", 1)), 0o644); err != nil {
		t.Fatal(err)
	}
	digestB, _, err := ContentDigest(repo)
	if err != nil {
		t.Fatal(err)
	}
	if digestA == digestB {
		t.Fatal("digest did not change")
	}
}

func TestQueryLengthLimit(t *testing.T) {
	repo := makeRepo(t, map[string]string{"alpha-feature": specText("alpha-feature", "Alpha feature", "first")})
	manager := NewManager(repo)
	defer manager.Close()
	_, err := manager.Search(context.Background(), strings.Repeat("a", MaxQueryRunes+1), SearchFilters{})
	if err == nil || !strings.Contains(err.Error(), "at most") {
		t.Fatalf("expected query length error, got %v", err)
	}
}

func tree(t *testing.T, root string) []string {
	t.Helper()
	var paths []string
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if path != root {
			paths = append(paths, strings.TrimPrefix(path, root+string(filepath.Separator)))
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return paths
}

func makeRepo(t *testing.T, specs map[string]string) string {
	t.Helper()
	repo := t.TempDir()
	if err := os.WriteFile(filepath.Join(repo, ".git"), []byte("gitdir: /tmp/fake\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	for slug, text := range specs {
		dir := filepath.Join(repo, "docs", "features", slug)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "spec.md"), []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return repo
}

func specText(slug, title, extra string) string {
	prefix := strings.ToUpper(slug)
	featureLower := strings.ToLower(title)
	return `# ` + title + ` specification

Status: Draft

Spec path: ` + "`docs/features/" + slug + "/spec.md`" + `

## Overview

` + title + ` handles ` + extra + `.

## Scope

### In scope

- ` + extra + `.

### Out of scope

- Other behavior.

## Actors and external systems

- Actor: Uses ` + extra + `.

## Terms

| Term | Meaning |
| --- | --- |
| Term | ` + extra + `. |

## Assumptions and constraints

- ` + extra + `.

## Current limitations

- Current limitation mentions ` + extra + `.

## Requirements

### Functional requirements

#### ` + prefix + `-REQ-001: Main behavior

When a trigger happens, ` + featureLower + ` shall process ` + extra + `.

### Quality requirements

#### ` + prefix + `-REQ-003: Quality behavior

` + featureLower + ` shall preserve quality.

## Verification matrix

| Requirement ID | Verification method | Evidence target | Status |
| --- | --- | --- | --- |
| ` + prefix + `-REQ-001 | Test | Main evidence ` + extra + ` | Gap |
| ` + prefix + `-REQ-003 | Demonstration | Quality evidence | Planned |

## Traceability

- Related feature spec: docs/features/other/spec.md
- Interface contract: Planned.

## Retired requirements

| Requirement ID | Retirement date | Reason retired | Replacement ID |
| --- | --- | --- | --- |
| ` + prefix + `-REQ-002 | 2026-01-02 | Replaced by clearer quality requirement. | ` + prefix + `-REQ-003 |
`
}
