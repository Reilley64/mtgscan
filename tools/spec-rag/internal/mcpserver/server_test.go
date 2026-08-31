package mcpserver

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/Reilley64/mtgscan/tools/spec-rag/internal/index"
)

func TestToolDefinitionsAreReadOnly(t *testing.T) {
	for _, tool := range ToolDefinitions() {
		if tool.Annotations == nil {
			t.Fatalf("%s missing annotations", tool.Name)
		}
		if !tool.Annotations.ReadOnlyHint || !tool.Annotations.IdempotentHint {
			t.Fatalf("%s annotations are not read-only/idempotent: %#v", tool.Name, tool.Annotations)
		}
		if tool.Annotations.DestructiveHint == nil || *tool.Annotations.DestructiveHint {
			t.Fatalf("%s destructive hint not false", tool.Name)
		}
	}
}

func TestMCPInMemoryProtocolSurface(t *testing.T) {
	ctx := context.Background()
	manager := index.NewManager(makeRepo(t))
	defer manager.Close()
	server := New(manager)
	client := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "test"}, nil)
	serverTransport, clientTransport := mcp.NewInMemoryTransports()
	serverSession, err := server.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer serverSession.Close()
	clientSession, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer clientSession.Close()

	tools, err := clientSession.ListTools(ctx, &mcp.ListToolsParams{})
	if err != nil {
		t.Fatal(err)
	}
	if len(tools.Tools) != 5 {
		t.Fatalf("tool count = %d", len(tools.Tools))
	}
	foundSearch := false
	for _, tool := range tools.Tools {
		if tool.Name == "search_feature_specs" {
			foundSearch = true
			if tool.Annotations == nil || !tool.Annotations.ReadOnlyHint {
				t.Fatalf("search tool missing read-only annotation: %#v", tool.Annotations)
			}
		}
	}
	if !foundSearch {
		t.Fatal("search_feature_specs not listed")
	}
	result, err := clientSession.CallTool(ctx, &mcp.CallToolParams{Name: "search_feature_specs", Arguments: map[string]any{"query": "PAYER-PROFILE-REQ-002"}})
	if err != nil {
		t.Fatal(err)
	}
	if result.IsError {
		t.Fatalf("tool returned error: %#v", result.Content)
	}
	if len(result.Content) != 0 {
		t.Fatalf("structured tool duplicated output into content: %#v", result.Content)
	}
	var output SearchFeatureSpecsOutput
	data, err := json.Marshal(result.StructuredContent)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &output); err != nil {
		t.Fatal(err)
	}
	if len(output.Results) != 1 || output.Results[0].Kind != "retired_requirement" {
		t.Fatalf("retired exact lookup failed through MCP: %#v", output.Results)
	}
}

func TestMCPOutputsUseEmptyArraysNotNull(t *testing.T) {
	ctx := context.Background()
	repo := makeRepoNoLimitations(t)
	manager := index.NewManager(repo)
	defer manager.Close()
	server := New(manager)
	client := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "test"}, nil)
	serverTransport, clientTransport := mcp.NewInMemoryTransports()
	serverSession, err := server.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer serverSession.Close()
	clientSession, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer clientSession.Close()

	assertStructuredJSON := func(name string, args map[string]any, want string) {
		t.Helper()
		result, err := clientSession.CallTool(ctx, &mcp.CallToolParams{Name: name, Arguments: args})
		if err != nil {
			t.Fatal(err)
		}
		if result.IsError {
			t.Fatalf("%s returned error: %#v", name, result.Content)
		}
		if len(result.Content) != 0 {
			t.Fatalf("%s duplicated output into content: %#v", name, result.Content)
		}
		data, err := json.Marshal(result.StructuredContent)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(data), want) {
			t.Fatalf("%s structured JSON %s does not contain %s", name, data, want)
		}
	}
	assertStructuredJSON("search_feature_specs", map[string]any{"query": "doesnotexist"}, `"results":[]`)
	assertStructuredJSON("list_evidence_gaps", map[string]any{"evidence_statuses": []string{"Partial"}}, `"requirements":[]`)
	assertStructuredJSON("get_feature", map[string]any{"slug": "payer-profile"}, `"limitations":[]`)
}

