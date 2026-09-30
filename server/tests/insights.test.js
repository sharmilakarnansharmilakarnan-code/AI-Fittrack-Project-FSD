/**
 * Tests for the AI Fitness Insights feature (GET /api/ai/fitness-insights).
 *
 * They run OFFLINE with `npm test` (no MongoDB, no internet, no Gemini key needed).
 * The REAL Express app, JWT middleware, controller, progressService,
 * insightsService and geminiService (including its retry logic) are used.
 * Only the outer edges are replaced by small fakes:
 *   - Mongoose query methods (Workout.aggregate / find, User.findById, ...)
 *   - the Google SDK (@google/genai), so 503 / 429 / bad-JSON answers can be simulated
 *
 * For a check against real MongoDB and real Gemini use `npm run test:api`
 * (tests/api.integration.js) and the Thunder Client steps in API_TESTING.md.
 */
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

// ---- environment (must be set before the app is loaded) ----
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.GEMINI_API_KEY = "test-key-not-a-real-key";
delete process.env.GEMINI_MODEL; // so the built-in default model is what gets used
process.env.GEMINI_TIMEOUT_MS = "5000";

// ---- silence the (very chatty) server logs while the tests run ----
const realConsole = { log: console.log, warn: console.warn, error: console.error };
console.log = console.warn = console.error = () => {};

// ---- fake Google SDK ----
const sdkCalls = []; // every generateContent() request the app made
let sdkBehaviour = null; // (request, callNumber) => { text } | throws

class FakeGoogleGenAI {
  constructor() {
    this.models = {
      generateContent: async (request) => {
        sdkCalls.push(request);
        return sdkBehaviour(request, sdkCalls.length);
      },
    };
  }
}
const sdkPath = require.resolve("@google/genai");
require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: { GoogleGenAI: FakeGoogleGenAI } };

const mongoose = require("mongoose");
const User = require("../models/User");
const Workout = require("../models/Workout");
const Attendance = require("../models/Attendance");
const FitnessGoal = require("../models/FitnessGoal");
const { generateToken } = require("../services/jwtService");
const { validateInsights } = require("../services/insightsService");
const { GeminiServiceError } = require("../services/geminiService");

// The DB guard middleware only checks the connection state.
Object.defineProperty(mongoose.connection, "readyState", { get: () => 1, configurable: true });

// ---- fake data layer ----
const id = () => new mongoose.Types.ObjectId();
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

const users = new Map(); // idString -> user
let workouts = []; // { user, workoutName, category, duration, caloriesBurned, workoutDate }
const findFilters = []; // the `user` filter of every Workout.find() call

User.findById = async (uid) => users.get(String(uid)) || null;
Attendance.countDocuments = async () => 0;
FitnessGoal.find = () => chain([]);

/** Minimal stand-in for an aggregate over the in-memory workouts (only the two pipelines progressService uses). */
Workout.aggregate = async (pipeline) => {
  const { user } = pipeline[0].$match;
  const mine = workouts.filter((w) => String(w.user) === String(user));
  const groupId = pipeline[1].$group._id;
  if (groupId && groupId.$dateToString) {
    const byDay = new Map();
    for (const w of mine) {
      const day = w.workoutDate.toISOString().slice(0, 10);
      const row = byDay.get(day) || { _id: day, workouts: 0, duration: 0, calories: 0 };
      row.workouts += 1;
      row.duration += w.duration;
      row.calories += w.caloriesBurned;
      byDay.set(day, row);
    }
    return [...byDay.values()].sort((a, b) => (a._id < b._id ? -1 : 1));
  }
  const byCat = new Map();
  for (const w of mine) byCat.set(w.category, (byCat.get(w.category) || 0) + 1);
  return [...byCat.entries()].map(([_id, count]) => ({ _id, count })).sort((a, b) => b.count - a.count);
};

