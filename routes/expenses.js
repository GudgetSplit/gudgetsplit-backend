const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Expense = require("../models/Expense");
const Group = require("../models/Group");
const auth = require("../middleware/auth");

/**
 * Helper: ensure user is a member of the group
 */
async function assertMember(groupId, userId) {
  const g = await Group.findById(groupId).lean();
  if (!g) {
    const err = new Error("Group not found");
    err.status = 404;
    throw err;
  }
  const isMember = (g.members || []).some((m) => String(m) === String(userId));
  if (!isMember) {
    const err = new Error("Not allowed");
    err.status = 403;
    throw err;
  }
  return g;
}

/**
 * POST /expenses
 * body: { groupId, amount, paidBy, mode, splits?, category?, description?, date? }
 * If mode = "equal", splits auto-generated equally among all members.
 * Only group members can create. createdBy is req.user.id.
 */
router.post("/", auth, async (req, res) => {
  try {
    const {
      groupId,
      amount,
      paidBy,
      mode,
      splits = [],
      category = "",
      description = "",
      date,
    } = req.body || {};

    if (!groupId || !amount || !paidBy || !mode) {
      return res
        .status(400)
        .json({ error: "groupId, amount, paidBy, mode are required" });
    }

    const g = await assertMember(groupId, req.user.id);

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0)
      return res.status(400).json({ error: "Invalid amount" });

    // paidBy must be a member
    if (!g.members.some((m) => String(m) === String(paidBy))) {
      return res.status(400).json({ error: "paidBy must be a group member" });
    }

    let finalSplits = [];
    if (mode === "equal") {
      const n = g.members.length;
      const base = Math.floor(amt / n);
      let rem = amt % n;
      finalSplits = g.members.map((m, i) => ({
        userId: m,
        share: base + (i < rem ? 1 : 0),
      }));
    } else if (mode === "custom") {
      if (!Array.isArray(splits) || splits.length === 0) {
        return res.status(400).json({ error: "splits required for custom mode" });
      }
      // validate splits and sum
      const sum = splits.reduce((a, s) => a + Number(s.share || 0), 0);
      if (Math.round(sum) !== Math.round(amt)) {
        return res.status(400).json({ error: "Custom splits must equal amount" });
      }
      // ensure all users are members
      for (const s of splits) {
        if (!g.members.some((m) => String(m) === String(s.userId))) {
          return res.status(400).json({ error: "All splits must be members" });
        }
      }
      finalSplits = splits.map((s) => ({
        userId: s.userId,
        share: Number(s.share),
      }));
    } else {
      return res.status(400).json({ error: "Invalid mode" });
    }

    const exp = await Expense.create({
      groupId,
      amount: amt,
      paidBy,
      mode,
      splits: finalSplits,
      category: String(category || ""),
      description: String(description || ""),
      date: date ? new Date(date) : new Date(),
      createdBy: req.user.id,
    });

    res.json(exp);
  } catch (e) {
    console.error("POST /expenses error:", e);
    res.status(e.status || 500).json({ error: e.message || "Server error" });
  }
});

/**
 * GET /expenses/:groupId
 * List non-deleted expenses for a group (latest first).
 */
router.get("/:groupId", auth, async (req, res) => {
  try {
    await assertMember(req.params.groupId, req.user.id);
    const items = await Expense.find({
      groupId: req.params.groupId,
      deletedAt: null,
    })
      .populate("paidBy", "name email")
      .sort({ createdAt: -1 });

    res.json(items);
  } catch (e) {
    console.error("GET /expenses/:groupId error:", e);
    res.status(e.status || 500).json({ error: e.message || "Server error" });
  }
});

/**
 * GET /expenses/balances/:groupId
 * Returns an object { userId: netBalance } from non-deleted expenses.
 * Positive = they are owed; Negative = they owe.
 */
router.get("/balances/:groupId", auth, async (req, res) => {
  try {
    const g = await assertMember(req.params.groupId, req.user.id);
    const balances = {};
    (g.members || []).forEach((m) => (balances[String(m)] = 0));

    const items = await Expense.find({
      groupId: req.params.groupId,
      deletedAt: null,
    }).lean();

    for (const it of items) {
      // payer gets +amount
      const payerKey = String(it.paidBy);
      balances[payerKey] = (balances[payerKey] || 0) + Number(it.amount || 0);

      // each split owes -share
      for (const s of it.splits || []) {
        const key = String(s.userId);
        balances[key] = (balances[key] || 0) - Number(s.share || 0);
      }
    }

    res.json(balances);
  } catch (e) {
    console.error("GET /expenses/balances/:groupId error:", e);
    res.status(e.status || 500).json({ error: e.message || "Server error" });
  }
});

/**
 * DELETE /expenses/:id
 * Creator-only; soft delete (set deletedAt).
 */
router.delete("/:id", auth, async (req, res) => {
  try {
    const exp = await Expense.findById(req.params.id);
    if (!exp || exp.deletedAt) return res.status(404).json({ error: "Not found" });

    // creator-only
    if (String(exp.createdBy) !== String(req.user.id)) {
      return res.status(403).json({ error: "Not allowed" });
    }

    exp.deletedAt = new Date();
    await exp.save();
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /expenses/:id error:", e);
    res.status(e.status || 500).json({ error: e.message || "Server error" });
  }
});

module.exports = router;