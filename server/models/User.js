const mongoose = require("mongoose");

const ROLES = ["user", "admin"];
const EXPERIENCE_LEVELS = ["Beginner", "Intermediate", "Advanced"];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters long"],
      maxlength: [60, "Name cannot exceed 60 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email address"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters long"],
      select: false, // never returned by default in queries
    },
    // "user" for every registration. Only an admin (PUT /api/admin/users/:id/role)
    // or the createAdmin script can change it.
    role: {
      type: String,
      enum: { values: ROLES, message: `Role must be one of: ${ROLES.join(", ")}` },
      default: "user",
    },
    // Optional fitness information used for AI recommendations
    fitnessProfile: {
      age: { type: Number, min: [10, "Age must be between 10 and 100"], max: [100, "Age must be between 10 and 100"] },
      heightCm: { type: Number, min: [50, "Height must be between 50 and 260 cm"], max: [260, "Height must be between 50 and 260 cm"] },
      weightKg: { type: Number, min: [20, "Weight must be between 20 and 400 kg"], max: [400, "Weight must be between 20 and 400 kg"] },
      experienceLevel: {
        type: String,
        enum: { values: EXPERIENCE_LEVELS, message: `Experience level must be one of: ${EXPERIENCE_LEVELS.join(", ")}` },
      },
      fitnessGoal: {
        type: String,
        trim: true,
        minlength: [2, "Fitness goal must be at least 2 characters long"],
        maxlength: [100, "Fitness goal cannot exceed 100 characters"],
      },
    },
  },
  {
    timestamps: true, // adds createdAt / updatedAt
    toJSON: {
      // Defense in depth: the hash can never be serialized, even if a
      // controller ever loads it with select("+password") and returns the doc.
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Explicit, allow-listed shape used in API responses
userSchema.methods.toSafeObject = function () {
  const profile = {};
  ["age", "heightCm", "weightKg", "experienceLevel", "fitnessGoal"].forEach((key) => {
    const value = this.fitnessProfile ? this.fitnessProfile[key] : undefined;
    if (value !== undefined && value !== null) profile[key] = value;
  });
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role || "user",
    fitnessProfile: profile,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("User", userSchema);
module.exports.ROLES = ROLES;
module.exports.EXPERIENCE_LEVELS = EXPERIENCE_LEVELS;
