/**
 * Creates (or promotes) an admin account. Registration through the API
 * always creates the role "user", so the first admin must be created here.
 *
 *   node scripts/createAdmin.js "Admin Name" admin@example.com "StrongPassword123"
 *   npm run create-admin -- "Admin Name" admin@example.com "StrongPassword123"
 *
 * Values can also come from ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD in .env.
 * If a user with that email already exists it is promoted to admin and its
 * password is left unchanged.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const User = require("../models/User");
const { hashPassword } = require("../services/passwordService");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const run = async () => {
  const name = process.argv[2] || process.env.ADMIN_NAME || "Administrator";
  const email = (process.argv[3] || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.argv[4] || process.env.ADMIN_PASSWORD || "";

  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set in .env");
  if (!EMAIL_REGEX.test(email)) throw new Error("A valid admin email is required.");

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });

  const existing = await User.findOne({ email });
  if (existing) {
    existing.role = "admin";
    await existing.save();
    console.log(`Existing user ${email} is now an admin (password unchanged).`);
    return;
  }

  if (password.length < 8) throw new Error("Admin password must be at least 8 characters long.");
  await User.create({ name, email, password: await hashPassword(password), role: "admin" });
  console.log(`Admin account created for ${email}.`);
};

run()
  .catch((err) => {
    console.error(`create-admin failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
