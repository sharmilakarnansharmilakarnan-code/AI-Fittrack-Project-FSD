const express = require("express");
const c = require("../controllers/goalController");
const { authenticate } = require("../middleware/authMiddleware");
const { validateBody, validateQuery, validateObjectId, PAGE_QUERY } = require("../middleware/validate");
const { GOAL_STATUSES, GOAL_METRICS } = require("../models/FitnessGoal");

const router = express.Router();
router.use(authenticate);

// NOTE: "progress" and "status" are deliberately NOT accepted on create -
// the server calculates progress and status.
const goalFields = {
  title: { type: "string", required: true, min: 2, max: 100 },
  description: { type: "string", max: 500 },
  metric: { type: "enum", enum: GOAL_METRICS },
  targetValue: { type: "number", required: true, exclusiveMin: 0 },
  currentValue: { type: "number", min: 0 },
  unit: { type: "string", max: 30 },
  startDate: { type: "dateOnly" },
  targetDate: { type: "dateOnly", required: true },
};

router.get("/", validateQuery({ ...PAGE_QUERY, status: { type: "enum", enum: GOAL_STATUSES } }), c.getGoals);
router.post("/", validateBody(goalFields), c.createGoal);
router.get("/:id", validateObjectId("id"), c.getGoalById);
router.put(
  "/:id",
  validateObjectId("id"),
  validateBody(
    {
      title: goalFields.title,
      description: goalFields.description,
      targetValue: goalFields.targetValue,
      currentValue: goalFields.currentValue,
      unit: goalFields.unit,
      targetDate: goalFields.targetDate,
      status: { type: "enum", enum: ["active", "cancelled"] },
    },
    { partial: true, requireOne: true }
  ),
  c.updateGoal
);
router.delete("/:id", validateObjectId("id"), c.deleteGoal);

module.exports = router;