func TestMCPErrorContentIsUseful(t *testing.T) {
	ctx := context.Background()
	manager := index.NewManager(makeRepo(t))
	defer manager.Close()
	server := New(manager)
	client := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "test"}, nil)
	serverTransport, clientTransport := mcp.NewInMemoryTransports()
	serverSession, err := server.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer serverSession.Close()
	clientSession, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer clientSession.Close()
	result, err := clientSession.CallTool(ctx, &mcp.CallToolParams{Name: "search_feature_specs", Arguments: map[string]any{"query": "!!!"}})
	if err != nil {
		t.Fatal(err)
	}
	if !result.IsError || len(result.Content) == 0 {
		t.Fatalf("expected useful tool error content, got %#v", result)
	}
}

func TestHandlers(t *testing.T) {
	ctx := context.Background()
	manager := index.NewManager(makeRepo(t))
	defer manager.Close()
	service := NewService(manager)

	_, searchOut, err := service.SearchFeatureSpecs(ctx, nil, SearchFeatureSpecsInput{Query: "profile", Kind: "requirement", Limit: 5})
	if err != nil {
		t.Fatal(err)
	}
	if len(searchOut.Results) == 0 {
		t.Fatalf("search output missing results: %#v", searchOut)
	}

	_, reqOut, err := service.GetRequirement(ctx, nil, GetRequirementInput{ID: "PAYER-PROFILE-REQ-001"})
	if err != nil {
		t.Fatal(err)
	}
	if reqOut.Requirement.EvidenceStatus != "Gap" {
		t.Fatalf("unexpected requirement: %#v", reqOut.Requirement)
	}

	_, featureOut, err := service.GetFeature(ctx, nil, GetFeatureInput{Slug: "payer-profile"})
	if err != nil {
		t.Fatal(err)
	}
	if featureOut.Feature.Slug != "payer-profile" || len(featureOut.Feature.Limitations) != 1 || featureOut.Feature.Traceability == "" {
		t.Fatalf("unexpected feature: %#v", featureOut.Feature)
	}

	_, gapsOut, err := service.ListEvidenceGaps(ctx, nil, ListEvidenceGapsInput{})
	if err != nil {
		t.Fatal(err)
	}
	if len(gapsOut.Requirements) != 1 || gapsOut.Requirements[0].EvidenceStatus != "Gap" {
		t.Fatalf("unexpected gaps: %#v", gapsOut.Requirements)
	}

	_, statusOut, err := service.GetIndexStatus(ctx, nil, GetIndexStatusInput{})
	if err != nil {
		t.Fatal(err)
	}
	if statusOut.Index.Storage != "memory" || statusOut.Index.Counts.Requirements != 2 || statusOut.Index.Counts.RetiredRequirements != 1 {
		t.Fatalf("unexpected status: %#v", statusOut.Index)
	}
}

func TestHandlerRefreshesChangedSpecs(t *testing.T) {
	ctx := context.Background()
	repo := makeRepo(t)
	manager := index.NewManager(repo)
	defer manager.Close()
	service := NewService(manager)
	_, before, err := service.GetIndexStatus(ctx, nil, GetIndexStatusInput{})
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(repo, "docs", "features", "payer-profile", "spec.md")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(strings.Replace(string(data), "Provider identity is known.", "Provider identity is refreshed.", 1)), 0o644); err != nil {
		t.Fatal(err)
	}
	_, after, err := service.GetIndexStatus(ctx, nil, GetIndexStatusInput{})
	if err != nil {
		t.Fatal(err)
	}
	if before.Index.Digest == after.Index.Digest || before.Index.Storage != "memory" || after.Index.Storage != "memory" {
		t.Fatalf("server did not switch indexes: before=%#v after=%#v", before.Index, after.Index)
	}
}

