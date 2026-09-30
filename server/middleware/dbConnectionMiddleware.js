const mongoose = require("mongoose");
const { sendError } = require("../utils/response");

/**
 * Rejects the request straight away with 503 when MongoDB is not connected
 * (readyState 1 === connected). Without this, Mongoose queues the query and
 * fails ~10s later with "Operation ... buffering timed out after 10000ms".
 */
const requireDatabase = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, "Database is unavailable. Please try again shortly.");
  }
  next();
};

module.exports = { requireDatabase };