/** Thenable + chainable query stand-in: find().sort().limit().select().lean() */
function chain(rows) {
  let result = rows;
  const q = {
    sort: () => {
      result = [...result].sort((a, b) => b.workoutDate - a.workoutDate);
      return q;
    },
    limit: (n) => {
      result = result.slice(0, n);
      return q;
    },
    select: () => q,
    lean: () => q,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}
Workout.find = (filter) => {
  findFilters.push(String(filter.user));
  return chain(workouts.filter((w) => String(w.user) === String(filter.user)));
};

const makeUser = (name, fitnessProfile = {}) => {
  const user = { _id: id(), name, email: `${name.toLowerCase()}@example.com`, role: "user", fitnessProfile };
  users.set(String(user._id), user);
  return { user, token: generateToken(String(user._id)) };
};

const addWorkouts = (user, list) =>
  list.forEach(([category, duration, caloriesBurned, ago], i) =>
    workouts.push({ user: user._id, workoutName: `Secret workout name ${i}`, category, duration, caloriesBurned, workoutDate: daysAgo(ago) })
  );

// ---- fake Gemini answers ----
const GOOD_INSIGHTS = {
  performanceAnalysis: "You train consistently with solid session lengths.",
  improvementSuggestions: ["Add one strength session per week.", "Track your rest days.", "Increase duration by 5 minutes."],
  motivationalAdvice: "Great work - keep showing up!",
  fitnessProgressSummary: "Steady progress with a healthy routine.",
};
const ok = (obj) => () => ({ text: JSON.stringify(obj) });
const geminiError = (status, statusText) => Object.assign(new Error(`upstream ${status}`), { status, status_text: statusText });

// ---- HTTP helper against the real app ----
let server;
let base;
const get = async (path, token) => {
  const res = await fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json() };
};
const post = async (path, token, body) => {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

before(async () => {
  const app = require("../server");
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  Object.assign(console, realConsole);
});

beforeEach(() => {
  workouts = [];
  users.clear();
  sdkCalls.length = 0;
  findFilters.length = 0;
  sdkBehaviour = ok(GOOD_INSIGHTS);
});

// =====================================================================
describe("validateInsights (structure check of Gemini's answer)", () => {
  it("accepts a valid answer and keeps only the four expected fields", () => {
    const out = validateInsights({ ...GOOD_INSIGHTS, extra: "ignored" });
    assert.deepEqual(Object.keys(out).sort(), ["fitnessProgressSummary", "improvementSuggestions", "motivationalAdvice", "performanceAnalysis"]);
  });

  it("rejects a missing field, an empty text, an empty list, a non-array list and non-objects", () => {
    const bad = [
      { ...GOOD_INSIGHTS, performanceAnalysis: undefined },
      { ...GOOD_INSIGHTS, motivationalAdvice: "   " },
      { ...GOOD_INSIGHTS, improvementSuggestions: [] },
      { ...GOOD_INSIGHTS, improvementSuggestions: "just a string" },
      { ...GOOD_INSIGHTS, fitnessProgressSummary: 42 },
      [],
      null,
      "text",
    ];
    for (const value of bad) {
      assert.throws(() => validateInsights(value), (e) => e instanceof GeminiServiceError && e.statusCode === 502);
    }
  });

  it("drops blank suggestions and caps the list at 5", () => {
    const out = validateInsights({ ...GOOD_INSIGHTS, improvementSuggestions: ["a", "", "  ", "b", "c", "d", "e", "f", "g"] });
    assert.deepEqual(out.improvementSuggestions, ["a", "b", "c", "d", "e"]);
  });
});

// =====================================================================
describe("GET /api/ai/fitness-insights", () => {
  it("requires authentication (401 without / with a bad token)", async () => {
    assert.equal((await get("/api/ai/fitness-insights")).status, 401);
    assert.equal((await get("/api/ai/fitness-insights", "not-a-jwt")).status, 401);
    assert.equal(sdkCalls.length, 0);
  });

  it("returns statistics + the four AI sections for a user with workouts (5 workouts, avg 40 min, 1200 kcal)", async () => {
    const { user, token } = makeUser("Alice", { fitnessGoal: "Weight Loss", experienceLevel: "Beginner", age: 31, heightCm: 171, weightKg: 66 });
    addWorkouts(user, [["Cardio", 30, 200, 0], ["Strength", 50, 300, 1], ["Cardio", 40, 250, 2], ["HIIT", 45, 300, 4], ["Yoga", 35, 150, 6]]);

    const res = await get("/api/ai/fitness-insights", token);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data.statistics, { totalWorkouts: 5, averageWorkoutDuration: 40, totalCaloriesBurned: 1200 });
    assert.deepEqual(res.body.data.insights, GOOD_INSIGHTS);
    assert.equal(sdkCalls.length, 1);
  });

  it("uses gemini-2.5-flash by default and sends the right data (and no personal identifiers)", async () => {
    const { user, token } = makeUser("Alice", { fitnessGoal: "Weight Loss", experienceLevel: "Beginner", age: 31, heightCm: 171, weightKg: 66 });
    addWorkouts(user, [["Cardio", 30, 200, 0], ["Strength", 50, 300, 1]]);

    await get("/api/ai/fitness-insights", token);
    const request = sdkCalls[0];
    assert.equal(request.model, "gemini-2.5-flash");
    assert.equal(request.config.responseMimeType, "application/json");

    const prompt = request.contents;
    assert.match(prompt, /"totalWorkouts": 2/);
    assert.match(prompt, /"averageWorkoutDuration": 40/);
    assert.match(prompt, /"totalCaloriesBurned": 500/);
    assert.match(prompt, /Weight Loss/);
    assert.match(prompt, /Beginner/);
    for (const forbidden of ["Alice", "alice@example.com", String(user._id), "Secret workout name", "\"age\"", "heightCm", "weightKg"]) {
      assert.ok(!prompt.includes(forbidden), `the prompt must not contain "${forbidden}"`);
    }
  });

  it("honours GEMINI_MODEL from .env", async () => {
    process.env.GEMINI_MODEL = "gemini-2.5-flash-lite";
    try {
      const { user, token } = makeUser("Alice");
      addWorkouts(user, [["Cardio", 30, 200, 0]]);
      await get("/api/ai/fitness-insights", token);
      assert.equal(sdkCalls[0].model, "gemini-2.5-flash-lite");
    } finally {
      delete process.env.GEMINI_MODEL;
    }
  });

  it("removes ```json fences around Gemini's JSON before parsing", async () => {
    sdkBehaviour = () => ({ text: "```json\n" + JSON.stringify(GOOD_INSIGHTS) + "\n```" });
    const { user, token } = makeUser("Alice");
    addWorkouts(user, [["Cardio", 30, 200, 0]]);
    const res = await get("/api/ai/fitness-insights", token);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.insights, GOOD_INSIGHTS);
  });

  it("new user with ZERO workouts: 200, zero statistics, insights null, and Gemini is NOT called", async () => {
    const { token } = makeUser("Newbie");
    const res = await get("/api/ai/fitness-insights", token);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data.statistics, { totalWorkouts: 0, averageWorkoutDuration: 0, totalCaloriesBurned: 0 });
    assert.equal(res.body.data.insights, null);
    assert.match(res.body.message, /No workout history is available yet/);
    assert.equal(sdkCalls.length, 0);
  });

  it("only ever reads the authenticated user's own workouts (a userId in the query is ignored)", async () => {
    const alice = makeUser("Alice");
    const bob = makeUser("Bob");
    addWorkouts(alice.user, [["Cardio", 60, 500, 0]]);
    addWorkouts(bob.user, [["Strength", 20, 100, 0], ["Strength", 20, 100, 1], ["Strength", 20, 100, 2]]);

    const res = await get(`/api/ai/fitness-insights?userId=${bob.user._id}&user=${bob.user._id}`, alice.token);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.statistics, { totalWorkouts: 1, averageWorkoutDuration: 60, totalCaloriesBurned: 500 });
    assert.deepEqual([...new Set(findFilters)], [String(alice.user._id)]);
    assert.ok(!sdkCalls[0].contents.includes("Strength"), "Bob's data must not reach the prompt");
  });

  it("never leaks the API key to the client", async () => {
    const { user, token } = makeUser("Alice");
    addWorkouts(user, [["Cardio", 30, 200, 0]]);
    const res = await get("/api/ai/fitness-insights", token);
    assert.ok(!JSON.stringify(res.body).includes(process.env.GEMINI_API_KEY));
  });
});

