package specparse

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadValidRealSpecs(t *testing.T) {
	repoRoot := repoRootFromTest(t)
	specs, err := LoadValid(repoRoot)
	if err != nil {
		t.Fatal(err)
	}
	canonicalPaths, err := filepath.Glob(filepath.Join(repoRoot, "docs", "features", "*", "spec.md"))
	if err != nil {
		t.Fatal(err)
	}
	want := 0
	for _, path := range canonicalPaths {
		if filepath.Base(filepath.Dir(path)) != "_template" {
			want++
		}
	}
	if got := len(specs); got != want {
		t.Fatalf("spec count = %d, want discovered count %d", got, want)
	}
}

func TestLoadValidAllowsNoSpecs(t *testing.T) {
	specs, err := LoadValid(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(specs) != 0 {
		t.Fatalf("spec count = %d, want 0", len(specs))
	}
}

func TestParseValidFixtureWithActiveGapAndRetiredRequirement(t *testing.T) {
	spec := parseFixture(t, validSpec("sample-feature"))
	if spec.Title != "Sample feature specification" {
		t.Fatalf("title = %q", spec.Title)
	}
	if got := len(spec.Requirements); got != 2 {
		t.Fatalf("requirements = %d", got)
	}
	if spec.Requirements[1].ID != "SAMPLE-FEATURE-REQ-003" {
		t.Fatalf("active ID gap was not preserved: %#v", spec.Requirements)
	}
	if spec.Terms[0].Term != "Thing|Pipe" || !strings.Contains(spec.Terms[0].Meaning, "`code | span`") {
		t.Fatalf("table pipes were not parsed correctly: %#v", spec.Terms)
	}
	if !strings.Contains(spec.Verification[0].EvidenceTarget, "escaped|pipe") || !strings.Contains(spec.Verification[0].EvidenceTarget, "--- ordinary") {
		t.Fatalf("verification table content was not parsed correctly: %#v", spec.Verification[0])
	}
	if got := len(spec.RetiredRequirements); got != 1 {
		t.Fatalf("retired requirements = %d", got)
	}
	retired := spec.RetiredRequirements[0]
	if retired.ID != "SAMPLE-FEATURE-REQ-002" || retired.RetirementDate != "2026-01-02" || retired.ReplacementID != "SAMPLE-FEATURE-REQ-003" {
		t.Fatalf("retired row not captured: %#v", retired)
	}
	if err := ValidateAll([]Spec{spec}); err != nil {
		t.Fatal(err)
	}
	if got := spec.Limitations[0]; !strings.Contains(got, "wrapped onto another line") {
		t.Fatalf("multiline limitation not joined: %q", got)
	}
}

func TestValidationRejectsDuplicateRequirementIDs(t *testing.T) {
	specA := parseFixture(t, validSpec("sample-feature"))
	specB := parseFixtureWithPath(t, "docs/features/another-feature/spec.md", "another-feature", strings.Replace(validSpec("another-feature"), "ANOTHER-FEATURE-REQ-001", "SAMPLE-FEATURE-REQ-001", 1))
	err := ValidateAll([]Spec{specA, specB})
	if err == nil || !strings.Contains(err.Error(), "duplicates") {
		t.Fatalf("expected duplicate error, got %v", err)
	}
}

func TestValidationRejectsRetiredReuseAndDuplicate(t *testing.T) {
	spec := parseFixture(t, strings.Replace(validSpec("sample-feature"), "SAMPLE-FEATURE-REQ-002 | 2026-01-02", "SAMPLE-FEATURE-REQ-001 | 2026-01-02", 1))
	err := ValidateAll([]Spec{spec})
	if err == nil || !strings.Contains(err.Error(), "retired requirement ID SAMPLE-FEATURE-REQ-001 duplicates or reuses") {
		t.Fatalf("expected retired reuse error, got %v", err)
	}

	specA := parseFixture(t, validSpec("sample-feature"))
	specB := parseFixtureWithPath(t, "docs/features/another-feature/spec.md", "another-feature", strings.Replace(validSpec("another-feature"), "ANOTHER-FEATURE-REQ-002", "SAMPLE-FEATURE-REQ-002", 1))
	err = ValidateAll([]Spec{specA, specB})
	if err == nil || !strings.Contains(err.Error(), "duplicates or reuses") {
		t.Fatalf("expected retired duplicate error, got %v", err)
	}
}

func TestValidationRejectsWrongPrefixAndNonIncreasingOrder(t *testing.T) {
	spec := parseFixture(t, strings.Replace(validSpec("sample-feature"), "SAMPLE-FEATURE-REQ-003", "OTHER-FEATURE-REQ-001", 1))
	err := ValidateAll([]Spec{spec})
	if err == nil || !strings.Contains(err.Error(), "does not use feature prefix") {
		t.Fatalf("expected prefix error, got %v", err)
	}

	spec = parseFixture(t, strings.Replace(validSpec("sample-feature"), "SAMPLE-FEATURE-REQ-003", "SAMPLE-FEATURE-REQ-001", 1))
	err = ValidateAll([]Spec{spec})
	if err == nil || !strings.Contains(err.Error(), "not strictly increasing") {
		t.Fatalf("expected increasing-order error, got %v", err)
	}
}

func TestValidationRejectsShallCountAndLimitationShall(t *testing.T) {
	text := strings.Replace(validSpec("sample-feature"), "Sample feature shall do one thing.", "Sample feature shall do one thing and shall do another thing.", 1)
	text = strings.Replace(text, "Current behavior is limited and wrapped\n  onto another line.", "Current behavior shall not be here.", 1)
	spec := parseFixture(t, text)
	err := ValidateAll([]Spec{spec})
	if err == nil || !strings.Contains(err.Error(), "exactly one shall") || !strings.Contains(err.Error(), "limitation contains shall") {
		t.Fatalf("expected shall errors, got %v", err)
	}
}

func TestValidationAllowsRetiredFeatureWithNoActiveRequirements(t *testing.T) {
	text := strings.Replace(validSpec("sample-feature"), "Status: Draft", "Status: Retired", 1)
	start := strings.Index(text, "## Requirements")
	end := strings.Index(text, "## Verification matrix")
	text = text[:start] + "## Requirements\n\nNo active requirements.\n\n" + text[end:]
	start = strings.Index(text, "## Verification matrix")
	end = strings.Index(text, "## Traceability")
	text = text[:start] + "## Verification matrix\n\n| Requirement ID | Verification method | Evidence target | Status |\n| --- | --- | --- | --- |\n\n" + text[end:]
	spec := parseFixture(t, text)
	if err := ValidateAll([]Spec{spec}); err != nil {
		t.Fatal(err)
	}
}

func TestValidationRejectsVerificationMismatchesAndBadEnums(t *testing.T) {
	text := strings.Replace(validSpec("sample-feature"), "| SAMPLE-FEATURE-REQ-003 | Demonstration | Second evidence | Planned |", "| SAMPLE-FEATURE-REQ-004 | Review | Extra evidence | Unknown |", 1)
	spec := parseFixture(t, text)
	err := ValidateAll([]Spec{spec})
	if err == nil || !strings.Contains(err.Error(), "unsupported method") || !strings.Contains(err.Error(), "unsupported status") || !strings.Contains(err.Error(), "missing verification row") || !strings.Contains(err.Error(), "unknown active requirement") {
		t.Fatalf("expected verification errors, got %v", err)
	}
}

func TestParseRejectsSpecPathMismatch(t *testing.T) {
	_, err := ParseMarkdown("docs/features/sample-feature/spec.md", "sample-feature", []byte(strings.Replace(validSpec("sample-feature"), "docs/features/sample-feature/spec.md", "docs/features/wrong/spec.md", 1)))
	if err == nil || !strings.Contains(err.Error(), "declared Spec path") {
		t.Fatalf("expected path mismatch, got %v", err)
	}
}

func TestParseRejectsStrictTableShapeErrors(t *testing.T) {
	cases := []struct {
		name string
		old  string
		new  string
	}{
		{
			name: "terms missing cell",
			old:  "| Thing\\|Pipe | A fixture " + "`code | span`" + " and --- ordinary content. |",
			new:  "| Thing\\|Pipe |",
		},
		{
			name: "terms extra cell",
			old:  "| Thing\\|Pipe | A fixture " + "`code | span`" + " and --- ordinary content. |",
			new:  "| Thing\\|Pipe | A fixture | Extra |",
		},
		{
			name: "terms missing leading pipe",
			old:  "| Thing\\|Pipe | A fixture " + "`code | span`" + " and --- ordinary content. |",
			new:  "Thing\\|Pipe | A fixture |",
		},
		{
			name: "verification missing cell",
			old:  "| SAMPLE-FEATURE-REQ-001 | Test | First evidence with escaped\\|pipe and " + "`code | span`" + " plus --- ordinary content | Gap |",
			new:  "| SAMPLE-FEATURE-REQ-001 | Test | First evidence |",
		},
		{
			name: "verification extra cell",
			old:  "| SAMPLE-FEATURE-REQ-001 | Test | First evidence with escaped\\|pipe and " + "`code | span`" + " plus --- ordinary content | Gap |",
			new:  "| SAMPLE-FEATURE-REQ-001 | Test | First evidence | Gap | Extra |",
		},
		{
			name: "retired missing cell",
			old:  "| SAMPLE-FEATURE-REQ-002 | 2026-01-02 | Split " + "`code | span`" + " and escaped\\|pipe with --- ordinary content. | SAMPLE-FEATURE-REQ-003 |",
			new:  "| SAMPLE-FEATURE-REQ-002 | 2026-01-02 | Reason only |",
		},
		{
			name: "retired extra cell",
			old:  "| SAMPLE-FEATURE-REQ-002 | 2026-01-02 | Split " + "`code | span`" + " and escaped\\|pipe with --- ordinary content. | SAMPLE-FEATURE-REQ-003 |",
			new:  "| SAMPLE-FEATURE-REQ-002 | 2026-01-02 | Reason | SAMPLE-FEATURE-REQ-003 | Extra |",
		},
		{
			name: "retired missing leading pipe",
			old:  "| SAMPLE-FEATURE-REQ-002 | 2026-01-02 | Split " + "`code | span`" + " and escaped\\|pipe with --- ordinary content. | SAMPLE-FEATURE-REQ-003 |",
			new:  "SAMPLE-FEATURE-REQ-002 | 2026-01-02 | Reason | SAMPLE-FEATURE-REQ-003 |",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ParseMarkdown("docs/features/sample-feature/spec.md", "sample-feature", []byte(strings.Replace(validSpec("sample-feature"), tc.old, tc.new, 1)))
			if err == nil || !strings.Contains(err.Error(), "expected") && !strings.Contains(err.Error(), "cells") && !strings.Contains(err.Error(), "must be a table row") {
				t.Fatalf("expected strict table error, got %v", err)
			}
		})
	}
}

