const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { verifyToken } = require("../services/jwtService");
const { sendError } = require("../utils/response");

// "Authorization: Bearer <token>" - the scheme name is case-insensitive and
// the token must be a single value.
const BEARER_REGEX = /^Bearer\s+(\S+)$/i;
const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

/**
 * authenticate: protects a route by requiring a valid JWT in the
 * Authorization header. On success, attaches the authenticated user's
 * document (without the password, with the CURRENT role from the database)
 * to req.user.
 *
 * Only token problems are answered with 401. Anything else (for example the
 * database being down) is passed to the centralized error handler so it is
 * not disguised as an authentication failure.
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return sendError(res, 401, "Not authorized. No token provided.");
  }

  const match = BEARER_REGEX.exec(String(authHeader).trim());
  if (!match) {
    return sendError(
      res,
      401,
      "Not authorized. Malformed authorization header (expected: Bearer <token>)."
    );
  }

  let decoded;
  try {
    decoded = verifyToken(match[1]);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return sendError(res, 401, "Session expired. Please log in again.");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return sendError(res, 401, "Not authorized. Invalid token.");
    }
    return next(error); // e.g. server misconfiguration - not the client's fault
  }

  if (!decoded || typeof decoded.id !== "string" || !OBJECT_ID_REGEX.test(decoded.id)) {
    return sendError(res, 401, "Not authorized. Invalid token.");
  }

  try {
    const user = await User.findById(decoded.id);
    if (!user) {
      return sendError(res, 401, "Not authorized. User for this token no longer exists.");
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * authorize(...roles): use AFTER authenticate. Allows the request only if
 * req.user.role is one of the given roles, otherwise 403.
 *
 *   router.get("/x", authenticate, authorize("admin"), controller)
 */
const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, "Not authorized. Please log in.");
    }
    if (!roles.includes(req.user.role || "user")) {
      return sendError(res, 403, "You do not have permission to perform this action.");
    }
    next();
  };

module.exports = {
  authenticate,
  authorize,
};