// =====================================================================
describe("Gemini failures on /api/ai/fitness-insights (clean JSON error, server keeps running)", () => {
  const seedUser = () => {
    const { user, token } = makeUser("Alice");
    addWorkouts(user, [["Cardio", 30, 200, 0]]);
    return token;
  };
  const stillHealthy = async (token) => {
    sdkBehaviour = ok(GOOD_INSIGHTS);
    assert.equal((await get("/api/ai/fitness-insights", token)).status, 200);
  };

  it("503 UNAVAILABLE once, then success: the existing retry logic recovers (2 calls)", async () => {
    const token = seedUser();
    sdkBehaviour = (req, n) => {
      if (n === 1) throw geminiError(503, "UNAVAILABLE");
      return { text: JSON.stringify(GOOD_INSIGHTS) };
    };
    const res = await get("/api/ai/fitness-insights", token);
    assert.equal(res.status, 200);
    assert.equal(sdkCalls.length, 2);
  });

  it("503 UNAVAILABLE every time: exactly 3 attempts, then a clean 503 JSON error", async () => {
    const token = seedUser();
    sdkBehaviour = () => {
      throw geminiError(503, "UNAVAILABLE");
    };
    const res = await get("/api/ai/fitness-insights", token);
    assert.equal(res.status, 503);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /temporarily busy/i);
    assert.equal(sdkCalls.length, 3, "must not retry forever");
    await stillHealthy(token);
  });

  it("other temporary 5xx (500) are retried, then reported cleanly", async () => {
    const token = seedUser();
    sdkBehaviour = () => {
      throw geminiError(500, "INTERNAL");
    };
    const res = await get("/api/ai/fitness-insights", token);
    assert.equal(res.status, 503);
    assert.equal(res.body.success, false);
    assert.equal(sdkCalls.length, 3);
  });

  it("rate limit (429): clean 429 JSON error", async () => {
    const token = seedUser();
    sdkBehaviour = () => {
      throw geminiError(429, "RESOURCE_EXHAUSTED");
    };
    const res = await get("/api/ai/fitness-insights", token);
    assert.equal(res.status, 429);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /rate limit/i);
    await stillHealthy(token);
  });

  it("timeout (AbortError): retried, then a clean 504 JSON error", async () => {
    const token = seedUser();
    sdkBehaviour = () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    };
    const res = await get("/api/ai/fitness-insights", token);
    assert.equal(res.status, 504);
    assert.equal(res.body.success, false);
    assert.equal(sdkCalls.length, 3);
  });

  it("permanent error (invalid key, 403): NOT retried, clean 500 JSON error, no secrets", async () => {
    const token = seedUser();
    sdkBehaviour = () => {
      throw geminiError(403, "PERMISSION_DENIED");
    };
    const res = await get("/api/ai/fitness-insights", token);
    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
    assert.equal(sdkCalls.length, 1);
    assert.ok(!JSON.stringify(res.body).includes(process.env.GEMINI_API_KEY));
  });

  it("Gemini answers with JSON of the wrong structure: clean 502, no crash", async () => {
    const token = seedUser();
    sdkBehaviour = ok({ performanceAnalysis: "only one field" });
    const res = await get("/api/ai/fitness-insights", token);
    assert.equal(res.status, 502);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /incomplete insights response/i);
    await stillHealthy(token);
  });

  it("Gemini answers with text that is not JSON: clean 502, no crash", async () => {
    const token = seedUser();
    sdkBehaviour = () => ({ text: "Sorry, I cannot help with that." });
    const res = await get("/api/ai/fitness-insights", token);
    assert.equal(res.status, 502);
    assert.equal(res.body.success, false);
    await stillHealthy(token);
  });

  it("Gemini answers with an empty response: clean 502", async () => {
    const token = seedUser();
    sdkBehaviour = () => ({ text: "" });
    const res = await get("/api/ai/fitness-insights", token);
    assert.equal(res.status, 502);
    assert.equal(res.body.success, false);
  });
});

