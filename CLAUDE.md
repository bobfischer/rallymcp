# CLAUDE.md

## Project Overview

Hosted MCP server wrapping the Rally REST API. Stateless proxy — no database, no session state. Rally is the system of record.

## Tech Stack

- TypeScript, Node.js (ESM with `"type": "module"`)
- Express 5, @modelcontextprotocol/sdk, Zod
- Vitest for testing

## Commands

- `npm test` — run all tests
- `npm run build` — compile TypeScript to dist/
- `npm run dev` — run with tsx (hot reload)
- `npm start` — run compiled dist/index.js

## Architecture

```
src/
├── index.ts              # Express + MCP server (factory pattern, stateless)
├── rally-client.ts       # Rally API client (rallyGet, rallyPost, rallyPut, rallyDelete)
├── resolve-artifact.ts   # FormattedID → type/objectId resolver
└── tools/                # One file per MCP tool, each exports handler + register function
```

- **Stateless per request:** Each POST to `/mcp` creates a fresh McpServer + transport, cleaned up on response close.
- **Auth:** All requests use `ZSESSIONID` header. Mutations fetch a security token via `/security/authorize` and append `?key=<token>`.
- **Error handling:** Tool handlers never throw. They return `{ success: false, error: "..." }` as JSON text content.

## Conventions

- Each tool module exports: `handle<ToolName>` (the handler), `<toolName>Schema` (Zod schema), `register<ToolName>` (wires into McpServer).
- Tests mock global `fetch` via `vi.stubGlobal` — no real Rally calls in tests.
- All imports use `.js` extensions (required for ESM).

## Rally Environment

- Workspace: `843310407671` (Eliassen Production)
- Project: `844308252829` (Product Council)
- Portfolio hierarchy: Initiative = Product Line, Feature = Initiative, then User Stories, then Tasks
- FormattedID prefixes: US (User Story), TA (Task), F (Feature), I (Initiative), DE (Defect)
