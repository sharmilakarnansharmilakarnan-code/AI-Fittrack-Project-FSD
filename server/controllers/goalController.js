const service = require("../services/goalService");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

const createGoal = asyncHandler(async (req, res) => {
  const goal = await service.createGoal(req.user, req.body);
  return sendSuccess(res, 201, "Goal created successfully.", { goal });
});
const getGoals = asyncHandler(async (req, res) => {
  const data = await service.listGoals(req.user, req.query);
  return sendSuccess(res, 200, "Goals fetched successfully.", data);
});
const getGoalById = asyncHandler(async (req, res) => {
  const goal = await service.getGoal(req.user, req.params.id);
  return sendSuccess(res, 200, "Goal fetched successfully.", { goal });
});
const updateGoal = asyncHandler(async (req, res) => {
  const goal = await service.updateGoal(req.user, req.params.id, req.body);
  return sendSuccess(res, 200, "Goal updated successfully.", { goal });
});
const deleteGoal = asyncHandler(async (req, res) => {
  await service.deleteGoal(req.user, req.params.id);
  return sendSuccess(res, 200, "Goal deleted successfully.");
});

module.exports = { createGoal, getGoals, getGoalById, updateGoal, deleteGoal };
