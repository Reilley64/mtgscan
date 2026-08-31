package index

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
	"strings"
)

const MaxQueryRunes = 1024

type SearchFilters struct {
	Feature        string
	Kind           string
	SpecStatus     string
	EvidenceStatus string
	Limit          int
}

type SearchRecord struct {
	ID             string `json:"id"`
	Kind           string `json:"kind"`
	Feature        string `json:"feature"`
	Title          string `json:"title"`
	Text           string `json:"text"`
	Status         string `json:"status"`
	EvidenceStatus string `json:"evidence_status,omitempty"`
	SourcePath     string `json:"source_path"`
}

type RequirementDetail struct {
	ID             string `json:"id"`
	Feature        string `json:"feature"`
	Title          string `json:"title"`
	Category       string `json:"category"`
	Statement      string `json:"statement"`
	Method         string `json:"verification_method"`
	EvidenceTarget string `json:"evidence_target"`
	EvidenceStatus string `json:"evidence_status"`
	SpecStatus     string `json:"spec_status"`
	SourcePath     string `json:"source_path"`
}

type FeatureDetail struct {
	Slug         string   `json:"slug"`
	Title        string   `json:"title"`
	Status       string   `json:"status"`
	Overview     string   `json:"overview"`
	Context      string   `json:"context"`
	Traceability string   `json:"traceability,omitempty"`
	Limitations  []string `json:"limitations"`
	SourcePath   string   `json:"source_path"`
}

var exactRequirementIDPattern = regexp.MustCompile(`^[A-Z0-9-]+-REQ-\d{3}$`)

func (s *Store) Search(ctx context.Context, query string, filters SearchFilters) ([]SearchRecord, error) {
	trimmedQuery := strings.TrimSpace(query)
	if trimmedQuery == "" {
		return nil, fmt.Errorf("query must contain words or an exact requirement ID")
	}
	if len([]rune(trimmedQuery)) > MaxQueryRunes {
		return nil, fmt.Errorf("query must be at most %d characters", MaxQueryRunes)
	}
	limit := boundedLimit(filters.Limit)
	if exactRequirementIDPattern.MatchString(strings.ToUpper(trimmedQuery)) {
		return s.searchExactID(ctx, strings.ToUpper(trimmedQuery), filters, limit)
	}
	tokens := ftsTokens(trimmedQuery)
	if len(tokens) == 0 {
		return nil, fmt.Errorf("query must contain words or an exact requirement ID")
	}
	results, err := s.searchFTS(ctx, ftsQuery(tokens, "AND"), filters, limit)
	if err != nil || len(results) > 0 || len(tokens) == 1 {
		return results, err
	}
	return s.searchFTS(ctx, ftsQuery(tokens, "OR"), filters, limit)
}

