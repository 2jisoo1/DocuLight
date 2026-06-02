# DocuLight

Lightweight Markdown document viewer and management system

## Features

- 📁 **File Tree Navigation**: Obsidian-style sidebar for document browsing
- 📄 **Markdown Rendering**: GitHub-flavored Markdown with syntax highlighting
- 📊 **Diagram Support**: Mermaid.js diagrams and flowcharts
- 🔒 **Security**: API key authentication, path validation, XSS protection
- 💾 **State Persistence**: IndexedDB-based tree state and last-opened file
- 📤 **File Management**: Upload, download, delete operations via REST API
- 🤖 **MCP Support**: Model Context Protocol for AI agent integration

## Quick Start

### Prerequisites
- Node.js 18+
- Modern browser (Chrome, Edge, Firefox)

### Installation

```bash
npm install
```

### Running the Application

```bash
# Development mode (auto-restart on changes)
npm run dev

# Production mode
npm start
```

Server runs on port 3000 by default. Access at `http://localhost:3000`.
The server binds to `127.0.0.1` by default. Set `host: "0.0.0.0"` in `config.json5`, or set the `HOST` environment variable, only when direct remote access is required.

---

## Configuration

### Basic Setup

DocuLight uses `config.json5` for configuration. If the file doesn't exist, it will be automatically generated from `config.example.json5` on first run.

#### Manual Setup (Optional)

```bash
# Copy example config
cp config.example.json5 config.json5

# Edit config file
vi config.json5
```

#### Required Settings

**1) docsRoot - Document Directory Path (Required)**
```json5
{
  docsRoot: "/path/to/your/documents"  // Absolute path recommended
}
```

Error handling:
- Path doesn't exist → Error: `docsRoot directory does not exist: ...`
- Path is not a directory → Error: `docsRoot is not a directory: ...`
- Path not accessible → Error: `Cannot access docsRoot: ...`

**2) apiKey - API Authentication Key (Required)**
```json5
{
  apiKey: "your-secure-random-key"  // Must be changed from default
}
```

Error handling:
- Using default value → Error: `apiKey must be set to a secure value`

**3) maxWidth - UI Maximum Width (Optional, default: 1024px)**
```json5
{
  ui: {
    maxWidth: "1024px"  // Units supported: px, %, em, rem, vw
  }
}
```

**4) Log Settings (Optional)**
```json5
{
  log: {
    dir: "./logs",      // Log directory
    level: "info",      // Log level: error, warn, info, debug
    maxDays: 30         // Log retention period (days)
  }
}
```

---

## Documentation

### API Documentation
- **English**: `/docs/api/doc/api.md` (Web: `http://localhost:3000/api/doc`)
- **Korean**: `/docs/api/doc/ko/api.md` (Web: `http://localhost:3000/api/doc/ko`)
- **cURL Examples**: `/docs/api/doc/api-curl-example.md`

### MCP Documentation
- **English**: `/docs/mcp/doc/mcp.md` (Web: `http://localhost:3000/mcp/doc`)
- **Korean**: `/docs/mcp/doc/ko/mcp.md` (Web: `http://localhost:3000/mcp/doc/ko`)

---

## MCP Integration

DocuLight provides MCP (Model Context Protocol) Streamable HTTP initial interoperability at `POST /mcp`.
SSE streams are not enabled: normal JSON-RPC POST requests return `application/json`, and `GET /mcp` returns `405 Method Not Allowed` with `Allow: POST`.

### Claude Code

Add DocuLight MCP server to Claude Code:

```bash
# Register HTTP MCP server
claude mcp add --transport http docuLight http://localhost:3000/mcp

# Verify registration
claude mcp list
```

Expected output:
```
docuLight: http://localhost:3000/mcp (HTTP) - ✓ Connected
```

### Direct HTTP Access

All AI agents can use DocuLight MCP through standard HTTP requests:

```bash
# Initialize the MCP session
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-11-25",
      "capabilities": {},
      "clientInfo": {
        "name": "curl",
        "version": "1.0.0"
      }
    }
  }'

# Send initialized notification
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{
    "jsonrpc": "2.0",
    "method": "notifications/initialized"
  }'

# List available tools
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }'

# Read a document
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "read_document",
      "arguments": {"path": "/README.md"}
    }
  }'
```

### MCP Server Details

