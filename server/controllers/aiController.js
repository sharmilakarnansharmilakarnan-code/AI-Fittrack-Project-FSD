const { getRecommendation } = require("../services/recommendationService");
const { getInsights } = require("../services/insightsService");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

/**
 * @route   POST /api/ai/recommendation
 * @access  Private
 * Body (all optional): { age, fitnessGoal, experienceLevel } - anything not sent
 * is taken from the user's saved fitness profile.
 */
const getWorkoutRecommendation = asyncHandler(async (req, res) => {
  const data = await getRecommendation(req.user, req.body);
  return sendSuccess(res, 200, "AI recommendation generated successfully.", data);
});

/**
 * @route   GET /api/ai/fitness-insights
 * @access  Private
 * No body or query needed: the statistics (total workouts, average workout
 * duration, total calories burned) are calculated from the authenticated
 * user's own workouts. With no workouts Gemini is not called and
 * data.insights is null.
 */
const getFitnessInsights = asyncHandler(async (req, res) => {
  const data = await getInsights(req.user);
  const message = data.insights
    ? "AI fitness insights generated successfully."
    : "No workout history is available yet. Add your first workout to receive personalized AI fitness insights.";
  return sendSuccess(res, 200, message, data);
});

module.exports = { getWorkoutRecommendation, getFitnessInsights };
