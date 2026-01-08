const path = require('path');
const fs = require('fs');

/**
 * Serve API or MCP documentation
 * Supports custom documentation paths from config or falls back to defaults
 */
function getDocumentation(req, res, next) {
  const docType = req.params.docType; // 'api' or 'mcp'
  const config = req.app.locals.config;

  // Validate doc type
  if (!['api', 'mcp'].includes(docType)) {
    return res.status(404).json({
      error: {
        code: 'INVALID_DOC_TYPE',
        message: 'Documentation type must be "api" or "mcp"'
      }
    });
  }

  // Determine documentation path (custom or default)
  let docPath;
  let isCustom = false;

  if (docType === 'api' && config.ui?.resolvedApiIndexFile) {
    // Use custom API documentation path
    docPath = config.ui.resolvedApiIndexFile;
    isCustom = true;
  } else if (docType === 'mcp' && config.ui?.resolvedMcpIndexFile) {
    // Use custom MCP documentation path
    docPath = config.ui.resolvedMcpIndexFile;
    isCustom = true;
  } else {
    // Fall back to default documentation in public directory
    const docFile = `${docType}-doc.md`;
    docPath = path.join(__dirname, '../../public', docFile);
  }

  // Check if documentation exists
  if (!fs.existsSync(docPath)) {
    return res.status(404).json({
      error: {
        code: 'DOC_NOT_FOUND',
        message: `Documentation file not found: ${path.basename(docPath)}`
      }
    });
  }

  try {
    const content = fs.readFileSync(docPath, 'utf-8');
    const stats = fs.statSync(docPath);

    res.json({
      content,
      type: docType,
      path: `/${docType}/doc`,
      size: stats.size,
      modified: stats.mtime,
      custom: isCustom,
      source: isCustom ? path.basename(docPath) : `default (${path.basename(docPath)})`
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getDocumentation };
