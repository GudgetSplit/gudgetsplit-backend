// backend/routes/auth.js
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const User = require("../models/User");

// Helper: sign JWT
function sign(user) {
  return jwt.sign(
    { id: user._id, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
}

/**
 * POST /auth/register
 * body: { name, email, password }
 */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ error: "Name, email and password are required" });
    }

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ error: "Email already registered" });

    const user = await User.create({
      name: String(name).trim(),
      email: email.toLowerCase(),
      password, // hashed by pre-save hook
    });

    const token = sign(user);
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("POST /auth/register error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /auth/login
 * body: { email, password }
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(400).json({ error: "Invalid email or password" });

    // comparePassword should be resilient if password is missing (legacy users)
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(400).json({ error: "Invalid email or password" });

    const token = sign(user);
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("POST /auth/login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /auth/forgot
 * body: { email }
 * Sends (logs in dev) a reset link. Always responds { ok: true }.
 */
router.post("/forgot", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      user.resetToken = token;
      user.resetExpires = expires;

      // Bypass validation to allow legacy users missing password to receive a link
      await user.save({ validateBeforeSave: false });

      const link = `http://localhost:5173/reset?token=${token}&email=${encodeURIComponent(
        user.email
      )}`;
      console.log("🔐 Password reset link:", link);
      // In production: send via email/SMS (nodemailer, etc.)
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("POST /auth/forgot error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /auth/reset
 * body: { email, token, password }
 * Validates token and sets new password.
 */
router.post("/reset", async (req, res) => {
  try {
    const { email, token, password } = req.body || {};
    if (!email || !token || !password) {
      return res
        .status(400)
        .json({ error: "email, token, password are required" });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
      resetToken: token,
    });
    if (!user || !user.resetExpires || user.resetExpires < new Date()) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    user.password = password; // will hash via pre-save
    user.resetToken = null;
    user.resetExpires = null;
    await user.save();

    return res.json({ ok: true, message: "Password updated. You can now log in." });
  } catch (err) {
    console.error("POST /auth/reset error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;