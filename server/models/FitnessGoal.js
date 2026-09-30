const mongoose = require("mongoose");

const GOAL_STATUSES = ["active", "completed", "cancelled", "expired"];
// "manual": the user reports currentValue. The others are calculated by the
// server from stored data (workouts / gym visits) between startDate and targetDate.
const GOAL_METRICS = ["manual", "workouts", "workout_minutes", "calories", "visits"];

const fitnessGoalSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      minlength: [2, "Title must be at least 2 characters long"],
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    description: { type: String, trim: true, maxlength: [500, "Description cannot exceed 500 characters"], default: "" },
    metric: {
      type: String,
      enum: { values: GOAL_METRICS, message: `Metric must be one of: ${GOAL_METRICS.join(", ")}` },
      default: "manual",
    },
    targetValue: { type: Number, required: [true, "Target value is required"], min: [0.000001, "Target value must be greater than 0"] },
    currentValue: { type: Number, min: [0, "Current value cannot be negative"], default: 0 },
    unit: { type: String, trim: true, maxlength: [30, "Unit cannot exceed 30 characters"], default: "" },
    startDate: { type: Date, required: [true, "Start date is required"] },
    targetDate: { type: Date, required: [true, "Target date is required"] },
    status: {
      type: String,
      enum: { values: GOAL_STATUSES, message: `Status must be one of: ${GOAL_STATUSES.join(", ")}` },
      default: "active",
    },
    // Always calculated by the server (0-100); a value sent by a client is ignored
    progress: { type: Number, min: 0, max: 100, default: 0 },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FitnessGoal", fitnessGoalSchema);
module.exports.GOAL_STATUSES = GOAL_STATUSES;
module.exports.GOAL_METRICS = GOAL_METRICS;
