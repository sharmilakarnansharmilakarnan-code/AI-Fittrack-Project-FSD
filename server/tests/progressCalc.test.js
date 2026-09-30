const test = require("node:test");
const assert = require("node:assert");
const {
  computeStreaks,
  bucketWeekly,
  computeConsistency,
  computeGoalProgress,
} = require("../utils/progressCalc");

const T = (s) => new Date(`${s}T12:00:00Z`);

test("streak: empty history", () => {
  assert.deepStrictEqual(computeStreaks([], T("2026-09-20")), { current: 0, longest: 0, lastWorkoutDay: null });
});

test("streak: run ending today counts today", () => {
  const r = computeStreaks(["2026-09-18", "2026-09-19", "2026-09-20"], T("2026-09-20"));
  assert.strictEqual(r.current, 3);
  assert.strictEqual(r.longest, 3);
});

test("streak: still alive if the last workout was yesterday", () => {
  assert.strictEqual(computeStreaks(["2026-09-18", "2026-09-19"], T("2026-09-20")).current, 2);
});

test("streak: broken after a missed day, longest is remembered", () => {
  const r = computeStreaks(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-19"], T("2026-09-21"));
  assert.strictEqual(r.current, 0);
  assert.strictEqual(r.longest, 4);
});

test("streak: duplicate days and unsorted input are handled", () => {
  const r = computeStreaks(["2026-09-20", "2026-09-19", "2026-09-19", "2026-09-18"], T("2026-09-20"));
  assert.strictEqual(r.current, 3);
});

test("weekly: last N ISO weeks (Mon-Sun), oldest first", () => {
  // 2026-09-20 is a Sunday -> its week is Mon 2026-09-14 .. Sun 2026-09-20
  const weeks = bucketWeekly([], 4, T("2026-09-20"));
  assert.deepStrictEqual(weeks.map((w) => w.weekStart), ["2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14"]);
});

test("weekly: correct totals for the current week", () => {
  const rows = [
    { day: "2026-09-14", workouts: 1, duration: 30, calories: 200 },
    { day: "2026-09-20", workouts: 2, duration: 50, calories: 400 },
  ];
  const weeks = bucketWeekly(rows, 3, T("2026-09-20"));
  const last = weeks[weeks.length - 1];
  assert.strictEqual(last.weekStart, "2026-09-14");
  assert.strictEqual(last.weekEnd, "2026-09-20");
  assert.deepStrictEqual([last.workouts, last.duration, last.calories, last.activeDays], [3, 80, 600, 2]);
  assert.strictEqual(weeks[0].workouts, 0); // empty week present
});

test("weekly: rows outside the window are ignored", () => {
  const weeks = bucketWeekly([{ day: "2026-01-01", workouts: 5, duration: 1, calories: 1 }], 2, T("2026-09-20"));
  assert.strictEqual(weeks.reduce((n, w) => n + w.workouts, 0), 0);
});

test("consistency: share of active days in the window", () => {
  const days = ["2026-09-20", "2026-09-19", "2026-09-10", "2026-08-01"]; // last one is outside 30 days
  const c = computeConsistency(days, 30, T("2026-09-20"));
  assert.strictEqual(c.activeDays, 3);
  assert.strictEqual(c.percentage, 10);
});

test("goal progress: 0-100, one decimal, safe for bad input", () => {
  assert.strictEqual(computeGoalProgress(5, 20), 25);
  assert.strictEqual(computeGoalProgress(1, 3), 33.3);
  assert.strictEqual(computeGoalProgress(50, 20), 100); // capped
  assert.strictEqual(computeGoalProgress(0, 20), 0);
  assert.strictEqual(computeGoalProgress(-5, 20), 0);
  assert.strictEqual(computeGoalProgress(5, 0), 0); // no divide by zero
  assert.strictEqual(computeGoalProgress("abc", 10), 0);
  assert.strictEqual(computeGoalProgress(5, NaN), 0);
});
