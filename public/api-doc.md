# DocLight API Documentation

Version: 1.0.0 | Last Updated: 2025-10-24

## Table of Contents

1. [Introduction](#introduction)
2. [Authentication](#authentication)
3. [Endpoints](#endpoints)
4. [Error Handling](#error-handling)
5. [Rate Limiting](#rate-limiting)
6. [Examples](#examples)

---

## Introduction

DocLight provides a RESTful API for managing Markdown documents. This API enables programmatic access to document operations including reading, uploading, deleting, and downloading files.

**Base URL**: `http://localhost:3000/api` (or your configured domain)

**Content Type**: `application/json` (except file uploads)

---

## Authentication

### API Key Authentication

Protected endpoints require authentication via the `X-API-Key` header.

```http
X-API-Key: your-api-key-here
```

**Configuration**: Set your API key in `config.json5`:
```json5
{
  apiKey: "your-secure-random-string"
}
```

**Security Best Practices**:
- Use a cryptographically secure random string (≥32 characters)
- Store API keys securely (environment variables recommended)
- Rotate keys periodically
- Never commit keys to version control

### Public vs Protected Endpoints

| Endpoint Type | Authentication Required | Examples |
|--------------|------------------------|----------|
| **Public** | ❌ No | GET /tree, GET /raw |
| **Protected** | ✅ Yes | POST /upload, DELETE /entry, GET /download/* |

---

## Endpoints

### 1. Get Directory Tree

**Endpoint**: `GET /api/tree`

**Authentication**: Public (No authentication required)

**Description**: Retrieve the directory structure of documents.

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | No | `/` | Directory path to explore |

**Request Example**:
```bash
curl "http://localhost:3000/api/tree?path=/docs/guide"
```

**Response Example**:
```json
{
  "name": "guide",
  "type": "directory",
  "path": "/docs/guide",
  "children": [
    {
      "name": "getting-started.md",
      "type": "file",
      "path": "/docs/guide/getting-started.md"
    },
    {
      "name": "api",
      "type": "directory",
      "path": "/docs/guide/api",
      "children": [...]
    }
  ]
}
```

**Error Responses**:
- `400 Bad Request`: Invalid path parameter
- `403 Forbidden`: Path outside docsRoot
- `404 Not Found`: Directory not found

---

### 2. Get File Content

**Endpoint**: `GET /api/raw`

**Authentication**: Public (No authentication required)

**Description**: Retrieve the raw Markdown content of a file.

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | Yes | - | File path to read |

**Request Example**:
```bash
curl "http://localhost:3000/api/raw?path=/README.md"
```

**Response Example**:
```json
{
  "content": "# Welcome to DocLight\n\nThis is a Markdown viewer...",
  "path": "/README.md",
  "size": 1024,
  "modified": "2025-10-20T10:30:00.000Z"
}
```

**Error Responses**:
- `400 Bad Request`: Missing or invalid path
- `403 Forbidden`: Path outside docsRoot
- `404 Not Found`: File not found
- `415 Unsupported Media Type`: Non-Markdown file

---

### 3. Upload File

**Endpoint**: `POST /api/upload`

**Authentication**: Protected (X-API-Key required)

**Description**: Upload a new file or overwrite an existing file.

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | Yes | - | Directory path where file will be saved |

**Request Headers**:
```http
Content-Type: multipart/form-data
X-API-Key: your-api-key-here
```

**Request Body**:
- Form field name: `file`
- File type: Any (Markdown recommended)
- Max size: Configurable via `maxUploadMB` (default: 10MB)

**Request Example**:
```bash
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -F "file=@document.md" \
  "http://localhost:3000/api/upload?path=/docs"
```

**Response Example**:
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "path": "/docs/document.md",
  "size": 2048
}
```

**Error Responses**:
- `400 Bad Request`: Missing file or invalid path
- `401 Unauthorized`: Missing or invalid API key
- `403 Forbidden`: Path outside docsRoot
- `413 Payload Too Large`: File exceeds size limit

---

### 4. Delete Entry

**Endpoint**: `DELETE /api/entry`

**Authentication**: Protected (X-API-Key required)

**Description**: Delete a file or directory (recursive).

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | Yes | - | Path to delete |

**Request Example**:
```bash
curl -X DELETE \
  -H "X-API-Key: your-api-key" \
  "http://localhost:3000/api/entry?path=/docs/old-file.md"
```

**Response Example**:
```json
{
  "success": true,
  "message": "Entry deleted successfully",
  "path": "/docs/old-file.md"
}
```

**Warning**: Deleting a directory removes all contents recursively.

**Error Responses**:
- `400 Bad Request`: Missing or invalid path
- `401 Unauthorized`: Missing or invalid API key
- `403 Forbidden`: Path outside docsRoot
- `404 Not Found`: Entry not found

---

### 5. Download File

**Endpoint**: `GET /api/download/file`

**Authentication**: Protected (X-API-Key required)

**Description**: Download a single file.

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | Yes | - | File path to download |

**Request Example**:
```bash
curl -H "X-API-Key: your-api-key" \
  "http://localhost:3000/api/download/file?path=/README.md" \
  --output README.md
```

**Response**: File stream with appropriate headers

**Response Headers**:
```http
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="README.md"
Content-Length: 1024
```

**Error Responses**:
- `400 Bad Request`: Missing or invalid path
- `401 Unauthorized`: Missing or invalid API key
- `403 Forbidden`: Path outside docsRoot
- `404 Not Found`: File not found

---

### 6. Download Directory

**Endpoint**: `GET /api/download/dir`

**Authentication**: Protected (X-API-Key required)

**Description**: Download a directory as a ZIP archive.

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | Yes | - | Directory path to download |

**Request Example**:
```bash
curl -H "X-API-Key: your-api-key" \
  "http://localhost:3000/api/download/dir?path=/docs" \
  --output docs.zip
```

**Response**: ZIP file stream

**Response Headers**:
```http
Content-Type: application/zip
Content-Disposition: attachment; filename="docs.zip"
```

**Error Responses**:
- `400 Bad Request`: Missing or invalid path
- `401 Unauthorized`: Missing or invalid API key
- `403 Forbidden`: Path outside docsRoot
- `404 Not Found`: Directory not found

---

### 7. Health Check

**Endpoint**: `GET /healthz`

**Authentication**: Public (No authentication required)

**Description**: Check server health and uptime.

**Request Example**:
```bash
curl "http://localhost:3000/healthz"
```

**Response Example**:
```json
{
  "status": "OK",
  "timestamp": "2025-10-20T10:30:00.000Z",
  "uptime": 3600.5
}
```

---

## Error Handling

### Standard Error Response Format

All errors follow a consistent JSON structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description"
  }
}
```

### HTTP Status Codes

| Status Code | Meaning | Common Causes |
|------------|---------|---------------|
| `200 OK` | Success | Request processed successfully |
| `400 Bad Request` | Invalid request | Missing parameters, invalid format |
| `401 Unauthorized` | Authentication failed | Missing or invalid API key |
| `403 Forbidden` | Access denied | Path traversal attempt, IP blocked |
| `404 Not Found` | Resource not found | File/directory doesn't exist |
| `413 Payload Too Large` | File too large | Exceeds maxUploadMB limit |
| `415 Unsupported Media Type` | Invalid file type | Non-Markdown file requested |
| `500 Internal Server Error` | Server error | Unexpected server failure |

### Common Error Codes

| Error Code | Description | Solution |
|-----------|-------------|----------|
| `INVALID_PATH` | Path validation failed | Check path format and security |
| `FILE_NOT_FOUND` | File doesn't exist | Verify file path |
| `DIR_NOT_FOUND` | Directory doesn't exist | Verify directory path |
| `PATH_TRAVERSAL` | Security violation | Path must be within docsRoot |
| `AUTH_REQUIRED` | Missing authentication | Provide X-API-Key header |
| `INVALID_API_KEY` | Wrong API key | Check config.json5 apiKey |
| `FILE_TOO_LARGE` | Exceeds size limit | Reduce file size or adjust maxUploadMB |
| `IP_BLOCKED` | IP not whitelisted | Add IP to security.allows in config |

---

## Rate Limiting

Currently, DocLight does not implement rate limiting. Consider implementing:

- Request throttling per IP address
- API key-based quotas
- Concurrent connection limits

**Recommended Configuration** (future enhancement):
```json5
{
  rateLimit: {
    windowMs: 60000,      // 1 minute
    maxRequests: 100,     // 100 requests per minute
    skipSuccessfulRequests: false
  }
}
```

---

## Examples

### Complete Workflow Example

**1. List documents**:
```bash
curl "http://localhost:3000/api/tree?path=/"
```

**2. Read a document**:
```bash
curl "http://localhost:3000/api/raw?path=/guide/api.md"
```

**3. Upload a new document**:
```bash
curl -X POST \
  -H "X-API-Key: my-secure-key" \
  -F "file=@new-doc.md" \
  "http://localhost:3000/api/upload?path=/guide"
```

**4. Download a document**:
```bash
curl -H "X-API-Key: my-secure-key" \
  "http://localhost:3000/api/download/file?path=/guide/new-doc.md" \
  --output new-doc.md
```

**5. Delete a document**:
```bash
curl -X DELETE \
  -H "X-API-Key: my-secure-key" \
  "http://localhost:3000/api/entry?path=/guide/new-doc.md"
```

### JavaScript/Node.js Example

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000/api';
const API_KEY = 'your-api-key';

// Get tree
async function getTree(path = '/') {
  const response = await axios.get(`${BASE_URL}/tree`, {
    params: { path }
  });
  return response.data;
}

// Read file
async function readFile(path) {
  const response = await axios.get(`${BASE_URL}/raw`, {
    params: { path }
  });
  return response.data.content;
}

// Upload file
async function uploadFile(localPath, remotePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(localPath));

  const response = await axios.post(`${BASE_URL}/upload`, form, {
    params: { path: remotePath },
    headers: {
      ...form.getHeaders(),
      'X-API-Key': API_KEY
    }
  });
  return response.data;
}

// Delete file
async function deleteFile(path) {
  const response = await axios.delete(`${BASE_URL}/entry`, {
    params: { path },
    headers: { 'X-API-Key': API_KEY }
  });
  return response.data;
}

// Usage
(async () => {
  const tree = await getTree('/');
  console.log('Documents:', tree);

  const content = await readFile('/README.md');
  console.log('Content:', content);

  await uploadFile('./local.md', '/docs');
  console.log('Uploaded successfully');
})();
```

### Python Example

```python
import requests

BASE_URL = 'http://localhost:3000/api'
API_KEY = 'your-api-key'

# Get tree
def get_tree(path='/'):
    response = requests.get(f'{BASE_URL}/tree', params={'path': path})
    return response.json()

# Read file
def read_file(path):
    response = requests.get(f'{BASE_URL}/raw', params={'path': path})
    return response.json()['content']

# Upload file
def upload_file(local_path, remote_path):
    with open(local_path, 'rb') as f:
        files = {'file': f}
        headers = {'X-API-Key': API_KEY}
        response = requests.post(
            f'{BASE_URL}/upload',
            params={'path': remote_path},
            files=files,
            headers=headers
        )
    return response.json()

# Delete file
def delete_file(path):
    headers = {'X-API-Key': API_KEY}
    response = requests.delete(
        f'{BASE_URL}/entry',
        params={'path': path},
        headers=headers
    )
    return response.json()

# Usage
tree = get_tree('/')
print('Documents:', tree)

content = read_file('/README.md')
print('Content:', content)

upload_file('./local.md', '/docs')
print('Uploaded successfully')
```

---

## Security Considerations

### Path Traversal Prevention

All file paths are validated to prevent directory traversal attacks:

```javascript
// Blocked attempts
/api/raw?path=../../etc/passwd
/api/raw?path=/etc/passwd
/api/raw?path=/../sensitive.md
```

DocLight validates that all paths resolve within the configured `docsRoot` directory.

### IP Whitelisting

Restrict access by IP address (optional):

```json5
{
  security: {
    allows: [
      "127.0.0.1",        // localhost
      "192.168.1.0/24",   // local network
      "10.0.1.*"          // wildcard pattern
    ]
  }
}
```

Blocked IPs receive `403 Forbidden` responses.

### SSL/TLS Configuration

Enable HTTPS for production deployments:

```json5
{
  ssl: {
    enabled: true,
    cert: "/path/to/cert.pem",
    key: "/path/to/key.pem",
    ca: "/path/to/ca.pem"  // optional
  }
}
```

---

## Best Practices

### API Key Management
- Generate keys using: `openssl rand -hex 32`
- Store in environment variables, not in code
- Use different keys for different environments
- Rotate keys regularly

### File Uploads
- Validate file extensions before upload
- Scan uploads for malware in production
- Set appropriate maxUploadMB limits
- Consider file type restrictions

### Error Handling
- Never expose internal paths in errors
- Log all authentication failures
- Implement proper error monitoring
- Provide helpful error messages to clients

### Performance
- Use streaming for large file downloads
- Implement caching for frequently accessed files
- Consider CDN for static documentation
- Monitor API response times

---

## Support & Resources

- **GitHub**: [DocLight Repository](https://github.com/your-org/doclight)
- **MCP Integration**: See [MCP Documentation](/mcp/doc)
- **Configuration Guide**: See README.md
- **Issue Tracker**: GitHub Issues

---

**API Version**: 1.0.0
**Last Updated**: 2025-10-24
**License**: MIT