func TestConcurrentCallsRemainSafeDuringRefresh(t *testing.T) {
	ctx := context.Background()
	repo := makeRepo(t)
	manager := index.NewManager(repo)
	defer manager.Close()
	service := NewService(manager)
	path := filepath.Join(repo, "docs", "features", "payer-profile", "spec.md")
	original, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	errs := make(chan error, 32)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			for j := 0; j < 8; j++ {
				if i == 0 {
					updated := strings.Replace(string(original), "Provider identity is known.", "Provider identity is known "+string(rune('A'+j))+".", 1)
					if err := atomicWrite(path, []byte(updated)); err != nil {
						errs <- err
						return
					}
				}
				_, _, err := service.SearchFeatureSpecs(ctx, nil, SearchFeatureSpecsInput{Query: "profile", Limit: 1})
				if err != nil {
					errs <- err
					return
				}
			}
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Error(err)
	}
}

func TestHandlersReturnUsefulMissingErrors(t *testing.T) {
	ctx := context.Background()
	manager := index.NewManager(makeRepo(t))
	defer manager.Close()
	service := NewService(manager)
	_, _, err := service.GetRequirement(ctx, nil, GetRequirementInput{ID: "PAYER-PROFILE-REQ-999"})
	if err == nil || !strings.Contains(err.Error(), "active requirement not found") {
		t.Fatalf("expected missing requirement error, got %v", err)
	}
	_, _, err = service.GetFeature(ctx, nil, GetFeatureInput{Slug: "missing"})
	if err == nil || !strings.Contains(err.Error(), "feature not found") {
		t.Fatalf("expected missing feature error, got %v", err)
	}
	_, _, err = service.SearchFeatureSpecs(ctx, nil, SearchFeatureSpecsInput{Query: "!!!"})
	if err == nil || !strings.Contains(err.Error(), "query must contain words") {
		t.Fatalf("expected query validation error, got %v", err)
	}
}

func makeRepo(t *testing.T) string {
	t.Helper()
	repo := t.TempDir()
	if err := os.WriteFile(filepath.Join(repo, ".git"), []byte("gitdir: /tmp/fake\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(repo, "docs", "features", "payer-profile")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "spec.md"), []byte(specText()), 0o644); err != nil {
		t.Fatal(err)
	}
	return repo
}

func makeRepoNoLimitations(t *testing.T) string {
	repo := makeRepo(t)
	path := filepath.Join(repo, "docs", "features", "payer-profile", "spec.md")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	updated := strings.Replace(string(data), "- Duplicate profile behavior is not explicit.\n\n", "", 1)
	if err := os.WriteFile(path, []byte(updated), 0o644); err != nil {
		t.Fatal(err)
	}
	return repo
}

func atomicWrite(path string, data []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".spec-rag-test-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	return os.Rename(tmpPath, path)
}

func specText() string {
	return `# Payer profile specification

Status: Draft

Spec path: ` + "`docs/features/payer-profile/spec.md`" + `

## Overview

Payer profile links a payer to local profile details.

## Scope

### In scope

- Profile creation.

### Out of scope

- Profile deletion.

## Actors and external systems

- Payer: Uses the profile.

## Terms

| Term | Meaning |
| --- | --- |
| Profile | Local payer details. |

## Assumptions and constraints

- Provider identity is known.

## Current limitations

- Duplicate profile behavior is not explicit.

## Requirements

### Functional requirements

#### PAYER-PROFILE-REQ-001: Creation authorization

When profile creation is requested, payer profile shall require authorization.

### Quality requirements

#### PAYER-PROFILE-REQ-003: Atomic creation

Payer profile shall create local data atomically.

## Verification matrix

| Requirement ID | Verification method | Evidence target | Status |
| --- | --- | --- | --- |
| PAYER-PROFILE-REQ-001 | Test | Profile creation authorization evidence | Gap |
| PAYER-PROFILE-REQ-003 | Analysis | Atomic profile creation evidence | Planned |

## Traceability

- Related feature spec: docs/features/payer-authorization/spec.md
- Interface contract: Planned.

## Retired requirements

| Requirement ID | Retirement date | Reason retired | Replacement ID |
| --- | --- | --- | --- |
| PAYER-PROFILE-REQ-002 | 2026-01-02 | Replaced by atomic creation requirement. | PAYER-PROFILE-REQ-003 |
`
}
