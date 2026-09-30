/**
 * End-to-end API tests for the AI-FitTrack REST API.
 *
 * They talk HTTP to a RUNNING server (and its MongoDB), exactly like Thunder
 * Client / Postman would - the React app is not involved.
 *
 *   1. start MongoDB and the backend   (npm run dev)
 *   2. npm run test:api
 *
 * Environment (all optional):
 *   TEST_BASE_URL        default http://localhost:5000
 *   TEST_ADMIN_EMAIL /
 *   TEST_ADMIN_PASSWORD  an admin created with `npm run create-admin`. Without it the
 *                        admin tests that need an admin are skipped (the "non-admin
 *                        is rejected" tests still run).
 *
 * Every run registers its own throw-away users (unique e-mails). With an admin
 * account they are deleted again at the end.
 * The AI test accepts either a real recommendation or a clean JSON error
 * (e.g. no GEMINI_API_KEY / no internet) - what it verifies is that the endpoint
 * validates its input, requires a login and never crashes the server.
 */
const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");

const BASE = (process.env.TEST_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const HAS_ADMIN = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);

const RUN = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const PASSWORD = "Pass@1234";
const A = { name: "Test Alice", email: `alice.${RUN}@example.com` };
const B = { name: "Test Bob", email: `bob.${RUN}@example.com` };
const OTHER_ID = "64b7f0c2a1b2c3d4e5f60718"; // valid ObjectId that does not exist

const call = async (method, path, { token, body, headers } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (err) {
    json = null; // a non-JSON answer fails the assertions below
  }
  return { status: res.status, body: json };
};

