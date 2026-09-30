const PLACEHOLDER_VALUES = new Set([
  "",
  "your_mongodb_connection_string",
  "your_secure_jwt_secret",
  "your_secret_key",
  "changeme",
]);

const isMissing = (value) =>
  value === undefined || PLACEHOLDER_VALUES.has(String(value).trim().toLowerCase());

/**
 * Fails fast, with a clear message, when a variable the API cannot work
 * without is missing (MONGO_URI, JWT_SECRET). Gemini settings are only
 * warned about: the rest of the API works without them and the AI endpoints
 * return a clean JSON error instead.
 */
const validateEnv = () => {
  const problems = [];

  if (isMissing(process.env.MONGO_URI)) {
    problems.push("MONGO_URI is missing or still a placeholder.");
  }
  if (isMissing(process.env.JWT_SECRET)) {
    problems.push("JWT_SECRET is missing or still a placeholder.");
  }

  if (problems.length > 0) {
    console.error("Invalid server configuration:");
    problems.forEach((p) => console.error(`  - ${p}`));
    console.error("Copy server/.env.example to server/.env and fill in real values.");
    process.exit(1);
  }

  if (String(process.env.JWT_SECRET).length < 32) {
    console.warn("Warning: JWT_SECRET is shorter than 32 characters. Use a long, random secret.");
  }

  const geminiKey = String(process.env.GEMINI_API_KEY || "").trim().toLowerCase();
  if (!geminiKey || geminiKey === "your_gemini_api_key") {
    console.warn(
      "Warning: GEMINI_API_KEY is not set. Everything works except the AI endpoints (POST /api/ai/recommendation, GET /api/ai/fitness-insights), which will answer with an error until it is set."
    );
  }
};

module.exports = validateEnv;