func TestParseRejectsMissingTableHeaderOrSeparator(t *testing.T) {
	_, err := ParseMarkdown("docs/features/sample-feature/spec.md", "sample-feature", []byte(strings.Replace(validSpec("sample-feature"), "| Term | Meaning |", "| Name | Meaning |", 1)))
	if err == nil || !strings.Contains(err.Error(), "must be header") {
		t.Fatalf("expected table header error, got %v", err)
	}
	_, err = ParseMarkdown("docs/features/sample-feature/spec.md", "sample-feature", []byte(strings.Replace(validSpec("sample-feature"), "| --- | --- |", "| not | separator |", 1)))
	if err == nil || !strings.Contains(err.Error(), "separator row") {
		t.Fatalf("expected separator error, got %v", err)
	}
	_, err = ParseMarkdown("docs/features/sample-feature/spec.md", "sample-feature", []byte(strings.Replace(validSpec("sample-feature"), "| --- | --- |", "| - | - |", 1)))
	if err == nil || !strings.Contains(err.Error(), "separator row") {
		t.Fatalf("expected short delimiter separator error, got %v", err)
	}
}

func TestParseAllowsRetiredRequirementsNoneForm(t *testing.T) {
	text := validSpec("sample-feature")
	start := strings.Index(text, "## Retired requirements")
	text = text[:start] + "## Retired requirements\n\nNone.\n"
	spec := parseFixture(t, text)
	if len(spec.RetiredRequirements) != 0 {
		t.Fatalf("retired requirements = %#v, want empty", spec.RetiredRequirements)
	}
}

