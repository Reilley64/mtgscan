package main

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunValidateRealSpecs(t *testing.T) {
	if err := runValidate(context.Background(), []string{"--repo-root", repoRootFromTest(t)}); err != nil {
		t.Fatal(err)
	}
}

func TestCommandsBuildInMemoryAndUsageHasNoCacheFlag(t *testing.T) {
	repoRoot := repoRootFromTest(t)
	if err := runIndex(context.Background(), []string{"--repo-root", repoRoot}); err != nil {
		t.Fatal(err)
	}
	cacheArgs := []string{"--repo-root", repoRoot, "--cache-dir", t.TempDir()}
	if err := runIndex(context.Background(), cacheArgs); err == nil {
		t.Fatal("index accepted removed cache flag")
	}
	if err := runServe(context.Background(), cacheArgs); err == nil {
		t.Fatal("serve accepted removed cache flag")
	}
	usageText := captureStderr(t, usage)
	if strings.Contains(usageText, "cache-dir") || !strings.Contains(usageText, "spec-rag index [--repo-root PATH]") {
		t.Fatalf("unexpected usage: %s", usageText)
	}
}

func captureStderr(t *testing.T, fn func()) string {
	t.Helper()
	old := os.Stderr
	read, write, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stderr = write
	fn()
	_ = write.Close()
	os.Stderr = old
	data, err := io.ReadAll(read)
	_ = read.Close()
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
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
