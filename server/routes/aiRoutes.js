const express = require("express");
const { getWorkoutRecommendation, getFitnessInsights } = require("../controllers/aiController");
const { validateBody } = require("../middleware/validate");
const { authenticate } = require("../middleware/authMiddleware");
const { EXPERIENCE_LEVELS } = require("../models/User");

const router = express.Router();
router.use(authenticate);

router.post(
  "/recommendation",
  validateBody(
    {
      age: { type: "integer", min: 10, max: 100 },
      fitnessGoal: { type: "string", min: 2, max: 100, collapse: true },
      experienceLevel: { type: "enum", enum: EXPERIENCE_LEVELS, ci: true },
    },
    { partial: true }
  ),
  getWorkoutRecommendation
);

// Separate capability from /recommendation: AI Fitness Insights (already behind authenticate above)
router.get("/fitness-insights", getFitnessInsights);

module.exports = router;