func TestParseRejectsMissingAndDuplicateRequiredHeadings(t *testing.T) {
	_, err := ParseMarkdown("docs/features/sample-feature/spec.md", "sample-feature", []byte(strings.Replace(validSpec("sample-feature"), "## Traceability", "## Local notes", 1)))
	if err == nil || !strings.Contains(err.Error(), "missing required section") {
		t.Fatalf("expected missing H2 error, got %v", err)
	}
	_, err = ParseMarkdown("docs/features/sample-feature/spec.md", "sample-feature", []byte(strings.Replace(validSpec("sample-feature"), "## Traceability", "## Overview\n\nDuplicate.\n\n## Traceability", 1)))
	if err == nil || !strings.Contains(err.Error(), "duplicate required section") {
		t.Fatalf("expected duplicate H2 error, got %v", err)
	}
	_, err = ParseMarkdown("docs/features/sample-feature/spec.md", "sample-feature", []byte(strings.Replace(validSpec("sample-feature"), "### Out of scope", "### Local scope", 1)))
	if err == nil || !strings.Contains(err.Error(), "missing required Scope subsection") {
		t.Fatalf("expected missing Scope H3 error, got %v", err)
	}
	_, err = ParseMarkdown("docs/features/sample-feature/spec.md", "sample-feature", []byte(strings.Replace(validSpec("sample-feature"), "### Out of scope", "### In scope", 1)))
	if err == nil || !strings.Contains(err.Error(), "duplicate required Scope subsection") {
		t.Fatalf("expected duplicate Scope H3 error, got %v", err)
	}
}

