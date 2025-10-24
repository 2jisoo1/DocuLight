# DocLight MCP Server

Model Context Protocol server for DocLight document management.

## Installation

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Edit `.env` with your DocLight server URL and API key:
```bash
DOCLIGHT_URL=http://localhost:3000
DOCLIGHT_API_KEY=your-api-key-here
```

## Usage

### Standalone Test

```bash
npm start
```

Then send JSON-RPC commands via stdin:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npm start
```

### Claude Desktop Integration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "doclight": {
      "command": "node",
      "args": ["/absolute/path/to/doclight-mcp-server/src/index.js"],
      "env": {
        "DOCLIGHT_URL": "http://localhost:3000",
        "DOCLIGHT_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Available Tools

- `doclight_list` - List documents in a directory
- `doclight_read` - Read a document
- `doclight_create` - Create a new document
- `doclight_update` - Update an existing document
- `doclight_delete` - Delete a document

## Example Usage in Claude

```
User: "DocLight에 있는 문서 목록 보여줘"
Claude: [Uses doclight_list tool]

User: "guide/getting-started.md 파일 읽어줘"
Claude: [Uses doclight_read tool]

User: "새 문서 만들어줘: docs/api.md"
Claude: [Uses doclight_create tool]
```
