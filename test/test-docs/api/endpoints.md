----
name: API Endpoints
description: Documentation for API endpoints
----

# API Endpoints

This document describes all available API endpoints.

## Authentication

All protected endpoints require authentication via X-API-Key header.

### GET /api/tree

Returns the document tree structure.

### POST /api/upload

Upload a new document. Requires authentication.

### DELETE /api/entry

Delete a document or folder. Requires authentication.

## Configuration

The API can be configured via config.json5 file.

## Error Handling

All endpoints return JSON responses with error details when applicable.
