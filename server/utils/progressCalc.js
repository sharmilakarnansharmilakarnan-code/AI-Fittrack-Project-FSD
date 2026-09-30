/**
 * Pure progress calculations (no database, no dependencies) so they can be
 * unit tested with `npm test`. Inputs are per-day rows produced by the
 * MongoDB daily roll-up: { day: "YYYY-MM-DD", workouts, duration, calories }.
 */
const {
  DAY_MS,
  addDays,
  toDayKey,
  startOfIsoWeek,
} = require("./dateUtils");

const dayIndex = (dayKey) => Math.round(Date.parse(`${dayKey}T00:00:00Z`) / DAY_MS);

/**
 * Current and longest streak of consecutive workout days.
 * The current streak stays alive if the last workout was yesterday
 * (today is not over yet); it is 0 once a full day was missed.
 */
const computeStreaks = (dayKeys, today = new Date()) => {
  const days = [...new Set(dayKeys)].sort();
  if (days.length === 0) return { current: 0, longest: 0, lastWorkoutDay: null };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i += 1) {
    run = dayIndex(days[i]) - dayIndex(days[i - 1]) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const last = days[days.length - 1];
  const gap = dayIndex(toDayKey(today)) - dayIndex(last);
  let current = 0;
  if (gap === 0 || gap === 1) {
    current = 1;
    for (let i = days.length - 1; i > 0; i -= 1) {
      if (dayIndex(days[i]) - dayIndex(days[i - 1]) === 1) current += 1;
      else break;
    }
  }
  return { current, longest, lastWorkoutDay: last };
};

const emptyBucket = (start, end) => ({
  start: toDayKey(start),
  end: toDayKey(end),
  workouts: 0,
  duration: 0,
  calories: 0,
  activeDays: 0,
});

const addRow = (bucket, row) => {
  bucket.workouts += row.workouts || 0;
  bucket.duration += row.duration || 0;
  bucket.calories += row.calories || 0;
  bucket.activeDays += 1;
};

/** Last `weeks` ISO weeks (Mon-Sun, UTC), oldest first, empty weeks included. */
const bucketWeekly = (rows, weeks, today = new Date()) => {
  const firstWeek = addDays(startOfIsoWeek(today), -7 * (weeks - 1));
  const buckets = [];
  for (let i = 0; i < weeks; i += 1) {
    const start = addDays(firstWeek, 7 * i);
    buckets.push(emptyBucket(start, addDays(start, 6)));
  }
  rows.forEach((row) => {
    const idx = Math.floor((dayIndex(row.day) - dayIndex(toDayKey(firstWeek))) / 7);
    if (idx >= 0 && idx < weeks) addRow(buckets[idx], row);
  });
  return buckets.map((b) => ({ weekStart: b.start, weekEnd: b.end, ...strip(b) }));
};

const strip = ({ workouts, duration, calories, activeDays }) => ({ workouts, duration, calories, activeDays });

/** Share of the last `windowDays` days (including today) with at least one workout. */
const computeConsistency = (dayKeys, windowDays = 30, today = new Date()) => {
  const end = dayIndex(toDayKey(today));
  const start = end - (windowDays - 1);
  const active = new Set(dayKeys.filter((k) => dayIndex(k) >= start && dayIndex(k) <= end)).size;
  return {
    windowDays,
    activeDays: active,
    percentage: Math.round((active / windowDays) * 1000) / 10,
  };
};

/** Goal progress 0-100 (one decimal); safe for a zero/invalid target. */
const computeGoalProgress = (currentValue, targetValue) => {
  const current = Number(currentValue);
  const target = Number(targetValue);
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0 || current <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 1000) / 10);
};

module.exports = {
  computeStreaks,
  bucketWeekly,
  computeConsistency,
  computeGoalProgress,
};
