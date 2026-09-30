/**
 * Small helpers to keep every API response in a consistent shape:
 *   { success: true,  message, data }
 *   { success: false, message, errors? }
 */

const sendSuccess = (res, statusCode, message, data = null) => {
  const body = { success: true, message };
  if (data !== null) body.data = data;
  return res.status(statusCode).json(body);
};

const sendError = (res, statusCode, message, errors = null) => {
  const body = { success: false, message };
  if (errors !== null) body.errors = errors;
  return res.status(statusCode).json(body);
};

module.exports = { sendSuccess, sendError };
