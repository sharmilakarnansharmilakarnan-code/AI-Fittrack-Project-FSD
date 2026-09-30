const User = require("../models/User");
const { hashPassword, comparePassword } = require("../services/passwordService");
const { generateToken } = require("../services/jwtService");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

/**
 * @route   POST /api/auth/register
 * @access  Public
 * The role is always "user": a client can never register as admin.
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body; // validated + normalized by validateBody

  if (await User.findOne({ email })) {
    throw new AppError("An account with this email already exists.", 409);
  }

  const user = await User.create({ name, email, password: await hashPassword(password) });

  return sendSuccess(res, 201, "User registered successfully.", {
    user: user.toSafeObject(),
    token: generateToken(user._id),
  });
});

/**
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await comparePassword(password, user.password))) {
    throw new AppError("Invalid email or password.", 401);
  }

  return sendSuccess(res, 200, "Login successful.", {
    user: user.toSafeObject(),
    token: generateToken(user._id),
  });
});

/**
 * @route   GET /api/auth/profile
 * @access  Private
 */
const getProfile = asyncHandler(async (req, res) =>
  sendSuccess(res, 200, "Profile fetched successfully.", { user: req.user.toSafeObject() })
);

/**
 * @route   PUT /api/auth/profile
 * @access  Private
 * Updates the caller's name and fitness profile (age, heightCm, weightKg,
 * experienceLevel, fitnessGoal). Email, password and role cannot be changed here.
 */
const PROFILE_FIELDS = ["age", "heightCm", "weightKg", "experienceLevel", "fitnessGoal"];

const updateProfile = asyncHandler(async (req, res) => {
  if (req.body.name !== undefined) req.user.name = req.body.name;
  PROFILE_FIELDS.forEach((field) => {
    if (req.body[field] !== undefined) req.user.set(`fitnessProfile.${field}`, req.body[field]);
  });
  await req.user.save();

  return sendSuccess(res, 200, "Profile updated successfully.", { user: req.user.toSafeObject() });
});

module.exports = { register, login, getProfile, updateProfile };
