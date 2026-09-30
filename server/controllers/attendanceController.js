const service = require("../services/attendanceService");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

const checkIn = asyncHandler(async (req, res) => {
  const attendance = await service.checkIn(req.user);
  return sendSuccess(res, 201, "Checked in successfully.", { attendance });
});
const checkOut = asyncHandler(async (req, res) => {
  const attendance = await service.checkOut(req.user);
  return sendSuccess(res, 200, "Checked out successfully.", { attendance });
});
const getAttendance = asyncHandler(async (req, res) => {
  const data = await service.listAttendance(req.user, req.query);
  return sendSuccess(res, 200, "Attendance history fetched successfully.", data);
});

module.exports = { checkIn, checkOut, getAttendance };
