const express = require("express");
const router = express.Router();
const fetch = require("node-fetch"); // v2
const crypto = require("crypto");
const auth = require("../middleware/auth");
const User = require("../models/User");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:4000";

// POST /billing/paystack/init  -> initialize a transaction
// body: { amountNgn } e.g. { amountNgn: 1500 }
router.post("/paystack/init", auth, async (req, res) => {
  try {
    const { amountNgn = 1500 } = req.body || {};
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    const payload = {
      email: user.email,
      amount: Number(amountNgn) * 100, // kobo
      callback_url: `${APP_BASE_URL}/upgrade/callback`,
      metadata: {
        userId: String(user._id),
        plan: "premium",
        source: "BudgetSplit",
      },
    };

    const r = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json();
    if (!data?.status) {
      return res.status(400).json({ error: data?.message || "Init failed" });
    }
    // send authorization_url to the frontend
    res.json({ authorization_url: data.data.authorization_url, reference: data.data.reference });
  } catch (e) {
    console.error("init error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /billing/paystack/verify?reference=ref
router.get("/paystack/verify", auth, async (req, res) => {
  try {
    const ref = req.query.reference;
    if (!ref) return res.status(400).json({ error: "No reference" });

    const r = await fetch(`https://api.paystack.co/transaction/verify/${ref}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });
    const data = await r.json();
    if (!data?.status) {
      return res.status(400).json({ error: data?.message || "Verify failed" });
    }

    const status = data.data.status; // "success"
    const metadata = data.data.metadata || {};
    if (status === "success") {
      // upgrade user
      await User.updateOne({ _id: req.user.id }, { $set: { plan: "premium" } });
      const updated = await User.findById(req.user.id).select("_id name email plan").lean();
      return res.json({ ok: true, user: updated });
    }
    return res.status(400).json({ error: "Payment not successful" });
  } catch (e) {
    console.error("verify error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /billing/paystack/webhook  (optional, for production)
// Verify x-paystack-signature and then upgrade the user by metadata.userId
router.post("/paystack/webhook", express.raw({ type: "/" }), async (req, res) => {
  try {
    const signature = req.headers["x-paystack-signature"];
    const hash = crypto
      .createHmac("sha512", PAYSTACK_SECRET_KEY)
      .update(req.body)
      .digest("hex");

    if (hash !== signature) return res.status(401).send("Invalid signature");

    const event = JSON.parse(req.body.toString());
    if (event.event === "charge.success") {
      const userId = event.data?.metadata?.userId;
      if (userId) {
        await User.updateOne({ _id: userId }, { $set: { plan: "premium" } });
      }
    }
    res.sendStatus(200);
  } catch (e) {
    console.error("webhook error:", e);
    res.sendStatus(500);
  }
});

module.exports = router;