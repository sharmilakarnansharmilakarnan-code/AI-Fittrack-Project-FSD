/** Escapes regex metacharacters so user input is matched literally (no regex injection / ReDoS). */
const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = { escapeRegex };
