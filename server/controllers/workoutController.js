const Workout = require("../models/Workout");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { escapeRegex } = require("../utils/text");
const { sameId } = require("../utils/ids");
const { startOfUtcDay, addDays } = require("../utils/dateUtils");
const { getPagination, buildPagination } = require("../utils/pagination");
const { sendSuccess } = require("../utils/response");

/** Loads a workout and makes sure it belongs to the authenticated user. */
const loadOwnedWorkout = async (req, action) => {
  const workout = await Workout.findById(req.params.id);
  if (!workout) throw new AppError("Workout not found.", 404);
  if (!sameId(workout.user, req.user._id)) {
    throw new AppError(`You are not authorized to ${action} this workout.`, 403);
  }
  return workout;
};

/**
 * @route   POST /api/workouts
 * @access  Private
 * Body validated by the route: workoutName, category, duration, caloriesBurned, workoutDate.
 */
const createWorkout = asyncHandler(async (req, res) => {
  const { workoutName, category, duration, caloriesBurned, workoutDate } = req.body;
  const workout = await Workout.create({
    user: req.user._id, // never trust a client-provided user id
    workoutName,
    category,
    duration,
    caloriesBurned,
    workoutDate,
  });
  return sendSuccess(res, 201, "Workout created successfully.", { workout });
});

/**
 * @route   GET /api/workouts
 * @access  Private
 * Own workouts, newest first. ?page= & ?limit= (default 20, max 100).
 */
const getWorkouts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { user: req.user._id };

  const [workouts, total] = await Promise.all([
    Workout.find(filter).sort({ workoutDate: -1, createdAt: -1 }).skip(skip).limit(limit),
    Workout.countDocuments(filter),
  ]);
  return sendSuccess(res, 200, "Workouts fetched successfully.", {
    workouts,
    pagination: buildPagination(total, page, limit),
  });
});

/**
 * @route   GET /api/workouts/search?query=&workoutName=&category=&date=
 * @access  Private
 *
 * Only ever searches the authenticated user's own workouts. All parameters
 * are optional and combine with AND:
 *   query        - partial, case-insensitive match on workout name OR category
 *   workoutName  - partial, case-insensitive match on workout name ("name" is an alias)
 *   category     - case-insensitive exact match on category
 *   date         - workouts on that calendar day (UTC), e.g. 2026-09-18
 */
const searchWorkouts = asyncHandler(async (req, res) => {
  const { query, workoutName, name, category, date } = req.query;
  const filter = { user: req.user._id };

  if (query) {
    const regex = new RegExp(escapeRegex(query), "i");
    filter.$or = [{ workoutName: regex }, { category: regex }];
  }
  if (workoutName || name) filter.workoutName = new RegExp(escapeRegex(workoutName || name), "i");
  if (category) filter.category = new RegExp(`^${escapeRegex(category)}$`, "i");
  if (date) {
    const day = startOfUtcDay(date); // workout dates are stored as UTC instants
    filter.workoutDate = { $gte: day, $lt: addDays(day, 1) };
  }

  const workouts = await Workout.find(filter).sort({ workoutDate: -1 });
  return sendSuccess(res, 200, `Found ${workouts.length} matching workout(s).`, { workouts });
});

/**
 * @route   GET /api/workouts/:id
 * @access  Private
 */
const getWorkoutById = asyncHandler(async (req, res) => {
  const workout = await loadOwnedWorkout(req, "access");
  return sendSuccess(res, 200, "Workout fetched successfully.", { workout });
});

/**
 * @route   PUT /api/workouts/:id
 * @access  Private
 * Partial update of workoutName, category, duration, caloriesBurned, workoutDate.
 */
const updateWorkout = asyncHandler(async (req, res) => {
  const workout = await loadOwnedWorkout(req, "update");
  ["workoutName", "category", "duration", "caloriesBurned", "workoutDate"].forEach((field) => {
    if (req.body[field] !== undefined) workout[field] = req.body[field];
  });
  await workout.save(); // Mongoose validation runs again on save
  return sendSuccess(res, 200, "Workout updated successfully.", { workout });
});

/**
 * @route   DELETE /api/workouts/:id
 * @access  Private
 */
const deleteWorkout = asyncHandler(async (req, res) => {
  const workout = await loadOwnedWorkout(req, "delete");
  await workout.deleteOne();
  return sendSuccess(res, 200, "Workout deleted successfully.");
});

module.exports = { createWorkout, getWorkouts, searchWorkouts, getWorkoutById, updateWorkout, deleteWorkout };
