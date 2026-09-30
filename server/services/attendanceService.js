const Attendance = require("../models/Attendance");
const AppError = require("../utils/AppError");
const { getPagination, buildPagination } = require("../utils/pagination");

// A visit that was never checked out is treated as abandoned after this long,
// so a forgotten check-out cannot block the member from checking in again.
const STALE_VISIT_HOURS = 12;
const ALREADY_CHECKED_IN = "You are already checked in. Check out first.";

/**
 * Gym check-in. A user can have only one open visit at a time
 * (also enforced by a unique index, so simultaneous requests cannot both succeed).
 */
const checkIn = async (actor) => {
  const open = await Attendance.findOne({ user: actor._id, isOpen: true });
  if (open) {
    const ageHours = (Date.now() - new Date(open.checkInTime).getTime()) / 3600000;
    if (ageHours < STALE_VISIT_HOURS) throw new AppError(ALREADY_CHECKED_IN, 409);
    await Attendance.updateOne({ _id: open._id, isOpen: true }, { $set: { isOpen: false } }); // close the abandoned visit
  }

  try {
    return await Attendance.create({ user: actor._id, checkInTime: new Date() });
  } catch (err) {
    if (err.code === 11000) throw new AppError(ALREADY_CHECKED_IN, 409);
    throw err;
  }
};

/** Closes the caller's open visit and records its length. */
const checkOut = async (actor) => {
  const open = await Attendance.findOne({ user: actor._id, isOpen: true });
  if (!open) throw new AppError("You are not checked in.", 409);

  const now = new Date();
  const updated = await Attendance.findOneAndUpdate(
    { _id: open._id, isOpen: true }, // atomic: a second simultaneous check-out finds nothing
    { $set: { isOpen: false, checkOutTime: now, durationMinutes: Math.round((now - new Date(open.checkInTime)) / 60000) } },
    { new: true }
  );
  if (!updated) throw new AppError("You are not checked in.", 409);
  return updated;
};

/** The caller's own attendance history (newest first) and the visit currently open, if any. */
const listAttendance = async (actor, query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = { user: actor._id };
  if (query.from || query.to) {
    filter.checkInTime = {};
    if (query.from) filter.checkInTime.$gte = query.from;
    if (query.to) filter.checkInTime.$lt = new Date(query.to.getTime() + 24 * 3600000); // "to" is inclusive
  }

  const [attendance, total, currentVisit] = await Promise.all([
    Attendance.find(filter).sort({ checkInTime: -1 }).skip(skip).limit(limit),
    Attendance.countDocuments(filter),
    Attendance.findOne({ user: actor._id, isOpen: true }),
  ]);
  return { attendance, currentVisit, pagination: buildPagination(total, page, limit) };
};

module.exports = { checkIn, checkOut, listAttendance };
