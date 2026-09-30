const User = require("../models/User");
const Workout = require("../models/Workout");
const FitnessGoal = require("../models/FitnessGoal");
const Attendance = require("../models/Attendance");
const AppError = require("../utils/AppError");
const { escapeRegex } = require("../utils/text");
const { addDays, startOfUtcDay } = require("../utils/dateUtils");
const { sameId } = require("../utils/ids");
const { getPagination, buildPagination } = require("../utils/pagination");

const countBy = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.count]));
const groupCount = (model, field) => model.aggregate([{ $group: { _id: field, count: { $sum: 1 } } }]);

/** System overview: everything is counted from the database. */
const getStats = async () => {
  const weekAgo = addDays(startOfUtcDay(new Date()), -7);
  const [usersByRole, newUsers, workouts, goalsByStatus, visits, openVisits] = await Promise.all([
    // accounts created before roles existed have no role field: they count as "user"
    groupCount(User, { $ifNull: ["$role", "user"] }),
    User.countDocuments({ createdAt: { $gte: weekAgo } }),
    Workout.countDocuments({}),
    groupCount(FitnessGoal, "$status"),
    Attendance.countDocuments({}),
    Attendance.countDocuments({ isOpen: true }),
  ]);

  const roles = countBy(usersByRole);
  return {
    users: { total: Object.values(roles).reduce((a, b) => a + b, 0), byRole: roles, newInLast7Days: newUsers },
    workouts: { total: workouts },
    goals: { byStatus: countBy(goalsByStatus) },
    attendance: { totalVisits: visits, currentlyCheckedIn: openVisits },
  };
};

const listUsers = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.role) filter.role = query.role === "user" ? { $in: ["user", null] } : query.role; // null also matches a missing role
  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q), "i");
    filter.$or = [{ name: regex }, { email: regex }];
  }
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  return { users: users.map((u) => u.toSafeObject()), pagination: buildPagination(total, page, limit) };
};

const getUser = async (id) => {
  const user = await User.findById(id);
  if (!user) throw new AppError("User not found.", 404);
  const [workouts, goals, visits] = await Promise.all([
    Workout.countDocuments({ user: user._id }),
    FitnessGoal.countDocuments({ user: user._id }),
    Attendance.countDocuments({ user: user._id }),
  ]);
  return { ...user.toSafeObject(), counts: { workouts, goals, visits } };
};

const changeRole = async (actor, id, role) => {
  if (sameId(id, actor._id)) throw new AppError("You cannot change your own role.", 400);
  const user = await User.findById(id);
  if (!user) throw new AppError("User not found.", 404);
  user.role = role;
  await user.save();
  return user.toSafeObject();
};

/** Deletes a user together with their workouts, goals and attendance. */
const deleteUser = async (actor, id) => {
  if (sameId(id, actor._id)) throw new AppError("You cannot delete your own account.", 400);
  const user = await User.findById(id);
  if (!user) throw new AppError("User not found.", 404);

  const [workouts, goals, visits] = await Promise.all([
    Workout.deleteMany({ user: user._id }),
    FitnessGoal.deleteMany({ user: user._id }),
    Attendance.deleteMany({ user: user._id }),
  ]);
  await user.deleteOne();
  return { workouts: workouts.deletedCount, goals: goals.deletedCount, visits: visits.deletedCount };
};

module.exports = { getStats, listUsers, getUser, changeRole, deleteUser };
