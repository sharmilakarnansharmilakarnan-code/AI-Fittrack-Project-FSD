const { sendError } = require("../utils/response");
const AppError = require("../utils/AppError");
const { GeminiServiceError } = require("../services/geminiService");

/** Handles requests to routes that don't exist. */
const notFound = (req, res, next) => {
  sendError(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
};

// Errors that mean "MongoDB cannot be reached right now" (as opposed to a
// bad query or bad data). Includes Mongoose's "buffering timed out" error.
const DB_UNAVAILABLE_NAMES = new Set([
  "MongoNetworkError",
  "MongoNetworkTimeoutError",
  "MongoServerSelectionError",
  "MongooseServerSelectionError",
  "MongoNotConnectedError",
  "MongoTopologyClosedError",
]);

const isDatabaseUnavailable = (err) =>
  DB_UNAVAILABLE_NAMES.has(err.name) ||
  (err.name === "MongooseError" && /buffering timed out|before initial connection/i.test(err.message || ""));

/**
 * Centralized error handler. Every thrown / next(error) call in the app
 * ends up here. Converts known error types into clean JSON responses and
 * never leaks stack traces or secrets to the client.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Full details are logged server-side only; expected client errors (4xx)
  // just get a one-line log.
  const loggedStatus = err.statusCode || err.status;
  if (err instanceof AppError && err.statusCode < 500) {
    console.warn(`[WARN] ${req.method} ${req.originalUrl}: ${err.message}`);
  } else if (loggedStatus && loggedStatus < 500 && !(err instanceof GeminiServiceError)) {
    console.warn(`[WARN] ${req.method} ${req.originalUrl}: ${err.message}`);
  } else {
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
  }

  // Expected business-rule / permission errors thrown by services
  if (err instanceof AppError) {
    return sendError(res, err.statusCode, err.message, err.errors);
  }

  // Gemini-specific errors already carry an appropriate status code
  if (err instanceof GeminiServiceError) {
    return sendError(res, err.statusCode || 502, err.message);
  }

  // Malformed / oversized request bodies (thrown by express.json())
  if (err.type === "entity.parse.failed") {
    return sendError(res, 400, "Malformed JSON in request body.");
  }
  if (err.type === "entity.too.large") {
    return sendError(res, 413, "Request body is too large.");
  }

  // Mongoose validation errors
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return sendError(res, 400, "Validation failed.", messages);
  }

  // Mongoose duplicate key error (e.g. duplicate email)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return sendError(res, 409, `A record with that ${field} already exists.`);
  }

  // Mongoose invalid ObjectId cast
  if (err.name === "CastError") {
    return sendError(res, 400, `Invalid value for ${err.path}.`);
  }

  // Database unreachable / disconnected
  if (isDatabaseUnavailable(err)) {
    return sendError(res, 503, "Database is unavailable. Please try again shortly.");
  }

  // JWT errors (in case they escape the auth middleware)
  if (err.name === "TokenExpiredError") {
    return sendError(res, 401, "Session expired. Please log in again.");
  }
  if (err.name === "JsonWebTokenError") {
    return sendError(res, 401, "Invalid authentication token.");
  }

  const statusCode = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  const message =
    statusCode === 500 ? "Internal server error. Please try again later." : err.message;

  return sendError(res, statusCode, message);
};

module.exports = { notFound, errorHandler };
