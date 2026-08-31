package mcpserver

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/Reilley64/mtgscan/tools/spec-rag/internal/index"
)

type Service struct{ manager *index.Manager }

func NewService(manager *index.Manager) *Service { return &Service{manager: manager} }

func New(manager *index.Manager) *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{Name: "spec-rag", Version: "0.1.0"}, nil)
	NewService(manager).Register(server)
	return server
}

func (s *Service) Register(server *mcp.Server) {
	mcp.AddTool(server, searchFeatureSpecsTool(), s.SearchFeatureSpecs)
	mcp.AddTool(server, getRequirementTool(), s.GetRequirement)
	mcp.AddTool(server, getFeatureTool(), s.GetFeature)
	mcp.AddTool(server, listEvidenceGapsTool(), s.ListEvidenceGaps)
	mcp.AddTool(server, getIndexStatusTool(), s.GetIndexStatus)
}

func ToolDefinitions() []*mcp.Tool {
	return []*mcp.Tool{searchFeatureSpecsTool(), getRequirementTool(), getFeatureTool(), listEvidenceGapsTool(), getIndexStatusTool()}
}

func searchFeatureSpecsTool() *mcp.Tool {
	return &mcp.Tool{Name: "search_feature_specs", Title: "Search feature specs", Description: "Search canonical Markdown feature specs through SQLite FTS5. Exact active or retired requirement IDs are resolved directly. Optional filters narrow feature slug, document kind, spec status, evidence status, and limit.", Annotations: readOnlyAnnotations("Search feature specs")}
}

func getRequirementTool() *mcp.Tool {
	return &mcp.Tool{Name: "get_requirement", Title: "Get active requirement", Description: "Return one exact active stable requirement ID with its statement and verification details. Retired requirements are available through search_feature_specs.", Annotations: readOnlyAnnotations("Get active requirement")}
}

func getFeatureTool() *mcp.Tool {
	return &mcp.Tool{Name: "get_feature", Title: "Get feature", Description: "Return concise context, traceability, limitations, status, and source path for one feature slug. It does not return the raw Markdown file.", Annotations: readOnlyAnnotations("Get feature")}
}

func listEvidenceGapsTool() *mcp.Tool {
	return &mcp.Tool{Name: "list_evidence_gaps", Title: "List evidence gaps", Description: "List active requirements whose verification evidence status is Gap or Partial by default. Optional filters narrow feature and evidence status.", Annotations: readOnlyAnnotations("List evidence gaps")}
}

func getIndexStatusTool() *mcp.Tool {
	return &mcp.Tool{Name: "get_index_status", Title: "Get index status", Description: "Return current content digest, schema version, in-memory storage, and counts. The server refreshes this index automatically when canonical specs change.", Annotations: readOnlyAnnotations("Get index status")}
}

func readOnlyAnnotations(title string) *mcp.ToolAnnotations {
	openWorld := false
	destructive := false
	return &mcp.ToolAnnotations{Title: title, ReadOnlyHint: true, IdempotentHint: true, OpenWorldHint: &openWorld, DestructiveHint: &destructive}
}

type SearchFeatureSpecsInput struct {
	Query          string `json:"query" jsonschema:"Full-text query. Exact active or retired requirement IDs use direct lookup."`
	Feature        string `json:"feature,omitempty" jsonschema:"Optional feature slug, for example card-collection."`
	Kind           string `json:"kind,omitempty" jsonschema:"Optional document kind: feature, requirement, limitation, or retired_requirement."`
	SpecStatus     string `json:"spec_status,omitempty" jsonschema:"Optional spec status: Draft, Active, or Retired."`
	EvidenceStatus string `json:"evidence_status,omitempty" jsonschema:"Optional active requirement evidence status: Existing, Partial, Gap, or Planned."`
	Limit          int    `json:"limit,omitempty" jsonschema:"Maximum records to return. Defaults to 5 and is capped at 20."`
}

type SearchFeatureSpecsOutput struct {
	Results []index.SearchRecord `json:"results"`
}

type GetRequirementInput struct {
	ID string `json:"id" jsonschema:"Active stable requirement ID, for example CARD-COLLECTION-REQ-001."`
}

type GetRequirementOutput struct {
	Requirement index.RequirementDetail `json:"requirement"`
}

type GetFeatureInput struct {
	Slug string `json:"slug" jsonschema:"Feature slug, for example card-collection."`
}

type GetFeatureOutput struct {
	Feature index.FeatureDetail `json:"feature"`
}

type ListEvidenceGapsInput struct {
	Feature          string   `json:"feature,omitempty" jsonschema:"Optional feature slug."`
	EvidenceStatuses []string `json:"evidence_statuses,omitempty" jsonschema:"Optional evidence statuses. Defaults to Gap and Partial."`
	Limit            int      `json:"limit,omitempty" jsonschema:"Maximum records to return. Defaults to 5 and is capped at 20."`
}

