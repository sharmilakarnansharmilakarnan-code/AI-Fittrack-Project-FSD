/**
 * Expected ("operational") error with an HTTP status. Services throw it,
 * the centralized error handler turns it into the standard JSON error.
 */
class AppError extends Error {
  constructor(message, statusCode = 400, errors = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.errors = errors;
  }
}
module.exports = AppError;