- **Endpoint**: `http://localhost:3000/mcp`
- **Transport**: Streamable HTTP initial interoperability (no SSE streams)
- **Method**: POST for JSON-RPC; GET returns 405 with `Allow: POST`
- **Content-Type**: application/json
- **Accept**: `application/json, text/event-stream`
- **Protocol Version**: `2025-11-25`
- **Authentication**: read tools are public unless read login is enabled; write tools require the `X-API-Key` user key
- **Browser Origin Guard**: browser-origin requests are checked against MCP Origin/Host allowlists to reduce DNS rebinding exposure
- **Protocol**: JSON-RPC 2.0

### MCP Origin and Host Allowlist

DocuLight rejects requests to `POST /mcp` when the `Host` header is not allowed. If an `Origin` header is present, it must also be allowed. Requests without an `Origin` header, such as normal CLI/server MCP clients, are accepted only in the sense that missing `Origin` is not rejected; `Host` is still always checked.

Configure browser access explicitly when exposing MCP through a domain:

```json5
mcp: {
  allowedOrigins: ["https://docs.example.com"],
  allowedHosts: ["docs.example.com"]
}
```

Origin values must be canonical origins such as `https://docs.example.com`; do not include path, query, hash, or userinfo.
Host entries may be hostnames/IPs or exact `host:port` values. Entries without a port allow any port for that hostname; entries with a port require an exact port match.

The server binds to `127.0.0.1` by default. For public deployments, keep DocuLight bound locally and terminate public traffic at a reverse proxy when possible. Preserve the original `Host` header when using a reverse proxy; DocuLight does not trust `X-Forwarded-Host` for MCP allowlist checks.

`["*"]` is supported only as an explicit insecure opt-out for the corresponding check. It disables that allowlist check for well-formed values and should not be used when read tools are public.

### MCP Tool Authentication

| Tool | Authentication Required |
|------|------------------------|
| list_documents | No |
| list_full_tree | No |
| read_document | No |
| DocuLight_search | No |
| DocuLight_get_config | No |
| create_document | **Yes** (X-API-Key header) |
| delete_document | **Yes** (X-API-Key header) |

For more details, see `/docs/mcp/doc/mcp.md`.

---

## API Usage Examples

### Search Documents
```bash
curl 'http://localhost:3000/api/search?query=installation'
```

### Get File Tree
```bash
curl 'http://localhost:3000/api/tree?path=/'
```

### Read Document
```bash
curl 'http://localhost:3000/api/raw?path=/README.md'
```

### Upload File
```bash
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -F "file=@document.md" \
  'http://localhost:3000/api/upload?path=/docs'
```

### Delete File
```bash
curl -X DELETE \
  -H "X-API-Key: your-api-key" \
  'http://localhost:3000/api/entry?path=/old-doc.md'
```

### Download Directory as ZIP
```bash
curl -H "X-API-Key: your-api-key" \
  'http://localhost:3000/api/download/dir?path=/docs' \
  -o docs.zip
```

For complete API reference, see `/docs/api/doc/api.md`.

---

## Production Deployment

### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start server
pm2 start src/app.js --name DocuLight

# Save configuration
pm2 save

# Enable startup script
pm2 startup
```

### Managing the Service

```bash
# View logs
pm2 logs DocuLight

# Restart server
pm2 restart DocuLight

# Stop server
pm2 stop DocuLight

# Check status
pm2 status
```

---

## Advanced Configuration

### IP Whitelist (Optional)

Restrict access to specific IP ranges:

```json5
{
  security: {
    allows: [
      "127.0.0.1",           // Exact IP
      "::1",                 // IPv6 localhost
      "10.0.1.*",            // Wildcard: 10.0.1.0-255
      "10.0.100-200.*",      // Range: 10.0.100.0-255 ~ 10.0.200.0-255
      "192.168.1.0/24"       // CIDR notation
    ]
  }
}
```

### SSL/TLS Support (Optional)

Enable HTTPS:

```json5
{
  ssl: {
    enabled: true,
    cert: "/path/to/cert.pem",
    key: "/path/to/key.pem",
    ca: "/path/to/ca.pem"  // Optional: CA certificate
  }
}
```

Generate self-signed certificate for testing:
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

---

## Support

### Documentation
- API Documentation: `/docs/api/doc/` (English), `/docs/api/doc/ko/` (Korean)
- MCP Documentation: `/docs/mcp/doc/` (English), `/docs/mcp/doc/ko/` (Korean)
- Implementation Plans: `/docs/plan/` (Step-by-step development documentation)

### Issues
- Report bugs and request features via GitHub Issues

---

## License

ISC
