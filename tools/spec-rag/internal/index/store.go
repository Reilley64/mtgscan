package index

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"unicode"

	_ "modernc.org/sqlite"

	"github.com/Reilley64/mtgscan/tools/spec-rag/internal/specparse"
)

type Counts struct {
	Features            int `json:"features"`
	Requirements        int `json:"requirements"`
	RetiredRequirements int `json:"retired_requirements"`
	Verification        int `json:"verification"`
	Limitations         int `json:"limitations"`
	Documents           int `json:"documents"`
}

type Status struct {
	Digest        string `json:"digest"`
	SchemaVersion string `json:"schema_version"`
	Storage       string `json:"storage"`
	Counts        Counts `json:"counts"`
}

type Store struct {
	db     *sql.DB
	status Status
}

var memoryStoreSequence uint64

func newStore(ctx context.Context, digest string, specs []specparse.Spec) (*Store, error) {
	dsn := fmt.Sprintf("file:spec-rag-%s-%d?mode=memory", digest, atomic.AddUint64(&memoryStoreSequence, 1))
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// An in-memory SQLite database belongs to one connection. This also makes
	// foreign-key and query-only pragmas apply to every operation.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if err := build(ctx, db, digest, specs); err != nil {
		_ = db.Close()
		return nil, err
	}
	if _, err := db.ExecContext(ctx, `PRAGMA query_only = ON`); err != nil {
		_ = db.Close()
		return nil, err
	}
	status, err := readStatus(ctx, db)
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Store{db: db, status: status}, nil
}

func (s *Store) Close() error   { return s.db.Close() }
func (s *Store) Status() Status { return s.status }

func build(ctx context.Context, db *sql.DB, digest string, specs []specparse.Spec) error {
	if _, err := db.ExecContext(ctx, `PRAGMA temp_store = MEMORY`); err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx, `PRAGMA foreign_keys = ON`); err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx, schemaSQL); err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO meta(key, value) VALUES ('digest', ?), ('schema_version', ?)`, digest, SchemaVersion); err != nil {
		return err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, spec := range specs {
		contextText := featureContext(spec)
		if _, err := tx.ExecContext(ctx, `INSERT INTO features(slug, title, status, source_path, overview, context, traceability) VALUES (?, ?, ?, ?, ?, ?, ?)`, spec.Slug, spec.Title, spec.Status, spec.Path, spec.Overview, contextText, spec.Traceability); err != nil {
			return err
		}
		featureSearchText := strings.Join(nonEmpty([]string{spec.Title, spec.Slug, spec.Status, spec.Overview, contextText, spec.Traceability}), "\n")
		if err := insertSearch(ctx, tx, searchDocument{ID: "feature:" + spec.Slug, Kind: "feature", FeatureSlug: spec.Slug, Title: spec.Title, DisplayText: spec.Overview, SearchText: featureSearchText, Status: spec.Status, SourcePath: spec.Path}); err != nil {
			return err
		}
		for i, limitation := range spec.Limitations {
			if _, err := tx.ExecContext(ctx, `INSERT INTO limitations(feature_slug, ordinal, text) VALUES (?, ?, ?)`, spec.Slug, i+1, limitation); err != nil {
				return err
			}
			searchText := strings.Join(nonEmpty([]string{spec.Title, spec.Overview, contextText, limitation, spec.Traceability}), "\n")
			if err := insertSearch(ctx, tx, searchDocument{ID: fmt.Sprintf("limitation:%s:%d", spec.Slug, i+1), Kind: "limitation", FeatureSlug: spec.Slug, Title: "Limitation", DisplayText: limitation, SearchText: searchText, Status: spec.Status, SourcePath: spec.Path}); err != nil {
				return err
			}
		}
		verificationByID := map[string]specparse.Verification{}
		for _, row := range spec.Verification {
			verificationByID[row.RequirementID] = row
		}
		for _, req := range spec.Requirements {
			if _, err := tx.ExecContext(ctx, `INSERT INTO requirements(id, feature_slug, category, title, statement, ordinal, source_path) VALUES (?, ?, ?, ?, ?, ?, ?)`, req.ID, spec.Slug, req.Category, req.Title, req.Statement, req.Order, spec.Path); err != nil {
				return err
			}
			row := verificationByID[req.ID]
			if _, err := tx.ExecContext(ctx, `INSERT INTO verification(requirement_id, method, evidence_target, status) VALUES (?, ?, ?, ?)`, row.RequirementID, row.Method, row.EvidenceTarget, row.Status); err != nil {
				return err
			}
			searchText := strings.Join(nonEmpty([]string{spec.Title, spec.Slug, spec.Status, req.ID, req.Title, req.Category, req.Statement, row.Method, row.EvidenceTarget, row.Status, spec.Traceability}), "\n")
			if err := insertSearch(ctx, tx, searchDocument{ID: req.ID, Kind: "requirement", FeatureSlug: spec.Slug, RequirementID: req.ID, Title: req.Title, DisplayText: req.Statement, SearchText: searchText, Status: spec.Status, EvidenceStatus: row.Status, SourcePath: spec.Path}); err != nil {
				return err
			}
		}
		for _, req := range spec.RetiredRequirements {
			var replacement any
			if req.ReplacementID != "" {
				replacement = req.ReplacementID
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO retired_requirements(id, feature_slug, retirement_date, reason, replacement_id, ordinal, source_path) VALUES (?, ?, ?, ?, ?, ?, ?)`, req.ID, spec.Slug, req.RetirementDate, req.Reason, replacement, req.Order, spec.Path); err != nil {
				return err
			}
			displayText := retiredDisplayText(req)
			searchText := strings.Join(nonEmpty([]string{spec.Title, spec.Slug, spec.Status, req.ID, req.RetirementDate, req.Reason, req.ReplacementID, spec.Traceability}), "\n")
			if err := insertSearch(ctx, tx, searchDocument{ID: req.ID, Kind: "retired_requirement", FeatureSlug: spec.Slug, RequirementID: req.ID, Title: "Retired requirement", DisplayText: displayText, SearchText: searchText, Status: spec.Status, SourcePath: spec.Path}); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