// =====================================================================
describe("The existing AI workout recommendation is unchanged", () => {
  const RECOMMENDATION = {
    workoutPlan: { overview: "A gentle 4-week plan.", durationWeeks: 4 },
    weeklySchedule: [{ day: "Monday", focus: "Cardio", exercises: ["Jog"] }],
    suitableExercises: ["Walking"],
    trainingTips: ["Warm up"],
    safetyRecommendations: ["Hydrate"],
    motivationalMessage: "You can do it!",
    disclaimer: "General guidance, not medical advice.",
  };

  it("POST /api/ai/recommendation still returns { input, basedOn, recommendation } with the same fields", async () => {
    sdkBehaviour = ok(RECOMMENDATION);
    const { user, token } = makeUser("Alice", { age: 25, fitnessGoal: "Endurance", experienceLevel: "Intermediate" });
    addWorkouts(user, [["Cardio", 30, 200, 0], ["Strength", 50, 300, 1]]);

    const res = await post("/api/ai/recommendation", token, {});
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(Object.keys(res.body.data).sort(), ["basedOn", "input", "recommendation"]);
    assert.deepEqual(res.body.data.recommendation, RECOMMENDATION);
    assert.deepEqual(res.body.data.basedOn, { recentWorkouts: 2, activeGoals: 0 });
    assert.equal(sdkCalls.length, 1);
    assert.equal(sdkCalls[0].model, "gemini-2.5-flash");
  });

  it("POST /api/ai/recommendation still validates input (400) and requires a login (401)", async () => {
    const { token } = makeUser("Alice", { age: 25, fitnessGoal: "Endurance", experienceLevel: "Intermediate" });
    assert.equal((await post("/api/ai/recommendation", token, { age: 5 })).status, 400);
    const noAuth = await fetch(base + "/api/ai/recommendation", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(noAuth.status, 401);
  });

  it("the two AI endpoints are independent (POST /fitness-insights and GET /recommendation do not exist)", async () => {
    const { token } = makeUser("Alice");
    assert.equal((await post("/api/ai/fitness-insights", token, {})).status, 404);
    assert.equal((await get("/api/ai/recommendation", token)).status, 404);
  });
});
