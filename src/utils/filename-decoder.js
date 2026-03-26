/**
 * Filename Decoder Utility
 *
 * Node.js HTTP parser interprets multipart headers as Latin-1 (ISO-8859-1),
 * causing UTF-8 filenames (Korean, Japanese, etc.) to be garbled.
 * This utility recovers the original UTF-8 bytes from the Latin-1 misinterpretation.
 */

/**
 * Decode a filename that was incorrectly interpreted as Latin-1 back to UTF-8.
 * @param {string} name - The potentially garbled filename from multer
 * @returns {string} The correctly decoded filename
 */
function decodeFilename(name) {
  if (!name) return name;
  // ASCII-only filenames need no conversion
  if (/^[\x00-\x7F]*$/.test(name)) return name;

  try {
    // Restore original bytes from Latin-1 misinterpretation, then re-read as UTF-8
    const buf = Buffer.from(name, 'latin1');
    const decoded = buf.toString('utf8');
    // If U+FFFD (replacement char) appears, the input wasn't Latin-1-encoded UTF-8
    if (decoded.includes('\uFFFD')) return name;
    return decoded;
  } catch {
    return name;
  }
}

module.exports = { decodeFilename };
