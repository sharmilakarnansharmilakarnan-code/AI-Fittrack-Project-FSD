const service = require("../services/adminService");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

const getStats = asyncHandler(async (req, res) =>
  sendSuccess(res, 200, "System statistics fetched successfully.", { stats: await service.getStats() })
);
const getUsers = asyncHandler(async (req, res) =>
  sendSuccess(res, 200, "Users fetched successfully.", await service.listUsers(req.query))
);
const getUserById = asyncHandler(async (req, res) =>
  sendSuccess(res, 200, "User fetched successfully.", { user: await service.getUser(req.params.id) })
);
const changeUserRole = asyncHandler(async (req, res) =>
  sendSuccess(res, 200, "User role updated successfully.", { user: await service.changeRole(req.user, req.params.id, req.body.role) })
);
const deleteUser = asyncHandler(async (req, res) =>
  sendSuccess(res, 200, "User and their data deleted successfully.", { deleted: await service.deleteUser(req.user, req.params.id) })
);

module.exports = { getStats, getUsers, getUserById, changeUserRole, deleteUser };