type ListEvidenceGapsOutput struct {
	Requirements []index.RequirementDetail `json:"requirements"`
}

type GetIndexStatusInput struct{}

type GetIndexStatusOutput struct {
	Index index.Status `json:"index"`
}

func (s *Service) SearchFeatureSpecs(ctx context.Context, _ *mcp.CallToolRequest, input SearchFeatureSpecsInput) (*mcp.CallToolResult, SearchFeatureSpecsOutput, error) {
	input.Query = strings.TrimSpace(input.Query)
	if input.Query == "" {
		return nil, SearchFeatureSpecsOutput{}, errors.New("query must contain words or an exact requirement ID")
	}
	if err := validateOptional("kind", input.Kind, map[string]bool{"feature": true, "requirement": true, "limitation": true, "retired_requirement": true}); err != nil {
		return nil, SearchFeatureSpecsOutput{}, err
	}
	if err := validateOptional("spec_status", input.SpecStatus, map[string]bool{"Draft": true, "Active": true, "Retired": true}); err != nil {
		return nil, SearchFeatureSpecsOutput{}, err
	}
	if err := validateOptional("evidence_status", input.EvidenceStatus, evidenceStatuses()); err != nil {
		return nil, SearchFeatureSpecsOutput{}, err
	}
	results, err := s.manager.Search(ctx, input.Query, index.SearchFilters{Feature: input.Feature, Kind: input.Kind, SpecStatus: input.SpecStatus, EvidenceStatus: input.EvidenceStatus, Limit: input.Limit})
	if err != nil {
		return nil, SearchFeatureSpecsOutput{}, err
	}
	return structuredOnlyResult(), SearchFeatureSpecsOutput{Results: results}, nil
}

func (s *Service) GetRequirement(ctx context.Context, _ *mcp.CallToolRequest, input GetRequirementInput) (*mcp.CallToolResult, GetRequirementOutput, error) {
	input.ID = strings.TrimSpace(input.ID)
	if input.ID == "" {
		return nil, GetRequirementOutput{}, errors.New("id is required")
	}
	requirement, err := s.manager.GetRequirement(ctx, input.ID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, GetRequirementOutput{}, fmt.Errorf("active requirement not found: %s", input.ID)
	}
	if err != nil {
		return nil, GetRequirementOutput{}, err
	}
	return structuredOnlyResult(), GetRequirementOutput{Requirement: requirement}, nil
}

func (s *Service) GetFeature(ctx context.Context, _ *mcp.CallToolRequest, input GetFeatureInput) (*mcp.CallToolResult, GetFeatureOutput, error) {
	input.Slug = strings.TrimSpace(input.Slug)
	if input.Slug == "" {
		return nil, GetFeatureOutput{}, errors.New("slug is required")
	}
	feature, err := s.manager.GetFeature(ctx, input.Slug)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, GetFeatureOutput{}, fmt.Errorf("feature not found: %s", input.Slug)
	}
	if err != nil {
		return nil, GetFeatureOutput{}, err
	}
	return structuredOnlyResult(), GetFeatureOutput{Feature: feature}, nil
}

func (s *Service) ListEvidenceGaps(ctx context.Context, _ *mcp.CallToolRequest, input ListEvidenceGapsInput) (*mcp.CallToolResult, ListEvidenceGapsOutput, error) {
	for _, status := range input.EvidenceStatuses {
		if !evidenceStatuses()[status] {
			return nil, ListEvidenceGapsOutput{}, fmt.Errorf("evidence_statuses contains unsupported status %q", status)
		}
	}
	requirements, err := s.manager.EvidenceGaps(ctx, input.Feature, input.EvidenceStatuses, input.Limit)
	if err != nil {
		return nil, ListEvidenceGapsOutput{}, err
	}
	return structuredOnlyResult(), ListEvidenceGapsOutput{Requirements: requirements}, nil
}

func (s *Service) GetIndexStatus(ctx context.Context, _ *mcp.CallToolRequest, _ GetIndexStatusInput) (*mcp.CallToolResult, GetIndexStatusOutput, error) {
	status, err := s.manager.Status(ctx)
	if err != nil {
		return nil, GetIndexStatusOutput{}, err
	}
	return structuredOnlyResult(), GetIndexStatusOutput{Index: status}, nil
}

func structuredOnlyResult() *mcp.CallToolResult { return &mcp.CallToolResult{Content: []mcp.Content{}} }

func validateOptional(name, value string, allowed map[string]bool) error {
	if value == "" || allowed[value] {
		return nil
	}
	return fmt.Errorf("%s has unsupported value %q", name, value)
}

func evidenceStatuses() map[string]bool {
	return map[string]bool{"Existing": true, "Partial": true, "Gap": true, "Planned": true}
}
