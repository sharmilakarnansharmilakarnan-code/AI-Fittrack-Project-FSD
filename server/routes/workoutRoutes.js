const express = require("express");
const {
  createWorkout,
  getWorkouts,
  searchWorkouts,
  getWorkoutById,
  updateWorkout,
  deleteWorkout,
} = require("../controllers/workoutController");
const { validateBody, validateQuery, validateObjectId, PAGE_QUERY } = require("../middleware/validate");
const { authenticate } = require("../middleware/authMiddleware");
const { ALLOWED_CATEGORIES } = require("../models/Workout");

const router = express.Router();

// All workout routes require authentication
router.use(authenticate);

const workoutFields = {
  workoutName: { type: "string", required: true, min: 2, max: 100 },
  category: { type: "enum", required: true, enum: ALLOWED_CATEGORIES },
  duration: { type: "number", required: true, exclusiveMin: 0 }, // minutes, must be > 0
  caloriesBurned: { type: "number", required: true, min: 0 },
  workoutDate: { type: "date", required: true },
};

// IMPORTANT: "/search" must be declared before "/:id", otherwise "search" would be read as an id.
router.get(
  "/search",
  validateQuery({
    query: { type: "string", max: 100 },
    workoutName: { type: "string", max: 100 },
    name: { type: "string", max: 100 },
    category: { type: "string", max: 50 },
    date: { type: "date" },
  }),
  searchWorkouts
);
router.post("/", validateBody(workoutFields), createWorkout);
router.get("/", validateQuery(PAGE_QUERY), getWorkouts);
router.get("/:id", validateObjectId("id"), getWorkoutById);
router.put("/:id", validateObjectId("id"), validateBody(workoutFields, { partial: true, requireOne: true }), updateWorkout);
router.delete("/:id", validateObjectId("id"), deleteWorkout);

module.exports = router;
