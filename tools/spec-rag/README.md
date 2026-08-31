# Spec RAG MCP developer tool

`tools/spec-rag` is a developer-only Go tool for repository agents.
It reads canonical Markdown feature specs from `docs/features/*/spec.md`.
It skips `docs/features/_template/spec.md`.
The Markdown files remain the only source of truth.

The SQLite FTS5 retrieval index exists only in process memory. SQLite temporary
storage is also memory-backed; the tool writes no database, cache, or index file.

## Build

From the repository root:

```sh
go build -o /tmp/spec-rag ./tools/spec-rag/cmd/spec-rag
```

Or from the module:

```sh
cd tools/spec-rag
go build -o /tmp/spec-rag ./cmd/spec-rag
```

## Validate specs

```sh
go run ./tools/spec-rag/cmd/spec-rag validate
```

Validation parses all canonical specs and creates no database. It succeeds with zero
canonical specs, so a repository can adopt the workflow before its first feature spec.
It checks:

- `Status: Draft|Active|Retired`;
- declared `Spec path` against the real path;
- globally unique requirement IDs;
- feature-prefixed, 3-digit numeric requirement IDs in strictly increasing source order;
- exactly one `shall` in each requirement statement;
- no `shall` in current limitations;
- strict Terms, Verification matrix, and Retired requirements tables with the documented headers, Markdown delimiter rows, and exact row widths;
- retired requirement rows with ID, real calendar retirement date, reason, and replacement ID;
- no reuse between active and retired requirement IDs;
- one verification row per active requirement and no extra rows;
- allowed verification methods (`Test`, `Inspection`, `Demonstration`, `Analysis`) and evidence statuses (`Existing`, `Partial`, `Gap`, `Planned`).

Use `--repo-root PATH` for tests or unusual worktree layouts.
Repository discovery accepts both `.git` directories and `.git` files, so Git worktrees work.

## Build the index

```sh
go run ./tools/spec-rag/cmd/spec-rag index
```

The command validates the canonical snapshot, builds the in-memory index, prints:

- `storage=memory`;
- content digest;
- schema/indexer version;
- feature, active requirement, retired requirement, verification, limitation, and search document counts.

The tool reads one immutable spec snapshot, then hashes, parses, validates, and indexes those exact bytes. The digest includes the schema/indexer version, sorted relative spec paths, and snapshot bytes. It notices committed, uncommitted, and untracked canonical spec files. The database is limited to one SQLite connection and becomes query-only after construction.

The MVP retriever is SQLite FTS5 with BM25 ranking.
Search input is tokenized before it reaches FTS, so punctuation and quotes do not create FTS syntax errors. Multiword search uses all-term matching first and falls back to any-term matching only when no all-term records exist. Queries are bounded to 1024 characters.
Exact active or retired requirement-ID lookup in search bypasses FTS. The active-only `get_requirement` tool does not return retired records.
Semantic embeddings and vector search are out of scope for this MVP.
The `index.Store` query methods are the seam for later ranking strategies.

## Serve MCP over stdio

```sh
go run ./tools/spec-rag/cmd/spec-rag serve
```

The server uses the official MCP Go SDK `github.com/modelcontextprotocol/go-sdk/mcp` and stdio transport.
It builds a current in-memory index before serving.
During long sessions, each tool call checks the content digest.
If canonical spec content changed, the server builds a new in-memory index and swaps it in safely.

Generic MCP launch configuration:

```json
{
  "mcpServers": {
    "spec-rag": {
      "command": "/absolute/path/to/spec-rag",
      "args": ["serve", "--repo-root", "/absolute/path/to/repo"]
    }
  }
}
```

For `go run` during development:

```json
{
  "mcpServers": {
    "spec-rag": {
      "command": "go",
      "args": ["run", "./tools/spec-rag/cmd/spec-rag", "serve"],
      "cwd": "/absolute/path/to/repo"
    }
  }
}
```

## Development checks

Repository root form:

```sh
gofmt -w tools/spec-rag/cmd/spec-rag/*.go tools/spec-rag/internal/specparse/*.go tools/spec-rag/internal/index/*.go tools/spec-rag/internal/mcpserver/*.go
go test ./tools/spec-rag/...
go test -race ./tools/spec-rag/...
go vet ./tools/spec-rag/...
go build -o /tmp/spec-rag ./tools/spec-rag/cmd/spec-rag
```

Module form:

```sh
cd tools/spec-rag
gofmt -w cmd/spec-rag/*.go internal/specparse/*.go internal/index/*.go internal/mcpserver/*.go
go test ./...
go test -race ./...
go vet ./...
go build -o /tmp/spec-rag ./cmd/spec-rag
```

## MCP tools

All tools are read-only and annotated with `readOnlyHint: true`, `idempotentHint: true`, `destructiveHint: false`, and `openWorldHint: false`.
The server exposes no raw SQL, writes, arbitrary file reads, or LLM-triggered reindex mutation tool.

### `search_feature_specs`

Input:

```json
{
  "query": "card collection",
  "feature": "card-collection",
  "kind": "requirement",
  "spec_status": "Draft",
  "evidence_status": "Partial",
  "limit": 5
}
```

Only `query` is required.
`kind` can be `feature`, `requirement`, `limitation`, or `retired_requirement`.
The limit defaults to 5 and is capped at 20. Whitespace-only, punctuation-only, and over-1024-character queries return a tool error.

Output contains ranked minimal records:

- stable ID;
- kind;
- feature slug;
- title;
- text;
- spec status;
- evidence status when applicable;
- source path.

Normal search results do not include BM25 rank, counts, storage, or full index metadata. Result order carries ranking. Returned text is concise display content, while the internal FTS document contains extra context for retrieval.

### `get_requirement`

Input:

```json
{ "id": "CARD-COLLECTION-REQ-001" }
```

Output includes statement, category, verification method, evidence target, evidence status, and source path.
This tool is active-only. Retired requirement IDs are searchable with `search_feature_specs` and return `kind: "retired_requirement"`. Missing IDs return a tool error, not a panic.

### `get_feature`

Input:

```json
{ "slug": "card-collection" }
```

Output includes concise context, traceability, current limitations, source path, and status.
It does not return the full raw Markdown file.

### `list_evidence_gaps`

Input:

```json
{
  "feature": "card-collection",
  "evidence_statuses": ["Gap", "Partial"],
  "limit": 5
}
```

All fields are optional.
Evidence statuses default to `Gap` and `Partial`. `Planned` and `Existing` can be requested explicitly.

### `get_index_status`

Input:

```json
{}
```

Output includes current digest, schema/indexer version, `storage: "memory"`, and counts. Use this tool when freshness diagnostics are needed.