func (s *Store) searchFTS(ctx context.Context, match string, filters SearchFilters, limit int) ([]SearchRecord, error) {
	where := []string{"search_fts MATCH ?"}
	args := []any{match}
	appendFilters(&where, &args, filters)
	args = append(args, limit)
	rows, err := s.db.QueryContext(ctx, `
SELECT d.id, d.kind, d.feature_slug, d.title, d.display_text, d.status, COALESCE(d.evidence_status, ''), d.source_path
FROM search_fts
JOIN search_documents d ON d.id = search_fts.id
WHERE `+strings.Join(where, " AND ")+`
ORDER BY bm25(search_fts) ASC, d.id ASC
LIMIT ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanSearchRows(rows)
}

func (s *Store) searchExactID(ctx context.Context, id string, filters SearchFilters, limit int) ([]SearchRecord, error) {
	where := []string{"d.id = ?"}
	args := []any{id}
	appendFilters(&where, &args, filters)
	args = append(args, limit)
	rows, err := s.db.QueryContext(ctx, `
SELECT d.id, d.kind, d.feature_slug, d.title, d.display_text, d.status, COALESCE(d.evidence_status, ''), d.source_path
FROM search_documents d
WHERE `+strings.Join(where, " AND ")+`
ORDER BY d.id
LIMIT ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanSearchRows(rows)
}

func appendFilters(where *[]string, args *[]any, filters SearchFilters) {
	if filters.Feature != "" {
		*where = append(*where, "d.feature_slug = ?")
		*args = append(*args, filters.Feature)
	}
	if filters.Kind != "" {
		*where = append(*where, "d.kind = ?")
		*args = append(*args, filters.Kind)
	}
	if filters.SpecStatus != "" {
		*where = append(*where, "d.status = ?")
		*args = append(*args, filters.SpecStatus)
	}
	if filters.EvidenceStatus != "" {
		*where = append(*where, "d.evidence_status = ?")
		*args = append(*args, filters.EvidenceStatus)
	}
}

func (s *Store) GetRequirement(ctx context.Context, id string) (RequirementDetail, error) {
	row := s.db.QueryRowContext(ctx, `
SELECT r.id, r.feature_slug, r.title, r.category, r.statement, v.method, v.evidence_target, v.status, f.status, r.source_path
FROM requirements r
JOIN verification v ON v.requirement_id = r.id
JOIN features f ON f.slug = r.feature_slug
WHERE r.id = ?`, strings.ToUpper(strings.TrimSpace(id)))
	var detail RequirementDetail
	return detail, row.Scan(&detail.ID, &detail.Feature, &detail.Title, &detail.Category, &detail.Statement, &detail.Method, &detail.EvidenceTarget, &detail.EvidenceStatus, &detail.SpecStatus, &detail.SourcePath)
}

func (s *Store) GetFeature(ctx context.Context, slug string) (FeatureDetail, error) {
	var detail FeatureDetail
	row := s.db.QueryRowContext(ctx, `SELECT slug, title, status, overview, context, traceability, source_path FROM features WHERE slug = ?`, slug)
	if err := row.Scan(&detail.Slug, &detail.Title, &detail.Status, &detail.Overview, &detail.Context, &detail.Traceability, &detail.SourcePath); err != nil {
		return FeatureDetail{}, err
	}
	detail.Limitations = []string{}
	rows, err := s.db.QueryContext(ctx, `SELECT text FROM limitations WHERE feature_slug = ? ORDER BY ordinal`, slug)
	if err != nil {
		return FeatureDetail{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var limitation string
		if err := rows.Scan(&limitation); err != nil {
			return FeatureDetail{}, err
		}
		detail.Limitations = append(detail.Limitations, limitation)
	}
	return detail, rows.Err()
}

func (s *Store) EvidenceGaps(ctx context.Context, feature string, statuses []string, limit int) ([]RequirementDetail, error) {
	if len(statuses) == 0 {
		statuses = []string{"Gap", "Partial"}
	}
	where := []string{"v.status IN (" + placeholders(len(statuses)) + ")"}
	args := make([]any, 0, len(statuses)+2)
	for _, status := range statuses {
		args = append(args, status)
	}
	if feature != "" {
		where = append(where, "r.feature_slug = ?")
		args = append(args, feature)
	}
	args = append(args, boundedLimit(limit))
	rows, err := s.db.QueryContext(ctx, `
SELECT r.id, r.feature_slug, r.title, r.category, r.statement, v.method, v.evidence_target, v.status, f.status, r.source_path
FROM requirements r
JOIN verification v ON v.requirement_id = r.id
JOIN features f ON f.slug = r.feature_slug
WHERE `+strings.Join(where, " AND ")+`
ORDER BY r.feature_slug, r.ordinal
LIMIT ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []RequirementDetail{}
	for rows.Next() {
		var detail RequirementDetail
		if err := rows.Scan(&detail.ID, &detail.Feature, &detail.Title, &detail.Category, &detail.Statement, &detail.Method, &detail.EvidenceTarget, &detail.EvidenceStatus, &detail.SpecStatus, &detail.SourcePath); err != nil {
			return nil, err
		}
		out = append(out, detail)
	}
	return out, rows.Err()
}

func scanSearchRows(rows *sql.Rows) ([]SearchRecord, error) {
	records := []SearchRecord{}
	for rows.Next() {
		var record SearchRecord
		if err := rows.Scan(&record.ID, &record.Kind, &record.Feature, &record.Title, &record.Text, &record.Status, &record.EvidenceStatus, &record.SourcePath); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func boundedLimit(limit int) int {
	if limit <= 0 {
		return 5
	}
	if limit > 20 {
		return 20
	}
	return limit
}

func placeholders(n int) string {
	parts := make([]string, n)
	for i := range parts {
		parts[i] = "?"
	}
	return strings.Join(parts, ",")
}
