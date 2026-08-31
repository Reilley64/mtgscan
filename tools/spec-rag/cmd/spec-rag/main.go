package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/Reilley64/mtgscan/tools/spec-rag/internal/index"
	"github.com/Reilley64/mtgscan/tools/spec-rag/internal/mcpserver"
	"github.com/Reilley64/mtgscan/tools/spec-rag/internal/specparse"
)

func main() {
	log.SetOutput(os.Stderr)
	log.SetFlags(0)
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	ctx := context.Background()
	var err error
	switch os.Args[1] {
	case "validate":
		err = runValidate(ctx, os.Args[2:])
	case "index":
		err = runIndex(ctx, os.Args[2:])
	case "serve":
		err = runServe(ctx, os.Args[2:])
	case "help", "-h", "--help":
		usage()
		return
	default:
		usage()
		err = fmt.Errorf("unknown command %q", os.Args[1])
	}
	if err != nil {
		log.Printf("spec-rag: %v", err)
		os.Exit(1)
	}
}

func runValidate(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("validate", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	repoRootFlag := fs.String("repo-root", "", "repository root override")
	if err := fs.Parse(args); err != nil {
		return err
	}
	repoRoot, err := repoRoot(*repoRootFlag)
	if err != nil {
		return err
	}
	specs, err := specparse.LoadValid(repoRoot)
	if err != nil {
		return err
	}
	fmt.Printf("valid specs=%d repo_root=%s\n", len(specs), repoRoot)
	_ = ctx
	return nil
}

func runIndex(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("index", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	repoRootFlag := fs.String("repo-root", "", "repository root override")
	if err := fs.Parse(args); err != nil {
		return err
	}
	repoRoot, err := repoRoot(*repoRootFlag)
	if err != nil {
		return err
	}
	manager := index.NewManager(repoRoot)
	defer manager.Close()
	status, err := manager.Status(ctx)
	if err != nil {
		return err
	}
	fmt.Printf("storage=%s\n", status.Storage)
	fmt.Printf("digest=%s\n", status.Digest)
	fmt.Printf("schema_version=%s\n", status.SchemaVersion)
	fmt.Printf("features=%d requirements=%d retired_requirements=%d verification=%d limitations=%d documents=%d\n", status.Counts.Features, status.Counts.Requirements, status.Counts.RetiredRequirements, status.Counts.Verification, status.Counts.Limitations, status.Counts.Documents)
	return nil
}

func runServe(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	repoRootFlag := fs.String("repo-root", "", "repository root override")
	if err := fs.Parse(args); err != nil {
		return err
	}
	repoRoot, err := repoRoot(*repoRootFlag)
	if err != nil {
		return err
	}
	manager := index.NewManager(repoRoot)
	defer manager.Close()
	if _, err := manager.Status(ctx); err != nil {
		return err
	}
	server := mcpserver.New(manager)
	return server.Run(ctx, &mcp.StdioTransport{})
}

func repoRoot(override string) (string, error) {
	if override != "" {
		return filepath.Abs(override)
	}
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	return discoverRepoRoot(cwd)
}

func discoverRepoRoot(start string) (string, error) {
	dir, err := filepath.Abs(start)
	if err != nil {
		return "", err
	}
	for {
		if hasFeatureSpecs(dir) && hasGitMarker(dir) {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("could not discover repo root from %s", start)
		}
		dir = parent
	}
}

func hasFeatureSpecs(dir string) bool {
	info, err := os.Stat(filepath.Join(dir, "docs", "features"))
	return err == nil && info.IsDir()
}

func hasGitMarker(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, ".git"))
	return err == nil
}

func usage() {
	fmt.Fprintf(os.Stderr, `spec-rag validates, indexes, and serves canonical feature specs.

Usage:
  spec-rag validate [--repo-root PATH]
  spec-rag index [--repo-root PATH]
  spec-rag serve [--repo-root PATH]
`)
}
