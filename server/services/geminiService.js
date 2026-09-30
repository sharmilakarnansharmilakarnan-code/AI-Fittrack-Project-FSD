const { GoogleGenAI } = require("@google/genai");

/**
 * Model used when GEMINI_MODEL is not set in .env. Both AI features (workout
 * recommendation and AI fitness insights) use whatever getModelName() returns.
 * Set GEMINI_MODEL in .env to use a different model.
 */
const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Retry policy for TEMPORARY Gemini failures only (503 UNAVAILABLE, other
 * 5xx, and transient network errors). Permanent failures (400/401/403/404,
 * invalid key, malformed request) are never retried - see isRetryable().
 *
 * 3 attempts total, exponential backoff with jitter: ~1s, ~2s (capped at
 * MAX_RETRY_DELAY_MS), so a worst case adds a few seconds - not an
 * unbounded wait - before returning a clean "temporarily busy" error.
 */
const MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 8000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Delay before retry attempt N (1-based index of the attempt about to run). */
const backoffDelay = (attemptNumber) => {
  const exponential = BASE_RETRY_DELAY_MS * 2 ** (attemptNumber - 1);
  const capped = Math.min(exponential, MAX_RETRY_DELAY_MS);
  const jitter = Math.random() * 0.3 * capped; // +/-30% jitter avoids retry storms
  return Math.round(capped - capped * 0.15 + jitter);
};

/**
 * Custom error type so controllers can tell "Gemini itself failed" apart
 * from other kinds of errors, and pick an appropriate HTTP status code.
 */
class GeminiServiceError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "GeminiServiceError";
    this.statusCode = statusCode;
  }
}

const PLACEHOLDER_KEYS = new Set(["your_gemini_api_key", "your-gemini-api-key", "changeme"]);

const isPlaceholderKey = (key) => {
  if (!key) return true;
  const trimmed = String(key).trim();
  if (trimmed === "") return true;
  return PLACEHOLDER_KEYS.has(trimmed.toLowerCase());
};

let cachedClient = null;
let cachedApiKey = null;

const getModelName = () => process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;

const getTimeoutMs = () => {
  const raw = Number(process.env.GEMINI_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TIMEOUT_MS;
  return raw;
};

/**
 * Lazily creates (and caches) the Gemini client. Recreates it if the API
 * key changes, which matters in dev when nodemon reloads env vars.
 */
const getClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (isPlaceholderKey(apiKey)) {
    throw new GeminiServiceError(
      "Gemini API key is not configured on the server. Set GEMINI_API_KEY in the .env file.",
      500
    );
  }

  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = new GoogleGenAI({ apiKey });
    cachedApiKey = apiKey;
  }
  return cachedClient;
};

/**
 * Strips markdown code fences (```json ... ```) that Gemini sometimes wraps
 * JSON responses in, so the text can be parsed safely.
 */
const stripCodeFences = (text) => {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
};

/**
 * Pulls the upstream HTTP-ish status code out of whatever shape the SDK
 * threw (an ApiError with a numeric `status`, an Axios-style `response`, or
 * the raw `{ error: { code } }` body Gemini itself returns - which is what
 * arrives when the SDK just rethrows the parsed JSON error, as seen in the
 * "UNAVAILABLE" 503 case). Shared by classifyError() and isRetryable() so
 * both agree on what a given failure actually was.
 */
const extractStatus = (err) => err?.status ?? err?.response?.status ?? err?.error?.code;

/** Gemini's own string status code, e.g. "UNAVAILABLE", "RESOURCE_EXHAUSTED". */
const extractGeminiStatus = (err) => err?.status_text ?? err?.error?.status;

const NETWORK_ERROR_CODES = new Set(["ENOTFOUND", "ECONNREFUSED", "EAI_AGAIN", "ECONNRESET", "ETIMEDOUT"]);

/**
 * TRUE only for failures that are genuinely worth retrying: temporary
 * server-side unavailability (503 / "UNAVAILABLE", any other 5xx), a
 * request timeout/abort, or a transient network-level failure. Everything
 * else (400 bad request, 401/403 auth, 404 unknown model, malformed
 * request) is permanent and must fail on the first attempt - retrying a bad
 * API key or a typo'd model name would just waste time and still fail.
 */
const isRetryable = (err) => {
  if (err instanceof GeminiServiceError) return false; // already classified -> not a raw SDK error
  if (err?.name === "AbortError") return true; // timeout
  if (NETWORK_ERROR_CODES.has(err?.code) || err?.cause) return true;

  const status = extractStatus(err);
  const geminiStatus = extractGeminiStatus(err);
  if (geminiStatus === "UNAVAILABLE" || geminiStatus === "RESOURCE_EXHAUSTED" || geminiStatus === "INTERNAL") return true;
  return typeof status === "number" && status >= 500;
};

/**
 * Turns whatever the SDK throws (an ApiError with a numeric `status`, a
 * DOMException-style AbortError, a Node network error, or anything else)
 * into a GeminiServiceError with an appropriate, distinct HTTP status code -
 * so a timeout, an invalid key, a bad model name and a rate limit never look
 * the same to the client.
 */
