package specparse

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var allowedSpecStatuses = map[string]bool{"Draft": true, "Active": true, "Retired": true}
var allowedMethods = map[string]bool{"Test": true, "Inspection": true, "Demonstration": true, "Analysis": true}
var allowedEvidenceStatuses = map[string]bool{"Existing": true, "Partial": true, "Gap": true, "Planned": true}
var reqIDPattern = regexp.MustCompile(`^[A-Z0-9-]+-REQ-\d{3}$`)
var retirementDatePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func ValidateAll(specs []Spec) error {
	seen := map[string]string{}
	var problems []string
	for i := range specs {
		spec := specs[i]
		problems = append(problems, validateSpec(spec)...)
		for _, req := range spec.Requirements {
			if previous, ok := seen[req.ID]; ok {
				problems = append(problems, fmt.Sprintf("%s: requirement ID %s duplicates %s", spec.Path, req.ID, previous))
			} else {
				seen[req.ID] = spec.Path
			}
		}
		for _, req := range spec.RetiredRequirements {
			if previous, ok := seen[req.ID]; ok {
				problems = append(problems, fmt.Sprintf("%s: retired requirement ID %s duplicates or reuses %s", spec.Path, req.ID, previous))
			} else {
				seen[req.ID] = spec.Path
			}
		}
	}
	if len(problems) > 0 {
		return fmt.Errorf("%s", strings.Join(problems, "\n"))
	}
	return nil
}

func validateSpec(spec Spec) []string {
	var problems []string
	add := func(format string, args ...any) {
		problems = append(problems, fmt.Sprintf("%s: %s", spec.Path, fmt.Sprintf(format, args...)))
	}
	if !allowedSpecStatuses[spec.Status] {
		add("status %q is not allowed", spec.Status)
	}
	if spec.Path != relativeSpecPath(spec.Slug) {
		add("path must be %s for slug %s", relativeSpecPath(spec.Slug), spec.Slug)
	}
	if spec.Overview == "" {
		add("overview is required")
	}
	if spec.Status != "Retired" && len(spec.Requirements) == 0 {
		add("at least one active requirement is required unless the feature is Retired")
	}
	for _, limitation := range spec.Limitations {
		if countWord(limitation, "shall") > 0 {
			add("limitation contains shall: %q", limitation)
		}
	}
	prefix := spec.FeaturePrefix()
	previousActive := 0
	for _, req := range spec.Requirements {
		number, ok := validateRequirementID(req.ID, prefix)
		if !ok {
			if !reqIDPattern.MatchString(req.ID) {
				add("requirement ID %q is not in <FEATURE>-REQ-001 format", req.ID)
			}
			if !strings.HasPrefix(req.ID, prefix) {
				add("requirement ID %s does not use feature prefix %s", req.ID, prefix)
			}
		} else if number <= previousActive {
			add("requirement ID %s is not strictly increasing in source order", req.ID)
		}
		if ok {
			previousActive = number
		}
		if req.Category != "Functional" && req.Category != "Quality" {
			add("requirement %s category %q is not allowed", req.ID, req.Category)
		}
		if got := countWord(req.Statement, "shall"); got != 1 {
			add("requirement %s must contain exactly one shall, found %d", req.ID, got)
		}
	}
	previousRetired := 0
	for _, req := range spec.RetiredRequirements {
		number, ok := validateRequirementID(req.ID, prefix)
		if !ok {
			if !reqIDPattern.MatchString(req.ID) {
				add("retired requirement ID %q is not in <FEATURE>-REQ-001 format", req.ID)
			}
			if !strings.HasPrefix(req.ID, prefix) {
				add("retired requirement ID %s does not use feature prefix %s", req.ID, prefix)
			}
		} else if number <= previousRetired {
			add("retired requirement ID %s is not strictly increasing in source order", req.ID)
		}
		if ok {
			previousRetired = number
		}
		if req.RetirementDate == "" || !retirementDatePattern.MatchString(req.RetirementDate) || !validCalendarDate(req.RetirementDate) {
			add("retired requirement %s has invalid retirement date %q", req.ID, req.RetirementDate)
		}
		if req.Reason == "" {
			add("retired requirement %s must include a reason", req.ID)
		}
		if req.ReplacementID != "" && !reqIDPattern.MatchString(req.ReplacementID) {
			add("retired requirement %s has invalid replacement ID %q", req.ID, req.ReplacementID)
		}
	}
	seenRows := map[string]Verification{}
	for _, row := range spec.Verification {
		if !allowedMethods[row.Method] {
			add("verification row %s has unsupported method %q", row.RequirementID, row.Method)
		}
		if !allowedEvidenceStatuses[row.Status] {
			add("verification row %s has unsupported status %q", row.RequirementID, row.Status)
		}
		if _, ok := seenRows[row.RequirementID]; ok {
			add("verification row for %s appears more than once", row.RequirementID)
		}
		seenRows[row.RequirementID] = row
	}
	activeIDs := map[string]bool{}
	for _, req := range spec.Requirements {
		activeIDs[req.ID] = true
		if _, ok := seenRows[req.ID]; !ok {
			add("missing verification row for %s", req.ID)
		}
	}
	for _, row := range spec.Verification {
		if !activeIDs[row.RequirementID] {
			add("verification row references unknown active requirement %s", row.RequirementID)
		}
	}
	return problems
}

func validateRequirementID(id, prefix string) (int, bool) {
	if !reqIDPattern.MatchString(id) || !strings.HasPrefix(id, prefix) {
		return 0, false
	}
	number, err := strconv.Atoi(strings.TrimPrefix(id, prefix))
	if err != nil {
		return 0, false
	}
	return number, true
}

func validCalendarDate(value string) bool {
	parsed, err := time.Parse("2006-01-02", value)
	return err == nil && parsed.Format("2006-01-02") == value
}
