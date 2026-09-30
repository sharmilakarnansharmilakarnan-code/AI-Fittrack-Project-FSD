/**
 * Small declarative request validator used by the newer modules.
 *
 *   router.post("/", validateBody({
 *     name:     { type: "string", required: true, min: 2, max: 60 },
 *     capacity: { type: "integer", required: true, min: 1 },
 *   }), controller)
 *
 * - Only fields listed in the schema are kept (everything else is dropped),
 *   which prevents mass assignment (e.g. a client sending "role" or "user").
 * - Values are checked strictly by type and coerced to clean values
 *   (trimmed strings, numbers, Date objects).
 * - Failures return 400 { success:false, message:"Validation failed.", errors:[...] }.
 *
 * Rule options: type, required, min, max (numbers or string length),
 * exclusiveMin, enum, ci (case-insensitive enum), trim:false (passwords),
 * collapse (squeeze inner whitespace), pattern, lowercase.
 * Types: string, number, integer, date, dateOnly, enum.
 */
const { sendError } = require("../utils/response");
const { startOfUtcDay } = require("../utils/dateUtils");

const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Returns { value } on success or { error } on failure. */
const checkValue = (label, value, rule) => {

  switch (rule.type) {
    case "string": {
      if (typeof value !== "string") return { error: `${label} must be text.` };
      let v = rule.trim === false ? value : value.trim();
      if (rule.collapse) v = v.replace(/\s+/g, " ");
      if (rule.min !== undefined && v.length < rule.min) return { error: `${label} must be at least ${rule.min} characters long.` };
      if (rule.max !== undefined && v.length > rule.max) return { error: `${label} cannot exceed ${rule.max} characters.` };
      if (rule.pattern && !rule.pattern.test(v)) return { error: rule.patternMessage || `${label} is not in a valid format.` };
      return { value: rule.lowercase ? v.toLowerCase() : v };
    }
    case "number":
    case "integer": {
      let n;
      if (typeof value === "number") n = value;
      else if (typeof value === "string" && value.trim() !== "") n = Number(value);
      else return { error: `${label} must be a number.` };
      if (!Number.isFinite(n)) return { error: `${label} must be a number.` };
      if (rule.type === "integer" && !Number.isInteger(n)) return { error: `${label} must be a whole number.` };
      if (rule.min !== undefined && n < rule.min) return { error: `${label} must be at least ${rule.min}.` };
      if (rule.exclusiveMin !== undefined && n <= rule.exclusiveMin) return { error: `${label} must be greater than ${rule.exclusiveMin}.` };
      if (rule.max !== undefined && n > rule.max) return { error: `${label} cannot be greater than ${rule.max}.` };
      return { value: n };
    }
    case "date": {
      if (typeof value !== "string" || value.trim() === "" || Number.isNaN(Date.parse(value))) {
        return { error: `${label} must be a valid date (e.g. 2026-09-18).` };
      }
      return { value: new Date(value) };
    }
    case "dateOnly": {
      // Calendar day, stored as UTC midnight
      if (typeof value !== "string" || value.trim() === "" || Number.isNaN(Date.parse(value))) {
        return { error: `${label} must be a valid date (YYYY-MM-DD).` };
      }
      return { value: startOfUtcDay(value) };
    }
    case "enum": {
      const wanted = typeof value === "string" ? value.trim() : undefined;
      const match = wanted === undefined ? undefined : rule.enum.find((option) => (rule.ci ? option.toLowerCase() === wanted.toLowerCase() : option === wanted));
      if (match === undefined) return { error: `${label} must be one of: ${rule.enum.join(", ")}.` };
      return { value: match };
    }
    default:
      return { error: `${label} has an unsupported validation type.` };
  }
};

const runSchema = (schema, source, partial) => {
  const cleaned = {};
  const errors = [];
  Object.entries(schema).forEach(([field, rule]) => {
    const raw = source[field];
    if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "" && rule.type !== "string")) {
      if (rule.required && !partial) errors.push(`${field} is required.`);
      return;
    }
    const result = checkValue(field, raw, rule);
    if (result.error) errors.push(result.error);
    else cleaned[field] = result.value;
  });
  return { cleaned, errors };
};

/** Validates (and whitelists) req.body. partial=true: every field optional (PUT). */
const validateBody =
  (schema, { partial = false, requireOne = false } = {}) =>
  (req, res, next) => {
    const source = isPlainObject(req.body) ? req.body : {};
    const { cleaned, errors } = runSchema(schema, source, partial);

    if (requireOne && Object.keys(cleaned).length === 0 && errors.length === 0) {
      errors.push(`At least one of these fields must be provided: ${Object.keys(schema).join(", ")}.`);
    }
    if (errors.length > 0) return sendError(res, 400, "Validation failed.", errors);

    req.body = cleaned;
    next();
  };

/** Validates req.query. Unknown parameters are dropped. All fields optional unless required. */
const validateQuery = (schema) => (req, res, next) => {
  const { cleaned, errors } = runSchema(schema, req.query || {}, false);
  if (errors.length > 0) return sendError(res, 400, "Validation failed.", errors);
  req.query = cleaned;
  next();
};

/** Rejects a route parameter that is not a 24-character hex MongoDB ObjectId. */
const validateObjectId = (paramName) => (req, res, next) => {
  if (!OBJECT_ID_REGEX.test(String(req.params[paramName]))) {
    return sendError(res, 400, `Invalid ${paramName}. Not a valid resource ID.`);
  }
  next();
};

const PAGE_QUERY = {
  page: { type: "integer", min: 1 },
  limit: { type: "integer", min: 1, max: 100 },
};

module.exports = { validateBody, validateQuery, validateObjectId, PAGE_QUERY };