type searchDocument struct {
	ID, Kind, FeatureSlug, RequirementID, Title, DisplayText, SearchText, Status, EvidenceStatus, SourcePath string
}

func insertSearch(ctx context.Context, tx *sql.Tx, doc searchDocument) error {
	var reqID any
	if doc.RequirementID != "" {
		reqID = doc.RequirementID
	}
	var evidence any
	if doc.EvidenceStatus != "" {
		evidence = doc.EvidenceStatus
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO search_documents(id, kind, feature_slug, requirement_id, title, display_text, search_text, status, evidence_status, source_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, doc.ID, doc.Kind, doc.FeatureSlug, reqID, doc.Title, doc.DisplayText, doc.SearchText, doc.Status, evidence, doc.SourcePath); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO search_fts(id, kind, feature_slug, title, search_text, status, evidence_status) VALUES (?, ?, ?, ?, ?, ?, ?)`, doc.ID, doc.Kind, doc.FeatureSlug, doc.Title, doc.SearchText, doc.Status, doc.EvidenceStatus)
	return err
}

func featureContext(spec specparse.Spec) string {
	var b strings.Builder
	appendList := func(title string, values []string) {
		if len(values) == 0 {
			return
		}
		b.WriteString(title + ":\n")
		for _, value := range values {
			fmt.Fprintf(&b, "- %s\n", value)
		}
	}
	appendList("In scope", spec.InScope)
	appendList("Out of scope", spec.OutOfScope)
	if len(spec.Actors) > 0 {
		b.WriteString("Actors and external systems:\n")
		for _, actor := range spec.Actors {
			if actor.Label != "" {
				fmt.Fprintf(&b, "- %s: %s\n", actor.Label, actor.Text)
			} else {
				fmt.Fprintf(&b, "- %s\n", actor.Text)
			}
		}
	}
	if len(spec.Terms) > 0 {
		b.WriteString("Terms:\n")
		for _, term := range spec.Terms {
			fmt.Fprintf(&b, "- %s: %s\n", term.Term, term.Meaning)
		}
	}
	appendList("Assumptions and constraints", spec.Assumptions)
	return strings.TrimSpace(b.String())
}

func retiredDisplayText(req specparse.RetiredRequirement) string {
	text := fmt.Sprintf("Retired on %s: %s", req.RetirementDate, req.Reason)
	if req.ReplacementID != "" {
		text += "; replacement: " + req.ReplacementID
	}
	return text
}

func readStatus(ctx context.Context, db *sql.DB) (Status, error) {
	status := Status{Storage: "memory", SchemaVersion: SchemaVersion}
	if err := db.QueryRowContext(ctx, `SELECT value FROM meta WHERE key='digest'`).Scan(&status.Digest); err != nil {
		return Status{}, err
	}
	if err := db.QueryRowContext(ctx, `SELECT value FROM meta WHERE key='schema_version'`).Scan(&status.SchemaVersion); err != nil {
		return Status{}, err
	}
	queries := []struct {
		query string
		dest  *int
	}{
		{`SELECT count(*) FROM features`, &status.Counts.Features},
		{`SELECT count(*) FROM requirements`, &status.Counts.Requirements},
		{`SELECT count(*) FROM retired_requirements`, &status.Counts.RetiredRequirements},
		{`SELECT count(*) FROM verification`, &status.Counts.Verification},
		{`SELECT count(*) FROM limitations`, &status.Counts.Limitations},
		{`SELECT count(*) FROM search_documents`, &status.Counts.Documents},
	}
	for _, query := range queries {
		if err := db.QueryRowContext(ctx, query.query).Scan(query.dest); err != nil {
			return Status{}, err
		}
	}
	return status, nil
}

func CheckFTS5(ctx context.Context) error {
	db, err := sql.Open("sqlite", "file:spec-rag-fts-check?mode=memory")
	if err == nil {
		db.SetMaxOpenConns(1)
		db.SetMaxIdleConns(1)
	}
	if err != nil {
		return err
	}
	defer db.Close()
	if _, err := db.ExecContext(ctx, `PRAGMA temp_store = MEMORY`); err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, `CREATE VIRTUAL TABLE fts_check USING fts5(text); INSERT INTO fts_check(text) VALUES ('hello world');`)
	if err != nil {
		return err
	}
	var text string
	return db.QueryRowContext(ctx, `SELECT text FROM fts_check WHERE fts_check MATCH 'hello'`).Scan(&text)
}

func IsNotFound(err error) bool { return errors.Is(err, sql.ErrNoRows) }

func ftsTokens(input string) []string {
	var tokens []string
	var current []rune
	flush := func() {
		if len(current) == 0 {
			return
		}
		tokens = append(tokens, string(current))
		current = nil
	}
	for _, r := range strings.ToLower(input) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			current = append(current, r)
		} else {
			flush()
		}
	}
	flush()
	return tokens
}

func ftsQuery(tokens []string, op string) string {
	quoted := make([]string, len(tokens))
	for i, token := range tokens {
		quoted[i] = `"` + strings.ReplaceAll(token, `"`, `""`) + `"`
	}
	return strings.Join(quoted, " "+op+" ")
}

func nonEmpty(values []string) []string {
	out := values[:0]
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			out = append(out, value)
		}
	}
	return out
}
