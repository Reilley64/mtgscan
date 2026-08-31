package index

import (
	"crypto/sha256"
	"encoding/hex"
	"github.com/Reilley64/mtgscan/tools/spec-rag/internal/specparse"
)

const SchemaVersion = "spec-rag-schema-v2"

func ContentDigest(repoRoot string) (string, []string, error) {
	sources, err := specparse.ReadSources(repoRoot)
	if err != nil {
		return "", nil, err
	}
	return DigestSources(sources)
}

func DigestSources(sources []specparse.SourceFile) (string, []string, error) {
	h := sha256.New()
	_, _ = h.Write([]byte(SchemaVersion))
	rels := make([]string, 0, len(sources))
	for _, source := range sources {
		rels = append(rels, source.Path)
		_, _ = h.Write([]byte("\x00path:" + source.Path + "\x00"))
		_, _ = h.Write(source.Bytes)
	}
	return hex.EncodeToString(h.Sum(nil)), rels, nil
}
