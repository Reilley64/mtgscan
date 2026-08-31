package specparse

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"
)

type SourceFile struct {
	Path  string
	Slug  string
	Bytes []byte
}

func LoadValid(repoRoot string) ([]Spec, error) {
	sources, err := ReadSources(repoRoot)
	if err != nil {
		return nil, err
	}
	specs, err := ParseSources(sources)
	if err != nil {
		return nil, err
	}
	if err := ValidateAll(specs); err != nil {
		return nil, err
	}
	return specs, nil
}

func ReadSources(repoRoot string) ([]SourceFile, error) {
	pattern := filepath.Join(repoRoot, "docs", "features", "*", "spec.md")
	paths, err := filepath.Glob(pattern)
	if err != nil {
		return nil, err
	}
	sort.Strings(paths)
	var sources []SourceFile
	for _, path := range paths {
		if filepath.Base(filepath.Dir(path)) == "_template" {
			continue
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		rel, err := filepath.Rel(repoRoot, path)
		if err != nil {
			return nil, err
		}
		sources = append(sources, SourceFile{Path: filepath.ToSlash(rel), Slug: filepath.Base(filepath.Dir(path)), Bytes: data})
	}
	return sources, nil
}

func ParseSources(sources []SourceFile) ([]Spec, error) {
	specs := make([]Spec, 0, len(sources))
	for _, source := range sources {
		spec, err := ParseMarkdown(source.Path, source.Slug, source.Bytes)
		if err != nil {
			return nil, err
		}
		specs = append(specs, spec)
	}
	return specs, nil
}

func ParseMarkdown(relPath, slug string, data []byte) (Spec, error) {
	text := strings.ReplaceAll(string(bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))), "\r\n", "\n")
	spec := Spec{Path: relPath, Slug: slug}
	lines := strings.Split(text, "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "# ") {
			spec.Title = strings.TrimSpace(strings.TrimPrefix(line, "# "))
			break
		}
	}
	if spec.Title == "" {
		return Spec{}, parseError(relPath, "missing feature title")
	}
	status := regexp.MustCompile(`(?m)^Status:\s*(\S+)\s*$`).FindStringSubmatch(text)
	if len(status) != 2 {
		return Spec{}, parseError(relPath, "missing Status line")
	}
	spec.Status = status[1]
	path := regexp.MustCompile("(?m)^Spec path:\\s*`([^`]+)`\\s*$").FindStringSubmatch(text)
	if len(path) != 2 {
		return Spec{}, parseError(relPath, "missing Spec path line")
	}
	if path[1] != relPath {
		return Spec{}, parseError(relPath, "declared Spec path %q does not match file path %q", path[1], relPath)
	}

	sections, err := requiredSections(relPath, lines)
	if err != nil {
		return Spec{}, err
	}
	scopeSubsections := splitSections(sections["Scope"], 3)
	scopeCounts := headingCounts(sections["Scope"], 3)
	for _, heading := range []string{"In scope", "Out of scope"} {
		if scopeCounts[heading] == 0 {
			return Spec{}, parseError(relPath, "missing required Scope subsection %q", heading)
		}
		if scopeCounts[heading] > 1 {
			return Spec{}, parseError(relPath, "duplicate required Scope subsection %q", heading)
		}
	}
	spec.Overview = cleanBlock(sections["Overview"])
	spec.InScope = parseBullets(scopeSubsections["In scope"])
	spec.OutOfScope = parseBullets(scopeSubsections["Out of scope"])
	spec.Actors = parseLabeledBullets(sections["Actors and external systems"])
	terms, err := parseTermTable(relPath, sections["Terms"])
	if err != nil {
		return Spec{}, err
	}
	spec.Terms = terms
	spec.Assumptions = parseBullets(sections["Assumptions and constraints"])
	spec.Limitations = parseBullets(sections["Current limitations"])
	spec.Traceability = cleanBlock(sections["Traceability"])

	reqs, err := parseRequirements(relPath, sections["Requirements"])
	if err != nil {
		return Spec{}, err
	}
	spec.Requirements = reqs
	verification, err := parseVerification(relPath, sections["Verification matrix"])
	if err != nil {
		return Spec{}, err
	}
	spec.Verification = verification
	retired, err := parseRetiredRequirements(relPath, sections["Retired requirements"])
	if err != nil {
		return Spec{}, err
	}
	spec.RetiredRequirements = retired
	return spec, nil
}

func requiredSections(path string, lines []string) (map[string][]string, error) {
	sections := splitSections(lines, 2)
	required := []string{"Overview", "Scope", "Actors and external systems", "Terms", "Assumptions and constraints", "Current limitations", "Requirements", "Verification matrix", "Traceability", "Retired requirements"}
	counts := headingCounts(lines, 2)
	for _, heading := range required {
		if counts[heading] == 0 {
			return nil, parseError(path, "missing required section %q", heading)
		}
		if counts[heading] > 1 {
			return nil, parseError(path, "duplicate required section %q", heading)
		}
	}
	return sections, nil
}

