const jwt = require("jsonwebtoken");

// Tokens are always signed and verified with HS256, and verification only
// accepts that algorithm (prevents algorithm-substitution tricks).
const JWT_ALGORITHM = "HS256";

/**
 * Signs a new JWT for the given user id.
 * @param {string} userId
 * @returns {string} signed JWT
 */
const generateToken = (userId) => {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

  if (!secret) {
    throw new Error("JWT_SECRET is not configured on the server");
  }

  return jwt.sign({ id: userId }, secret, { expiresIn, algorithm: JWT_ALGORITHM });
};

/**
 * Verifies a JWT and returns its decoded payload.
 * Throws jsonwebtoken errors (TokenExpiredError, JsonWebTokenError, etc.)
 * which the caller is expected to handle.
 * @param {string} token
 */
const verifyToken = (token) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured on the server");
  }
  return jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM] });
};

module.exports = { generateToken, verifyToken };