const classifyError = (err) => {
  if (err instanceof GeminiServiceError) return err;

  if (err?.name === "AbortError") {
    return new GeminiServiceError(
      "The AI request took too long and was cancelled after retrying. Please try again in a moment.",
      504
    );
  }

  const status = extractStatus(err);

  if (status === 400) {
    return new GeminiServiceError(
      "Gemini rejected the request as invalid (bad parameters or unsupported model).",
      502
    );
  }
  if (status === 401 || status === 403) {
    return new GeminiServiceError("Gemini rejected the API key (invalid or unauthorized).", 500);
  }
  if (status === 404) {
    return new GeminiServiceError(
      `Gemini model "${getModelName()}" was not found or is not supported. Check GEMINI_MODEL.`,
      500
    );
  }
  if (status === 429) {
    return new GeminiServiceError("Gemini rate limit exceeded. Please try again shortly.", 429);
  }
  const geminiStatus = extractGeminiStatus(err);
  if (geminiStatus === "UNAVAILABLE" || (typeof status === "number" && status >= 500)) {
    // This is the branch a 503 UNAVAILABLE reaches after retries are exhausted.
    return new GeminiServiceError("AI service is temporarily busy. Please try again in a moment.", 503);
  }
  if (NETWORK_ERROR_CODES.has(err?.code) || err?.cause) {
    return new GeminiServiceError(
      "Could not reach the Gemini API. Check the server's network/internet connection.",
      502
    );
  }

  // The detailed reason is logged server-side (see callGemini); it is not
  // echoed to the client because it can contain upstream request details.
  return new GeminiServiceError("Gemini request failed. Please try again later.", 502);
};

/**
 * Makes ONE generateContent call with a real, cancellable timeout: an
 * AbortController signal is threaded into the SDK call itself (via
 * config.abortSignal), so when the timer fires the in-flight HTTP request
 * to Gemini is actually aborted rather than merely "raced" and ignored.
 * Throws the RAW SDK/Gemini error (not yet classified) so the caller can
 * decide whether it's worth retrying.
 */
const callGeminiOnce = async ({ model, contents, config = {} }) => {
  const client = getClient();
  const timeoutMs = getTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await client.models.generateContent({
      model,
      contents,
      config: { ...config, abortSignal: controller.signal },
    });
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Calls Gemini with limited retries and exponential backoff for TEMPORARY
 * failures (503 UNAVAILABLE, other 5xx, timeouts, transient network
 * errors). Permanent failures (bad API key, invalid request, unknown
 * model) are classified and thrown immediately on the first attempt - see
 * isRetryable(). Never retries indefinitely: MAX_ATTEMPTS bounds the total
 * work to at most 3 tries.
 */
const callGemini = async ({ model, contents, config = {} }) => {
  console.log("[Gemini] Request started");
  console.log(`[Gemini] Model: ${model}`); // never logs the API key

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    console.log(`[Gemini] Attempt ${attempt}/${MAX_ATTEMPTS}`);
    try {
      const result = await callGeminiOnce({ model, contents, config });
      console.log("[Gemini] Request successful");
      return result;
    } catch (err) {
      lastError = err;
      const safeMessage = err?.message ? String(err.message).slice(0, 300) : "unknown error";
      const retryable = isRetryable(err);

      if (!retryable) {
        console.error(`[Gemini] Permanent failure (not retrying): ${safeMessage}`);
        throw classifyError(err);
      }

      const reason = err?.name === "AbortError" ? "Timeout" : extractGeminiStatus(err) || `HTTP ${extractStatus(err)}`;
      console.warn(`[Gemini] Temporary failure received (${reason}): ${safeMessage}`);

      if (attempt === MAX_ATTEMPTS) {
        console.error(`[Gemini] All ${MAX_ATTEMPTS} attempts failed. Giving up.`);
        break;
      }

      const delay = backoffDelay(attempt);
      console.log(`[Gemini] Retrying after ${delay}ms`);
      await sleep(delay);
    }
  }

  throw classifyError(lastError);
};

/**
 * Sends a prompt to Gemini and returns the parsed JSON object it produced.
 * Wraps every failure mode (missing key, invalid key, invalid model,
 * network error, timeout, rate limit, empty response, malformed JSON) into
 * a GeminiServiceError so the rest of the app never crashes because Gemini
 * misbehaved.
 *
 * @param {string} systemInstruction - safety/behaviour instructions for Gemini
 * @param {string} userPrompt - the actual request, asking for a JSON reply
 * @returns {Promise<object>} parsed JSON response from Gemini
 */
const generateStructuredContent = async (systemInstruction, userPrompt) => {
  const modelName = getModelName();

  const result = await callGemini({
    model: modelName,
    contents: userPrompt,
    config: {
      systemInstruction,
      temperature: 0.7,
      responseMimeType: "application/json",
    },
  });

  let text;
  try {
    text = result?.text;
  } catch (err) {
    throw new GeminiServiceError("Gemini returned a response that could not be read.", 502);
  }

  if (!text || String(text).trim() === "") {
    throw new GeminiServiceError("Gemini returned an empty response.", 502);
  }

  const cleaned = stripCodeFences(String(text));

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new GeminiServiceError("Gemini returned a malformed response that could not be parsed.", 502);
  }
};

/** True when a real-looking GEMINI_API_KEY is set (no network call is made). */
const isGeminiConfigured = () => !isPlaceholderKey(process.env.GEMINI_API_KEY);

module.exports = { generateStructuredContent, isGeminiConfigured, GeminiServiceError };