func headingCounts(lines []string, level int) map[string]int {
	marker := strings.Repeat("#", level) + " "
	counts := map[string]int{}
	for _, line := range lines {
		if strings.HasPrefix(line, marker) && !strings.HasPrefix(line, marker+"#") {
			counts[strings.TrimSpace(strings.TrimPrefix(line, marker))]++
		}
	}
	return counts
}

func splitSections(lines []string, level int) map[string][]string {
	marker := strings.Repeat("#", level) + " "
	sections := map[string][]string{}
	current := ""
	for _, line := range lines {
		if strings.HasPrefix(line, marker) && !strings.HasPrefix(line, marker+"#") {
			current = strings.TrimSpace(strings.TrimPrefix(line, marker))
			sections[current] = nil
			continue
		}
		if current != "" {
			sections[current] = append(sections[current], line)
		}
	}
	return sections
}

func cleanBlock(lines []string) string {
	var out []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			if len(out) > 0 && out[len(out)-1] != "" {
				out = append(out, "")
			}
			continue
		}
		out = append(out, trimmed)
	}
	for len(out) > 0 && out[len(out)-1] == "" {
		out = out[:len(out)-1]
	}
	return strings.Join(out, "\n")
}

func parseBullets(lines []string) []string {
	var bullets []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "|") {
			continue
		}
		if strings.HasPrefix(trimmed, "- ") {
			bullets = append(bullets, strings.TrimSpace(strings.TrimPrefix(trimmed, "- ")))
			continue
		}
		if len(bullets) > 0 && !isHeading(trimmed) {
			bullets[len(bullets)-1] = strings.TrimSpace(bullets[len(bullets)-1] + " " + trimmed)
		}
	}
	return bullets
}

func parseLabeledBullets(lines []string) []LabeledText {
	bullets := parseBullets(lines)
	items := make([]LabeledText, 0, len(bullets))
	for _, bullet := range bullets {
		label, text, ok := strings.Cut(bullet, ":")
		if !ok {
			items = append(items, LabeledText{Text: bullet})
			continue
		}
		items = append(items, LabeledText{Label: strings.TrimSpace(label), Text: strings.TrimSpace(text)})
	}
	return items
}

func parseTermTable(path string, lines []string) ([]Term, error) {
	rows, err := parseStrictTable(path, "Terms", lines, []string{"Term", "Meaning"}, false)
	if err != nil {
		return nil, err
	}
	terms := make([]Term, 0, len(rows))
	for _, cells := range rows {
		terms = append(terms, Term{Term: cells[0], Meaning: cells[1]})
	}
	return terms, nil
}

func parseRequirements(path string, lines []string) ([]Requirement, error) {
	var reqs []Requirement
	category := ""
	for i := 0; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if strings.HasPrefix(line, "### ") {
			switch strings.TrimSpace(strings.TrimPrefix(line, "### ")) {
			case "Functional requirements":
				category = "Functional"
			case "Quality requirements":
				category = "Quality"
			default:
				category = ""
			}
			continue
		}
		if !strings.HasPrefix(line, "#### ") {
			continue
		}
		if category == "" {
			return nil, parseError(path, "requirement heading %q appears outside a known category", line)
		}
		heading := strings.TrimSpace(strings.TrimPrefix(line, "#### "))
		id, title, ok := strings.Cut(heading, ":")
		if !ok {
			return nil, parseError(path, "requirement heading %q must use '<ID>: <title>'", heading)
		}
		var body []string
		for j := i + 1; j < len(lines); j++ {
			next := strings.TrimSpace(lines[j])
			if strings.HasPrefix(next, "### ") || strings.HasPrefix(next, "#### ") || strings.HasPrefix(next, "## ") {
				break
			}
			body = append(body, lines[j])
		}
		statement := collapseProse(body)
		if statement == "" {
			return nil, parseError(path, "requirement %s has no statement", strings.TrimSpace(id))
		}
		reqs = append(reqs, Requirement{ID: strings.TrimSpace(id), Title: strings.TrimSpace(title), Category: category, Statement: statement, Order: len(reqs) + 1})
	}
	return reqs, nil
}

func parseVerification(path string, lines []string) ([]Verification, error) {
	rows, err := parseStrictTable(path, "Verification matrix", lines, []string{"Requirement ID", "Verification method", "Evidence target", "Status"}, false)
	if err != nil {
		return nil, err
	}
	verification := make([]Verification, 0, len(rows))
	for _, cells := range rows {
		if cells[0] == "" {
			return nil, parseError(path, "Verification matrix row has empty requirement ID")
		}
		verification = append(verification, Verification{RequirementID: cells[0], Method: cells[1], EvidenceTarget: cells[2], Status: cells[3]})
	}
	return verification, nil
}

