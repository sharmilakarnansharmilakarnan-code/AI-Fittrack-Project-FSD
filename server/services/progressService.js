const Workout = require("../models/Workout");
const Attendance = require("../models/Attendance");
const { addDays, startOfUtcDay, toDayKey } = require("../utils/dateUtils");
const { computeStreaks, bucketWeekly, computeConsistency } = require("../utils/progressCalc");

/**
 * Per-day totals of one user's workouts (MongoDB aggregation).
 * Returns [{ day: "YYYY-MM-DD", workouts, duration, calories }] oldest first.
 */
const getDailyRollup = async (userId, from = null, to = null) => {
  const match = { user: userId };
  if (from || to) {
    match.workoutDate = {};
    if (from) match.workoutDate.$gte = from;
    if (to) match.workoutDate.$lt = to;
  }
  const rows = await Workout.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$workoutDate" } },
        workouts: { $sum: 1 },
        duration: { $sum: "$duration" },
        calories: { $sum: "$caloriesBurned" },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ day: r._id, workouts: r.workouts, duration: r.duration, calories: r.calories }));
};

const round1 = (n) => Math.round((n || 0) * 10) / 10;

const sumRows = (rows) =>
  rows.reduce(
    (acc, r) => ({ workouts: acc.workouts + r.workouts, duration: acc.duration + r.duration, calories: acc.calories + r.calories }),
    { workouts: 0, duration: 0, calories: 0 }
  );

/**
 * Progress summary for one user: totals, category distribution, recent
 * frequency, workout streaks, consistency and gym visits. All numbers are
 * calculated from the user's own stored workouts / attendance.
 */
const getSummary = async (userId, today = new Date()) => {
  const [allDays, categories, visits] = await Promise.all([
    getDailyRollup(userId),
    Workout.aggregate([
      { $match: { user: userId } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Attendance.countDocuments({ user: userId, checkInTime: { $gte: addDays(startOfUtcDay(today), -29) } }),
  ]);

  const totals = sumRows(allDays);
  const dayKeys = allDays.map((r) => r.day);
  const tomorrow = addDays(startOfUtcDay(today), 1);
  const inLast = (days) => allDays.filter((r) => r.day >= toDayKey(addDays(tomorrow, -days)) && r.day < toDayKey(tomorrow));
  const categoryTotal = categories.reduce((n, c) => n + c.count, 0);

  return {
    totals: {
      workouts: totals.workouts,
      totalDuration: totals.duration,
      averageDuration: totals.workouts ? round1(totals.duration / totals.workouts) : 0,
      totalCalories: totals.calories,
    },
    categoryDistribution: categories.map((c) => ({
      category: c._id,
      count: c.count,
      percentage: categoryTotal ? round1((c.count / categoryTotal) * 100) : 0,
    })),
    frequency: {
      last7Days: sumRows(inLast(7)).workouts,
      last30Days: sumRows(inLast(30)).workouts,
      workoutsPerWeek: round1(sumRows(inLast(28)).workouts / 4), // average over the last 4 weeks
    },
    streak: computeStreaks(dayKeys, today),
    consistency: computeConsistency(dayKeys, 30, today),
    attendance: { visitsLast30Days: visits },
  };
};

/** Last `weeks` weeks (Mon-Sun, UTC), oldest first, empty weeks included. */
const getWeekly = async (userId, weeks = 8, today = new Date()) => {
  const from = addDays(startOfUtcDay(today), -(7 * weeks + 7)); // covers the first (partial) week
  const rows = await getDailyRollup(userId, from, addDays(startOfUtcDay(today), 1));
  return bucketWeekly(rows, weeks, today);
};

module.exports = { getSummary, getWeekly };
