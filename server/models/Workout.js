const mongoose = require("mongoose");

const ALLOWED_CATEGORIES = [
  "Cardio",
  "Strength",
  "Flexibility",
  "Balance",
  "Sports",
  "HIIT",
  "Yoga",
  "Other",
];

const workoutSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    workoutName: {
      type: String,
      required: [true, "Workout name is required"],
      trim: true,
      minlength: [2, "Workout name must be at least 2 characters long"],
      maxlength: [100, "Workout name cannot exceed 100 characters"],
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      enum: {
        values: ALLOWED_CATEGORIES,
        message: `Category must be one of: ${ALLOWED_CATEGORIES.join(", ")}`,
      },
    },
    duration: {
      type: Number,
      required: [true, "Duration is required"],
      validate: {
        validator: (value) => Number.isFinite(value) && value > 0,
        message: "Duration must be greater than 0 minutes",
      },
    },
    caloriesBurned: {
      type: Number,
      required: [true, "Calories burned is required"],
      min: [0, "Calories burned cannot be negative"],
      validate: {
        validator: (value) => Number.isFinite(value),
        message: "Calories burned must be a finite number",
      },
    },
    workoutDate: {
      type: Date,
      required: [true, "Workout date is required"],
    },
  },
  { timestamps: true }
);

// Speeds up per-user list / search / progress queries
workoutSchema.index({ user: 1, workoutDate: -1 });

module.exports = mongoose.model("Workout", workoutSchema);
module.exports.ALLOWED_CATEGORIES = ALLOWED_CATEGORIES;