func parseRetiredRequirements(path string, lines []string) ([]RetiredRequirement, error) {
	rows, err := parseStrictTable(path, "Retired requirements", lines, []string{"Requirement ID", "Retirement date", "Reason retired", "Replacement ID"}, true)
	if err != nil {
		return nil, err
	}
	retired := make([]RetiredRequirement, 0, len(rows))
	for _, cells := range rows {
		replacement := cells[3]
		if strings.EqualFold(replacement, "none") || replacement == "—" || replacement == "-" {
			replacement = ""
		}
		retired = append(retired, RetiredRequirement{ID: cells[0], RetirementDate: cells[1], Reason: cells[2], ReplacementID: replacement, Order: len(retired) + 1})
	}
	return retired, nil
}

func parseStrictTable(path, section string, lines []string, expectedHeader []string, allowNone bool) ([][]string, error) {
	tableStart := -1
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if allowNone && tableStart == -1 && strings.EqualFold(trimmed, "None.") {
			return nil, nil
		}
		if strings.HasPrefix(trimmed, "|") {
			tableStart = i
			break
		}
	}
	if tableStart == -1 {
		return nil, parseError(path, "%s must contain a table with header %q", section, strings.Join(expectedHeader, " | "))
	}
	header, ok := splitTableCells(strings.TrimSpace(lines[tableStart]))
	if !ok || !sameCells(header, expectedHeader) {
		return nil, parseError(path, "%s line %d must be header %q", section, tableStart+1, strings.Join(expectedHeader, " | "))
	}
	separatorLine := -1
	for i := tableStart + 1; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) == "" {
			continue
		}
		separatorLine = i
		break
	}
	if separatorLine == -1 {
		return nil, parseError(path, "%s missing separator row after header", section)
	}
	separator, ok := splitTableCells(strings.TrimSpace(lines[separatorLine]))
	if !ok || len(separator) != len(expectedHeader) || !isSeparatorRow(separator) {
		return nil, parseError(path, "%s line %d must be a Markdown separator row", section, separatorLine+1)
	}
	var rows [][]string
	for i := separatorLine + 1; i < len(lines); i++ {
		trimmed := strings.TrimSpace(lines[i])
		if trimmed == "" {
			break
		}
		if !strings.HasPrefix(trimmed, "|") {
			return nil, parseError(path, "%s line %d must be a table row", section, i+1)
		}
		cells, ok := splitTableCells(trimmed)
		if !ok {
			return nil, parseError(path, "%s line %d is not a valid table row", section, i+1)
		}
		if isSeparatorRow(cells) {
			return nil, parseError(path, "%s line %d has an unexpected separator row", section, i+1)
		}
		if len(cells) != len(expectedHeader) {
			return nil, parseError(path, "%s line %d has %d cells; expected %d", section, i+1, len(cells), len(expectedHeader))
		}
		rows = append(rows, cells)
	}
	return rows, nil
}

func sameCells(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range want {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}

func splitTableCells(line string) ([]string, bool) {
	var cells []string
	var cell []rune
	escaped := false
	inCode := false
	seenSeparator := false
	for i, r := range line {
		if escaped {
			cell = append(cell, r)
			escaped = false
			continue
		}
		if r == '\\' {
			escaped = true
			continue
		}
		if r == '`' {
			inCode = !inCode
			cell = append(cell, r)
			continue
		}
		if r == '|' && !inCode {
			if i > 0 {
				cells = append(cells, strings.TrimSpace(string(cell)))
				cell = nil
			}
			seenSeparator = true
			continue
		}
		cell = append(cell, r)
	}
	if len(cell) > 0 || !strings.HasSuffix(line, "|") {
		cells = append(cells, strings.TrimSpace(string(cell)))
	}
	return cells, seenSeparator
}

func isSeparatorRow(cells []string) bool {
	if len(cells) == 0 {
		return false
	}
	for _, cell := range cells {
		if !isDelimiterCell(cell) {
			return false
		}
	}
	return true
}

func isDelimiterCell(cell string) bool {
	trimmed := strings.TrimSpace(cell)
	if strings.HasPrefix(trimmed, ":") {
		trimmed = strings.TrimPrefix(trimmed, ":")
	}
	if strings.HasSuffix(trimmed, ":") {
		trimmed = strings.TrimSuffix(trimmed, ":")
	}
	if len(trimmed) < 3 {
		return false
	}
	for _, r := range trimmed {
		if r != '-' {
			return false
		}
	}
	return true
}

func collapseProse(lines []string) string {
	var words []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "- "))
		if trimmed != "" {
			words = append(words, trimmed)
		}
	}
	return strings.Join(words, " ")
}

func isHeading(line string) bool {
	return strings.HasPrefix(line, "#")
}

func parseError(path, format string, args ...any) error {
	return fmt.Errorf("%s: %s", path, fmt.Sprintf(format, args...))
}

func featurePrefix(slug string) string {
	return strings.ToUpper(slug) + "-REQ-"
}

func countWord(text, word string) int {
	lowerWord := strings.ToLower(word)
	count := 0
	var token []rune
	flush := func() {
		if len(token) == 0 {
			return
		}
		if strings.ToLower(string(token)) == lowerWord {
			count++
		}
		token = nil
	}
	for _, r := range text {
		if isWordRune(r) {
			token = append(token, r)
		} else {
			flush()
		}
	}
	flush()
	return count
}

func isWordRune(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_'
}