/** Every answer must be the standard JSON envelope. */
const expectJson = (res, status) => {
  assert.equal(res.status, status, `expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(res.body && typeof res.body.success === "boolean" && typeof res.body.message === "string", "response is not the standard JSON format");
  assert.equal(res.body.success, status < 400);
  return res.body;
};

const state = { aliceToken: null, aliceId: null, bobToken: null, bobId: null, adminToken: null };
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

describe("Health", () => {
  it("GET /api/health reports server, database and Gemini status", async () => {
    const res = await call("GET", "/api/health");
    const body = expectJson(res, 200);
    assert.equal(body.data.server, "running");
    assert.equal(body.data.database, "connected");
    assert.ok(["configured", "not_configured"].includes(body.data.gemini));
  });

  it("an unknown route returns a JSON 404", async () => {
    expectJson(await call("GET", "/api/does-not-exist"), 404);
  });
});

describe("Authentication", () => {
  it("registers a user (role is always 'user', password never returned)", async () => {
    const res = await call("POST", "/api/auth/register", { body: { ...A, password: PASSWORD, role: "admin" } });
    const body = expectJson(res, 201);
    assert.equal(body.data.user.role, "user");
    assert.ok(body.data.token);
    assert.ok(!JSON.stringify(body).includes("password"));
    state.aliceId = body.data.user.id;
  });

  it("rejects a duplicate e-mail with 409", async () => {
    expectJson(await call("POST", "/api/auth/register", { body: { ...A, password: PASSWORD } }), 409);
  });

  it("validates registration input (400)", async () => {
    expectJson(await call("POST", "/api/auth/register", { body: { name: "X Y", email: "not-an-email", password: PASSWORD } }), 400);
    expectJson(await call("POST", "/api/auth/register", { body: { name: "X Y", email: `x.${RUN}@example.com`, password: "123" } }), 400);
    expectJson(await call("POST", "/api/auth/register", { body: { name: "", email: `y.${RUN}@example.com`, password: PASSWORD } }), 400);
    expectJson(await call("POST", "/api/auth/register", { body: { name: "X Y", email: `z.${RUN}@example.com`, password: { $gt: "" } } }), 400);
  });

  it("logs in and returns a JWT", async () => {
    const body = expectJson(await call("POST", "/api/auth/login", { body: { email: A.email, password: PASSWORD } }), 200);
    assert.ok(body.data.token);
    state.aliceToken = body.data.token;
  });

  it("rejects wrong credentials (401) and bad input (400)", async () => {
    expectJson(await call("POST", "/api/auth/login", { body: { email: A.email, password: "Wrong@123" } }), 401);
    expectJson(await call("POST", "/api/auth/login", { body: { email: "nobody@example.com", password: PASSWORD } }), 401);
    expectJson(await call("POST", "/api/auth/login", { body: { email: "bad", password: PASSWORD } }), 400);
    expectJson(await call("POST", "/api/auth/login", { body: { email: A.email, password: { $ne: 1 } } }), 400);
  });

  it("protects /api/auth/profile (401 without / with an invalid JWT)", async () => {
    expectJson(await call("GET", "/api/auth/profile"), 401);
    expectJson(await call("GET", "/api/auth/profile", { token: "not.a.jwt" }), 401);
    expectJson(await call("GET", "/api/auth/profile", { headers: { Authorization: "Token abc" } }), 401);
  });

  it("returns and updates the fitness profile", async () => {
    const got = expectJson(await call("GET", "/api/auth/profile", { token: state.aliceToken }), 200);
    assert.equal(got.data.user.email, A.email);
    assert.equal(got.data.user.role, "user");

    const put = expectJson(
      await call("PUT", "/api/auth/profile", { token: state.aliceToken, body: { age: 28, heightCm: 172, weightKg: 68.5, experienceLevel: "intermediate", fitnessGoal: "Build  endurance", role: "admin" } }),
      200
    );
    assert.deepEqual(put.data.user.fitnessProfile, { age: 28, heightCm: 172, weightKg: 68.5, experienceLevel: "Intermediate", fitnessGoal: "Build endurance" });
    assert.equal(put.data.user.role, "user", "the profile endpoint must not change the role");
  });

  it("validates profile updates (400) and requires a login (401)", async () => {
    expectJson(await call("PUT", "/api/auth/profile", { token: state.aliceToken, body: { age: 5 } }), 400);
    expectJson(await call("PUT", "/api/auth/profile", { token: state.aliceToken, body: { experienceLevel: "Wizard" } }), 400);
    expectJson(await call("PUT", "/api/auth/profile", { token: state.aliceToken, body: {} }), 400);
    expectJson(await call("PUT", "/api/auth/profile", { body: { age: 30 } }), 401);
  });

  it("registers a second user for the ownership tests", async () => {
    const reg = expectJson(await call("POST", "/api/auth/register", { body: { ...B, password: PASSWORD } }), 201);
    state.bobToken = reg.data.token;
    state.bobId = reg.data.user.id;
  });
});

describe("Workouts (CRUD, search, ownership)", () => {
  const workout = { workoutName: "Morning Run", category: "Cardio", duration: 30, caloriesBurned: 250, workoutDate: today };
  let workoutId;

  it("requires a login", async () => {
    expectJson(await call("GET", "/api/workouts"), 401);
    expectJson(await call("POST", "/api/workouts", { body: workout }), 401);
  });

  it("creates a workout owned by the JWT user (a client-sent user id is ignored)", async () => {
    const body = expectJson(await call("POST", "/api/workouts", { token: state.aliceToken, body: { ...workout, user: state.bobId } }), 201);
    assert.equal(body.data.workout.user, state.aliceId);
    workoutId = body.data.workout._id;
  });

  it("rejects invalid workouts (400)", async () => {
    const bad = [{ ...workout, duration: 0 }, { ...workout, duration: -5 }, { ...workout, caloriesBurned: -1 }, { ...workout, category: "Zumba" }, { ...workout, workoutName: "" }, { ...workout, workoutDate: "not-a-date" }, { workoutName: "Only name" }];
    for (const body of bad) expectJson(await call("POST", "/api/workouts", { token: state.aliceToken, body }), 400);
  });

  it("lists own workouts only, with pagination", async () => {
    const mine = expectJson(await call("GET", "/api/workouts?limit=5", { token: state.aliceToken }), 200);
    assert.equal(mine.data.workouts.length, 1);
    assert.equal(mine.data.pagination.total, 1);
    const theirs = expectJson(await call("GET", "/api/workouts", { token: state.bobToken }), 200);
    assert.equal(theirs.data.workouts.length, 0);
    expectJson(await call("GET", "/api/workouts?limit=500", { token: state.aliceToken }), 400);
  });

  it("gets a workout by id (400 invalid id, 404 unknown, 403 someone else's)", async () => {
    expectJson(await call("GET", `/api/workouts/${workoutId}`, { token: state.aliceToken }), 200);
    expectJson(await call("GET", "/api/workouts/not-an-id", { token: state.aliceToken }), 400);
    expectJson(await call("GET", `/api/workouts/${OTHER_ID}`, { token: state.aliceToken }), 404);
    expectJson(await call("GET", `/api/workouts/${workoutId}`, { token: state.bobToken }), 403);
  });

  it("searches by name, category and date (own workouts only)", async () => {
    const count = async (q, token = state.aliceToken) => expectJson(await call("GET", `/api/workouts/search?${q}`, { token }), 200).data.workouts.length;
    assert.equal(await count("query=morning"), 1);
    assert.equal(await count("workoutName=run"), 1);
    assert.equal(await count("category=cardio"), 1);
    assert.equal(await count(`date=${today}`), 1);
    assert.equal(await count(`date=${yesterday}`), 0);
    assert.equal(await count("query=yoga"), 0);
    assert.equal(await count("query=morning", state.bobToken), 0);
    assert.equal(await count("query=%5B"), 0, "regex characters are matched literally");
    expectJson(await call("GET", "/api/workouts/search?date=nope", { token: state.aliceToken }), 400);
    expectJson(await call("GET", "/api/workouts/search?query[$ne]=x", { token: state.aliceToken }), 400);
  });

  it("updates a workout (400 invalid, 403 someone else's)", async () => {
    const body = expectJson(await call("PUT", `/api/workouts/${workoutId}`, { token: state.aliceToken, body: { duration: 45 } }), 200);
    assert.equal(body.data.workout.duration, 45);
    expectJson(await call("PUT", `/api/workouts/${workoutId}`, { token: state.aliceToken, body: { duration: 0 } }), 400);
    expectJson(await call("PUT", `/api/workouts/${workoutId}`, { token: state.aliceToken, body: {} }), 400);
    expectJson(await call("PUT", `/api/workouts/${workoutId}`, { token: state.bobToken, body: { duration: 5 } }), 403);
  });

  it("deletes a workout (403 someone else's, then 404 once deleted)", async () => {
    expectJson(await call("DELETE", `/api/workouts/${workoutId}`, { token: state.bobToken }), 403);
    expectJson(await call("DELETE", `/api/workouts/${workoutId}`, { token: state.aliceToken }), 200);
    expectJson(await call("GET", `/api/workouts/${workoutId}`, { token: state.aliceToken }), 404);
  });
});

describe("Attendance (gym check-in / check-out)", () => {
  it("requires a login", async () => {
    expectJson(await call("POST", "/api/attendance/check-in"), 401);
    expectJson(await call("GET", "/api/attendance"), 401);
  });

  it("cannot check out when not checked in (409)", async () => {
    expectJson(await call("POST", "/api/attendance/check-out", { token: state.aliceToken }), 409);
  });

  it("checks in, and a second check-in is rejected (409)", async () => {
    const body = expectJson(await call("POST", "/api/attendance/check-in", { token: state.aliceToken }), 201);
    assert.equal(body.data.attendance.isOpen, true);
    expectJson(await call("POST", "/api/attendance/check-in", { token: state.aliceToken }), 409);
  });

  it("shows the open visit in the history, then checks out", async () => {
    const hist = expectJson(await call("GET", "/api/attendance", { token: state.aliceToken }), 200);
    assert.equal(hist.data.attendance.length, 1);
    assert.ok(hist.data.currentVisit);
    const out = expectJson(await call("POST", "/api/attendance/check-out", { token: state.aliceToken }), 200);
    assert.equal(out.data.attendance.isOpen, false);
    assert.ok(out.data.attendance.checkOutTime);
    expectJson(await call("POST", "/api/attendance/check-out", { token: state.aliceToken }), 409);
    const after = expectJson(await call("GET", "/api/attendance", { token: state.aliceToken }), 200);
    assert.equal(after.data.currentVisit, null);
  });

  it("history is private and validated", async () => {
    const bob = expectJson(await call("GET", "/api/attendance", { token: state.bobToken }), 200);
    assert.equal(bob.data.attendance.length, 0);
    expectJson(await call("GET", "/api/attendance?from=nope", { token: state.aliceToken }), 400);
  });
});

describe("Goals (CRUD, server-calculated progress)", () => {
  let manualId;
  let derivedId;

  it("requires a login", async () => {
    expectJson(await call("GET", "/api/goals"), 401);
  });

  it("creates a manual goal; a client-sent progress / status is ignored", async () => {
    const body = expectJson(
      await call("POST", "/api/goals", { token: state.aliceToken, body: { title: "Run 10 times", targetValue: 10, currentValue: 3, unit: "runs", targetDate: "2040-12-31", progress: 100, status: "completed", user: state.bobId } }),
      201
    );
    assert.equal(body.data.goal.progress, 30);
    assert.equal(body.data.goal.status, "active");
    assert.equal(body.data.goal.user, state.aliceId);
    manualId = body.data.goal._id;
  });

  it("creates a goal that is calculated from stored workouts / visits", async () => {
    const body = expectJson(
      await call("POST", "/api/goals", { token: state.aliceToken, body: { title: "Visit the gym", metric: "visits", targetValue: 4, startDate: yesterday, targetDate: "2040-12-31" } }),
      201
    );
    assert.equal(body.data.goal.currentValue, 1, "Alice has one gym visit");
    assert.equal(body.data.goal.progress, 25);
    derivedId = body.data.goal._id;
  });

  it("rejects invalid goals (400)", async () => {
    const good = { title: "Goal", targetValue: 5, targetDate: "2040-12-31" };
    for (const body of [{ ...good, targetValue: 0 }, { ...good, title: "" }, { ...good, targetDate: undefined }, { ...good, metric: "magic" }, { ...good, currentValue: -1 }, { ...good, startDate: "2041-01-01" }]) {
      expectJson(await call("POST", "/api/goals", { token: state.aliceToken, body }), 400);
    }
  });

  it("lists, filters and gets goals (only the owner's)", async () => {
    const list = expectJson(await call("GET", "/api/goals", { token: state.aliceToken }), 200);
    assert.equal(list.data.goals.length, 2);
    expectJson(await call("GET", "/api/goals?status=completed", { token: state.aliceToken }), 200);
    expectJson(await call("GET", "/api/goals?status=weird", { token: state.aliceToken }), 400);
    assert.equal(expectJson(await call("GET", "/api/goals", { token: state.bobToken }), 200).data.goals.length, 0);
    expectJson(await call("GET", `/api/goals/${manualId}`, { token: state.aliceToken }), 200);
    expectJson(await call("GET", `/api/goals/${manualId}`, { token: state.bobToken }), 403);
    expectJson(await call("GET", "/api/goals/xyz", { token: state.aliceToken }), 400);
    expectJson(await call("GET", `/api/goals/${OTHER_ID}`, { token: state.aliceToken }), 404);
  });

  it("updates progress: the server recalculates, completes the goal at 100%", async () => {
    const half = expectJson(await call("PUT", `/api/goals/${manualId}`, { token: state.aliceToken, body: { currentValue: 5, progress: 5 } }), 200);
    assert.equal(half.data.goal.progress, 50);
    const done = expectJson(await call("PUT", `/api/goals/${manualId}`, { token: state.aliceToken, body: { currentValue: 12 } }), 200);
    assert.equal(done.data.goal.progress, 100);
    assert.equal(done.data.goal.status, "completed");
  });

  it("rejects bad or forbidden goal updates", async () => {
    expectJson(await call("PUT", `/api/goals/${derivedId}`, { token: state.aliceToken, body: { currentValue: 3 } }), 400);
    expectJson(await call("PUT", `/api/goals/${manualId}`, { token: state.aliceToken, body: { status: "completed" } }), 400);
    expectJson(await call("PUT", `/api/goals/${manualId}`, { token: state.aliceToken, body: {} }), 400);
    expectJson(await call("PUT", `/api/goals/${manualId}`, { token: state.bobToken, body: { title: "hijack" } }), 403);
  });

  it("deletes goals (403 someone else's, then 404)", async () => {
    expectJson(await call("DELETE", `/api/goals/${manualId}`, { token: state.bobToken }), 403);
    expectJson(await call("DELETE", `/api/goals/${manualId}`, { token: state.aliceToken }), 200);
    expectJson(await call("GET", `/api/goals/${manualId}`, { token: state.aliceToken }), 404);
    expectJson(await call("DELETE", `/api/goals/${derivedId}`, { token: state.aliceToken }), 200);
  });
});

describe("Progress", () => {
  it("requires a login", async () => {
    expectJson(await call("GET", "/api/progress/summary"), 401);
    expectJson(await call("GET", "/api/progress/weekly"), 401);
  });

  it("is empty for a user without workouts", async () => {
    const body = expectJson(await call("GET", "/api/progress/summary", { token: state.bobToken }), 200);
    assert.equal(body.data.summary.totals.workouts, 0);
    assert.equal(body.data.summary.streak.current, 0);
  });

  it("is calculated from the user's own workouts", async () => {
    for (const [name, category, minutes, kcal, date] of [["Run", "Cardio", 30, 200, today], ["Lift", "Strength", 60, 300, yesterday]]) {
      expectJson(await call("POST", "/api/workouts", { token: state.aliceToken, body: { workoutName: name, category, duration: minutes, caloriesBurned: kcal, workoutDate: date } }), 201);
    }
    const s = expectJson(await call("GET", "/api/progress/summary", { token: state.aliceToken }), 200).data.summary;
    assert.equal(s.totals.workouts, 2);
    assert.equal(s.totals.totalDuration, 90);
    assert.equal(s.totals.averageDuration, 45);
    assert.equal(s.totals.totalCalories, 500);
    assert.equal(s.categoryDistribution.length, 2);
    assert.equal(s.streak.current, 2);
    assert.equal(s.streak.longest, 2);
    assert.equal(s.frequency.last7Days, 2);
    assert.equal(s.attendance.visitsLast30Days, 1);
  });

  it("returns weekly buckets and validates the range", async () => {
    const body = expectJson(await call("GET", "/api/progress/weekly?weeks=3", { token: state.aliceToken }), 200);
    assert.equal(body.data.weekly.length, 3);
    assert.equal(body.data.weekly.reduce((n, w) => n + w.workouts, 0), 2);
    expectJson(await call("GET", "/api/progress/weekly?weeks=0", { token: state.aliceToken }), 400);
    expectJson(await call("GET", "/api/progress/weekly?weeks=abc", { token: state.aliceToken }), 400);
  });
});

describe("AI recommendation", () => {
  const CLEAN_AI_FAILURES = [429, 500, 502, 504];

  it("requires a login", async () => {
    expectJson(await call("POST", "/api/ai/recommendation", { body: {} }), 401);
  });

  it("validates its input (400)", async () => {
    expectJson(await call("POST", "/api/ai/recommendation", { token: state.aliceToken, body: { age: 5 } }), 400);
    expectJson(await call("POST", "/api/ai/recommendation", { token: state.aliceToken, body: { experienceLevel: "Wizard" } }), 400);
  });

  it("asks for the missing fitness information when there is none (400)", async () => {
    const res = await call("POST", "/api/ai/recommendation", { token: state.bobToken, body: {} }); // Bob has no fitness profile
    const body = expectJson(res, 400);
    assert.ok(Array.isArray(body.errors) && body.errors.length === 3);
  });

  it("returns a recommendation, or a clean JSON error - never a crash", async () => {
    const res = await call("POST", "/api/ai/recommendation", { token: state.aliceToken, body: {} }); // uses Alice's saved profile
    assert.ok(res.body && typeof res.body.success === "boolean" && typeof res.body.message === "string", "not the standard JSON format");
    if (res.status === 200) {
      assert.equal(res.body.data.input.experienceLevel, "Intermediate");
      assert.ok(res.body.data.basedOn.recentWorkouts >= 1);
      assert.ok(res.body.data.recommendation && typeof res.body.data.recommendation === "object");
    } else {
      assert.ok(CLEAN_AI_FAILURES.includes(res.status), `unexpected status ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.success, false);
      assert.ok(!/GEMINI_API_KEY=|AIza|stack/i.test(JSON.stringify(res.body)), "the error must not leak secrets");
    }
    const health = expectJson(await call("GET", "/api/health"), 200); // the server is still alive
    assert.equal(health.data.server, "running");
  });
});

