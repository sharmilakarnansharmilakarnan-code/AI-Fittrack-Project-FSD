const express = require("express");
const { register, login, getProfile, updateProfile } = require("../controllers/authController");
const { validateBody } = require("../middleware/validate");
const { authenticate } = require("../middleware/authMiddleware");
const { EXPERIENCE_LEVELS } = require("../models/User");

const router = express.Router();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emailRule = { type: "string", required: true, lowercase: true, max: 254, pattern: EMAIL, patternMessage: "email must be a valid email address." };

router.post(
  "/register",
  validateBody({
    name: { type: "string", required: true, min: 2, max: 60 },
    email: emailRule,
    // passwords are never trimmed
    password: { type: "string", required: true, trim: false, min: 6, max: 128 },
  }),
  register
);
router.post(
  "/login",
  validateBody({
    email: emailRule,
    password: { type: "string", required: true, trim: false, min: 1, max: 128 },
  }),
  login
);
router.get("/profile", authenticate, getProfile);
router.put(
  "/profile",
  authenticate,
  validateBody(
    {
      name: { type: "string", min: 2, max: 60 },
      age: { type: "integer", min: 10, max: 100 },
      heightCm: { type: "number", min: 50, max: 260 },
      weightKg: { type: "number", min: 20, max: 400 },
      experienceLevel: { type: "enum", enum: EXPERIENCE_LEVELS, ci: true },
      fitnessGoal: { type: "string", min: 2, max: 100, collapse: true },
    },
    { partial: true, requireOne: true }
  ),
  updateProfile
);

module.exports = router;
