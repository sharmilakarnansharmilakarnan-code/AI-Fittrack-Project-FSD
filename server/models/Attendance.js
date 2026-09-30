const mongoose = require("mongoose");

/**
 * One gym visit: a check-in and (later) a check-out.
 * While a visit is open (`isOpen: true`) the user cannot check in again.
 */
const attendanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    checkInTime: { type: Date, required: true, default: Date.now },
    checkOutTime: { type: Date },
    durationMinutes: { type: Number, min: 0 }, // set at check-out
    isOpen: { type: Boolean, default: true },
  },
  { timestamps: true }
);

attendanceSchema.index({ user: 1, checkInTime: -1 });
// At most ONE open visit per user - also enforced by the database, so two
// simultaneous check-ins cannot both succeed.
attendanceSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { isOpen: true } });

module.exports = mongoose.model("Attendance", attendanceSchema);
