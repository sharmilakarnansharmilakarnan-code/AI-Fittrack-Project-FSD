const FitnessGoal = require("../models/FitnessGoal");
const Workout = require("../models/Workout");
const Attendance = require("../models/Attendance");
const AppError = require("../utils/AppError");
const { computeGoalProgress } = require("../utils/progressCalc");
const { startOfUtcDay, addDays } = require("../utils/dateUtils");
const { sameId } = require("../utils/ids");
const { getPagination, buildPagination } = require("../utils/pagination");

const DEFAULT_UNITS = { workouts: "workouts", workout_minutes: "minutes", calories: "kcal", visits: "visits" };
const round2 = (n) => Math.round(n * 100) / 100;

/** currentValue for goals derived from stored data (workouts / gym visits) between startDate and targetDate. */
const computeCurrentValue = async (goal) => {
  const from = goal.startDate;
  const to = addDays(startOfUtcDay(goal.targetDate), 1); // the whole target day counts

  if (goal.metric === "visits") {
    return Attendance.countDocuments({ user: goal.user, checkInTime: { $gte: from, $lt: to } });
  }
  const [row] = await Workout.aggregate([
    { $match: { user: goal.user, workoutDate: { $gte: from, $lt: to } } },
    { $group: { _id: null, count: { $sum: 1 }, minutes: { $sum: "$duration" }, calories: { $sum: "$caloriesBurned" } } },
  ]);
  if (!row) return 0;
  if (goal.metric === "workouts") return row.count;
  if (goal.metric === "workout_minutes") return round2(row.minutes);
  return round2(row.calories); // "calories"
};

/**
 * Re-calculates currentValue (derived metrics), progress and status from
 * stored data. Progress is never taken from the client.
 */
const refreshGoal = async (goal) => {
  if (goal.status === "cancelled") return goal;

  let changed = false;
  if (goal.metric !== "manual") {
    const current = await computeCurrentValue(goal);
    if (current !== goal.currentValue) {
      goal.currentValue = current;
      changed = true;
    }
  }

  const progress = computeGoalProgress(goal.currentValue, goal.targetValue);
  if (progress !== goal.progress) {
    goal.progress = progress;
    changed = true;
  }

  if (goal.status === "active") {
    if (progress >= 100) {
      goal.status = "completed";
      goal.completedAt = new Date();
      changed = true;
    } else if (addDays(startOfUtcDay(goal.targetDate), 1) <= new Date()) {
      goal.status = "expired";
      changed = true;
    }
  }

  if (changed) await goal.save();
  return goal;
};

const loadOwned = async (actor, id) => {
  const goal = await FitnessGoal.findById(id);
  if (!goal) throw new AppError("Goal not found.", 404);
  if (!sameId(goal.user, actor._id)) throw new AppError("You are not authorized to access this goal.", 403);
  return goal;
};

const createGoal = async (actor, body) => {
  const startDate = body.startDate || startOfUtcDay(new Date());
  if (body.targetDate < startDate) throw new AppError("Target date cannot be before the start date.", 400);

  const metric = body.metric || "manual";
  const goal = await FitnessGoal.create({
    user: actor._id, // always the authenticated user
    title: body.title,
    description: body.description,
    metric,
    targetValue: body.targetValue,
    currentValue: metric === "manual" ? body.currentValue ?? 0 : 0, // derived metrics are calculated
    unit: body.unit ?? DEFAULT_UNITS[metric] ?? "",
    startDate,
    targetDate: body.targetDate,
  });
  return refreshGoal(goal);
};

const listGoals = async (actor, query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = { user: actor._id };
  if (query.status) filter.status = query.status;

  const [found, total] = await Promise.all([
    FitnessGoal.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    FitnessGoal.countDocuments(filter),
  ]);
  const goals = await Promise.all(found.map(refreshGoal));
  return { goals, pagination: buildPagination(total, page, limit) };
};

const getGoal = async (actor, id) => refreshGoal(await loadOwned(actor, id));

const updateGoal = async (actor, id, body) => {
  const goal = await loadOwned(actor, id);

  ["title", "description", "targetValue", "unit", "targetDate"].forEach((f) => {
    if (body[f] !== undefined) goal[f] = body[f];
  });
  if (body.currentValue !== undefined) {
    if (goal.metric !== "manual") {
      throw new AppError("currentValue is calculated automatically for this goal and cannot be set.", 400);
    }
    goal.currentValue = body.currentValue;
  }
  if (body.status !== undefined) {
    goal.status = body.status; // route only allows "active" or "cancelled"; completed / expired are automatic
    if (body.status === "active") goal.completedAt = undefined;
  }
  if (goal.targetDate < goal.startDate) throw new AppError("Target date cannot be before the start date.", 400);

  return refreshGoal(goal);
};

const deleteGoal = async (actor, id) => {
  const goal = await loadOwned(actor, id);
  await goal.deleteOne();
};

module.exports = { createGoal, listGoals, getGoal, updateGoal, deleteGoal, refreshGoal };