describe("AI Fitness Insights", () => {
  const CLEAN_AI_FAILURES = [429, 500, 502, 503, 504];

  it("requires a login", async () => {
    expectJson(await call("GET", "/api/ai/fitness-insights"), 401);
  });

  it("a user with no workouts gets zero statistics and no AI call (200, insights null)", async () => {
    const body = expectJson(await call("GET", "/api/ai/fitness-insights", { token: state.bobToken }), 200); // Bob has no workouts
    assert.deepEqual(body.data.statistics, { totalWorkouts: 0, averageWorkoutDuration: 0, totalCaloriesBurned: 0 });
    assert.equal(body.data.insights, null);
  });

  it("returns statistics and the four insight sections, or a clean JSON error - never a crash", async () => {
    const res = await call("GET", "/api/ai/fitness-insights", { token: state.aliceToken });
    assert.ok(res.body && typeof res.body.success === "boolean" && typeof res.body.message === "string", "not the standard JSON format");
    if (res.status === 200) {
      const { statistics, insights } = res.body.data;
      assert.ok(statistics.totalWorkouts >= 1);
      assert.ok(statistics.averageWorkoutDuration > 0 && statistics.totalCaloriesBurned >= 0);
      assert.ok(typeof insights.performanceAnalysis === "string" && insights.performanceAnalysis.length > 0);
      assert.ok(Array.isArray(insights.improvementSuggestions) && insights.improvementSuggestions.length >= 1);
      assert.ok(typeof insights.motivationalAdvice === "string" && insights.motivationalAdvice.length > 0);
      assert.ok(typeof insights.fitnessProgressSummary === "string" && insights.fitnessProgressSummary.length > 0);
    } else {
      assert.ok(CLEAN_AI_FAILURES.includes(res.status), `unexpected status ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.success, false);
      assert.ok(!/GEMINI_API_KEY=|AIza|stack/i.test(JSON.stringify(res.body)), "the error must not leak secrets");
    }
    const health = expectJson(await call("GET", "/api/health"), 200); // the server is still alive
    assert.equal(health.data.server, "running");
  });
});

describe("Admin authorization", () => {
  const adminGets = ["/api/admin/stats", "/api/admin/users", `/api/admin/users/${OTHER_ID}`];

  it("rejects requests without a login (401)", async () => {
    for (const path of adminGets) expectJson(await call("GET", path), 401);
  });

  it("rejects normal users (403) on every admin route", async () => {
    for (const path of adminGets) expectJson(await call("GET", path, { token: state.aliceToken }), 403);
    expectJson(await call("PUT", `/api/admin/users/${state.bobId}/role`, { token: state.aliceToken, body: { role: "admin" } }), 403);
    expectJson(await call("DELETE", `/api/admin/users/${state.bobId}`, { token: state.aliceToken }), 403);
  });

  it("admin: statistics, user list, user details", { skip: !HAS_ADMIN && "set TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD" }, async () => {
    const login = expectJson(await call("POST", "/api/auth/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } }), 200);
    assert.equal(login.data.user.role, "admin");
    state.adminToken = login.data.token;

    const stats = expectJson(await call("GET", "/api/admin/stats", { token: state.adminToken }), 200).data.stats;
    assert.ok(stats.users.total >= 3 && stats.users.byRole.admin >= 1 && stats.workouts.total >= 2);

    const list = expectJson(await call("GET", `/api/admin/users?q=${RUN}`, { token: state.adminToken }), 200);
    assert.equal(list.data.users.length, 2);
    assert.ok(!JSON.stringify(list).includes("password"));
    expectJson(await call("GET", "/api/admin/users?role=boss", { token: state.adminToken }), 400);

    const one = expectJson(await call("GET", `/api/admin/users/${state.aliceId}`, { token: state.adminToken }), 200).data.user;
    assert.equal(one.counts.workouts, 2);
    expectJson(await call("GET", "/api/admin/users/xyz", { token: state.adminToken }), 400);
    expectJson(await call("GET", `/api/admin/users/${OTHER_ID}`, { token: state.adminToken }), 404);
  });

  it("admin: role changes take effect immediately and can be reverted", { skip: !HAS_ADMIN && "set TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD" }, async () => {
    const promoted = expectJson(await call("PUT", `/api/admin/users/${state.bobId}/role`, { token: state.adminToken, body: { role: "admin" } }), 200);
    assert.equal(promoted.data.user.role, "admin");
    expectJson(await call("GET", "/api/admin/stats", { token: state.bobToken }), 200);
    expectJson(await call("PUT", `/api/admin/users/${state.bobId}/role`, { token: state.adminToken, body: { role: "user" } }), 200);
    expectJson(await call("GET", "/api/admin/stats", { token: state.bobToken }), 403);
    expectJson(await call("PUT", `/api/admin/users/${state.bobId}/role`, { token: state.adminToken, body: { role: "superuser" } }), 400);
    expectJson(await call("PUT", `/api/admin/users/${state.bobId}/role`, { token: state.adminToken, body: {} }), 400);
    expectJson(await call("PUT", `/api/admin/users/${OTHER_ID}/role`, { token: state.adminToken, body: { role: "user" } }), 404);
    const adminId = expectJson(await call("GET", "/api/auth/profile", { token: state.adminToken }), 200).data.user.id;
    expectJson(await call("PUT", `/api/admin/users/${adminId}/role`, { token: state.adminToken, body: { role: "user" } }), 400);
    expectJson(await call("DELETE", `/api/admin/users/${adminId}`, { token: state.adminToken }), 400);
  });

  after(async () => {
    if (!HAS_ADMIN || !state.adminToken) return;
    for (const id of [state.aliceId, state.bobId]) if (id) await call("DELETE", `/api/admin/users/${id}`, { token: state.adminToken });
  });

  it("admin: deleting a user also deletes their workouts, goals and visits", { skip: !HAS_ADMIN && "set TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD" }, async () => {
    expectJson(await call("POST", "/api/goals", { token: state.aliceToken, body: { title: "Cascade check", targetValue: 3, targetDate: "2040-12-31" } }), 201);
    const del = expectJson(await call("DELETE", `/api/admin/users/${state.aliceId}`, { token: state.adminToken }), 200);
    assert.deepEqual(del.data.deleted, { workouts: 2, goals: 1, visits: 1 });
    expectJson(await call("GET", `/api/admin/users/${state.aliceId}`, { token: state.adminToken }), 404);
    expectJson(await call("POST", "/api/auth/login", { body: { email: A.email, password: PASSWORD } }), 401);
    expectJson(await call("GET", "/api/auth/profile", { token: state.aliceToken }), 401);
    expectJson(await call("DELETE", `/api/admin/users/${state.aliceId}`, { token: state.adminToken }), 404);
  });
});
