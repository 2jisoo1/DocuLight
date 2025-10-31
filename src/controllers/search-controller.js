const { searchDocuments } = require('../services/search-service');

/**
 * Search documents by keyword (Express wrapper)
 * GET /api/search?query=<keyword>&limit=<limit>
 */
async function searchDocumentsController(req, res, next) {
  try {
    const { config, logger } = req.app.locals;
    const { query, limit = 50 } = req.query;

    // Validate query parameter
    if (!query || query.trim().length < 2) {
      return res.json({
        query: query || '',
        results: [],
        total: 0
      });
    }

    const searchQuery = query.trim();
    const searchLimit = Math.min(parseInt(limit) || 50, 100);

    // Call unified search service with REST API options
    const result = await searchDocuments(config, logger, searchQuery, {
      limit: searchLimit,
      path: '/',
      highlight: true,       // REST API uses HTML highlighting
      includeContext: true,  // Include context for better results
      maxMatchesPerFile: 3   // Limit matches per file for readability
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = { searchDocuments: searchDocumentsController };
