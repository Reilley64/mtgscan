package specparse

import "path/filepath"

type Spec struct {
	Title        string
	Slug         string
	Status       string
	Path         string
	Overview     string
	InScope      []string
	OutOfScope   []string
	Actors       []LabeledText
	Terms        []Term
	Assumptions  []string
	Limitations  []string
	Traceability string

	Requirements        []Requirement
	Verification        []Verification
	RetiredRequirements []RetiredRequirement
}

type Requirement struct {
	ID        string
	Title     string
	Category  string
	Statement string
	Order     int
}

type Verification struct {
	RequirementID  string
	Method         string
	EvidenceTarget string
	Status         string
}

type RetiredRequirement struct {
	ID             string
	RetirementDate string
	Reason         string
	ReplacementID  string
	Order          int
}

type LabeledText struct {
	Label string
	Text  string
}

type Term struct {
	Term    string
	Meaning string
}

func (s Spec) FeaturePrefix() string {
	return featurePrefix(s.Slug)
}

func relativeSpecPath(slug string) string {
	return filepath.ToSlash(filepath.Join("docs", "features", slug, "spec.md"))
}
