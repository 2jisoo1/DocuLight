/**
 * Config Service - Configuration management operations
 */

/**
 * Get current runtime configuration with sensitive values masked
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string} section - Section filter (ui, security, ssl, all) - default: all
 * @returns {Promise<Object>} Masked configuration object
 */
async function getConfig(config, logger, section = 'all') {
  try {
    // Validate section
    const validSections = ['ui', 'security', 'ssl', 'all'];
    if (section && !validSections.includes(section)) {
      const error = new Error(`INVALID_SECTION: Section must be one of ${validSections.join(', ')}`);
      error.code = 'INVALID_SECTION';
      throw error;
    }

    // Deep copy to protect original config
    let result = JSON.parse(JSON.stringify(config));

    // Mask sensitive values function
    function maskSensitiveValues(obj, path = '') {
      if (typeof obj !== 'object' || obj === null) return;

      const sensitivePatterns = [
        'apiKey', 'password', 'passwd', 'key', 'secret', 'token',
        'credentials', 'auth', 'privateKey', 'privateKeyPath', 'pass'
      ];

      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();

        // Check for sensitive fields
        if (sensitivePatterns.some(pattern => lowerKey.includes(pattern.toLowerCase()))) {
          if (typeof value === 'string' && value.length > 0) {
            obj[key] = '***';
          } else if (typeof value === 'object' && value !== null) {
            obj[key] = { ...value };
            for (const subKey in obj[key]) {
              obj[key][subKey] = '***';
            }
          }
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Recursively process
          maskSensitiveValues(value, `${path}.${key}`);
        }
      }
    }

    // Apply masking to entire config
    maskSensitiveValues(result);

    // Filter by section
    if (section !== 'all') {
      if (result[section] !== undefined) {
        result = { [section]: result[section] };
      } else {
        result = {};
      }
    }

    logger.info('Config retrieved', {
      section,
      keys: Object.keys(result).length
    });

    return result;
  } catch (error) {
    logger.error('Config retrieval failed', {
      section,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  getConfig
};
