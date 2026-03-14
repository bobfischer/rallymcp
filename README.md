# Eliassen Rally MCP Server

Local MCP server that wraps the Rally REST API for AI-driven product operations. Designed to complement the existing Rally MCP by filling operational gaps: user search, portfolio item management, artifact deletion, and attachment handling. Runs locally — no cloud deployment needed.

## Tools

| Tool | Description |
|------|-------------|
| `searchUser` | Look up a Rally user by name or email fragment |
| `movePortfolioItem` | Move a Feature or Initiative to a named flow state |
| `createPortfolioItem` | Create a Feature or Initiative |
| `deleteArtifact` | Delete a User Story or Task (with confirmation) |
| `addAttachment` | Attach a file to any Rally artifact |
| `getAttachment` | List or retrieve attachment content from an artifact |
| `deleteAttachment` | Remove an attachment |

## Setup

### Prerequisites

- Node.js 18+
- A Rally API key with access to your workspace

### Install

```bash
git clone https://github.com/bobfischer/rallymcp.git
cd rallymcp
npm install
```

### Configure

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

```
RALLY_API_KEY=your-rally-api-key
RALLY_WORKSPACE_REF=843310407671
RALLY_PROJECT_REF=844308252829
PORT=3000
```

### Run

Development (with hot reload):

```bash
npm run dev
```

Production:

```bash
npm run build
npm start
```

Verify it's running:

```bash
curl http://localhost:3000/health
# {"status":"ok","server":"eliassen-rally-mcp"}
```

### Test

```bash
npm test
```

## Client Configuration

Add this to your `claude_desktop_config.json` (adjust the path to match your machine):

```json
{
  "mcpServers": {
    "eliassen-rally": {
      "url": "http://localhost:3000/mcp",
      "transport": "http"
    }
  }
}
```

The server must be running locally before starting Claude Desktop.

## Rally Environment

- **Base URL:** `https://rally1.rallydev.com/slm/webservice/v2.0`
- **Portfolio hierarchy:**
  - Initiative (Rally) = Product Line (Eliassen)
  - Feature (Rally) = Initiative (Eliassen)
  - User Stories
  - Tasks