func TestValidationRejectsInvalidCalendarRetirementDate(t *testing.T) {
	spec := parseFixture(t, strings.Replace(validSpec("sample-feature"), "2026-01-02", "2026-02-31", 1))
	err := ValidateAll([]Spec{spec})
	if err == nil || !strings.Contains(err.Error(), "invalid retirement date") {
		t.Fatalf("expected calendar date error, got %v", err)
	}
}

func TestCountWordUsesUnicodeTokenBoundaries(t *testing.T) {
	if got := countWord("éshall shall shallé shall", "shall"); got != 2 {
		t.Fatalf("countWord = %d, want 2", got)
	}
}

func parseFixture(t *testing.T, text string) Spec {
	t.Helper()
	return parseFixtureWithPath(t, "docs/features/sample-feature/spec.md", "sample-feature", text)
}

func parseFixtureWithPath(t *testing.T, path, slug, text string) Spec {
	t.Helper()
	spec, err := ParseMarkdown(path, slug, []byte(text))
	if err != nil {
		t.Fatal(err)
	}
	return spec
}

func validSpec(slug string) string {
	prefix := strings.ToUpper(slug)
	title := strings.ReplaceAll(slug, "-", " ")
	title = strings.ToUpper(title[:1]) + title[1:]
	return `# ` + title + ` specification

Status: Draft

Spec path: ` + "`docs/features/" + slug + "/spec.md`" + `

## Overview

This fixture describes a feature.

## Scope

### In scope

- First behavior.

### Out of scope

- Other behavior.

## Actors and external systems

- Actor: Uses the feature.

## Terms

| Term | Meaning |
| --- | --- |
| Thing\|Pipe | A fixture ` + "`code | span`" + ` and --- ordinary content. |

## Assumptions and constraints

- A useful assumption.

## Current limitations

- Current behavior is limited and wrapped
  onto another line.

## Requirements

This section lists stable statements.

### Functional requirements

#### ` + prefix + `-REQ-001: First requirement

When a trigger happens, ` + title + ` shall do one thing.

### Quality requirements

#### ` + prefix + `-REQ-003: Third requirement

` + title + ` shall preserve a quality.

## Verification matrix

| Requirement ID | Verification method | Evidence target | Status |
| --- | --- | --- | --- |
| ` + prefix + `-REQ-001 | Test | First evidence with escaped\|pipe and ` + "`code | span`" + ` plus --- ordinary content | Gap |
| ` + prefix + `-REQ-003 | Demonstration | Second evidence | Planned |

## Traceability

- Related feature spec: docs/features/another-feature/spec.md
- Interface contract: Planned.

## Retired requirements

| Requirement ID | Retirement date | Reason retired | Replacement ID |
| --- | --- | --- | --- |
| ` + prefix + `-REQ-002 | 2026-01-02 | Split ` + "`code | span`" + ` and escaped\|pipe with --- ordinary content. | ` + prefix + `-REQ-003 |
`
}

func repoRootFromTest(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "docs", "features")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("could not find repo root")
		}
		dir = parent
	}
}
