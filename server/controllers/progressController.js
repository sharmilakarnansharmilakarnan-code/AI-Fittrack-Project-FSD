const service = require("../services/progressService");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

const getSummary = asyncHandler(async (req, res) => {
  const summary = await service.getSummary(req.user._id);
  return sendSuccess(res, 200, "Progress summary calculated successfully.", { summary });
});

const getWeekly = asyncHandler(async (req, res) => {
  const weeks = req.query.weeks || 8;
  const weekly = await service.getWeekly(req.user._id, weeks);
  return sendSuccess(res, 200, "Weekly progress calculated successfully.", { weeks, weekly });
});

module.exports = { getSummary, getWeekly };
