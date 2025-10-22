const express = require("express");
const router = express.Router();
const Group = require("../models/Group");
const Expense = require("../models/Expense");
const auth = require("../middleware/auth");

// helper: ensure owner
async function assertOwner(groupId, userId) {
  const g = await Group.findById(groupId);
  if (!g) {
    const err = new Error("Group not found");
    err.status = 404;
    throw err;
  }
  if (String(g.owner) !== String(userId)) {
    const err = new Error("Not allowed");
    err.status = 403;
    throw err;
  }
  return g;
}

/**
 * POST /groups
 * body: { name }
 * Creates group with current user as owner & first member.
 */
router.post("/", auth, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: "Name required" });

    const joinCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    const g = await Group.create({
      name: String(name).trim(),
      owner: req.user.id,
      members: [req.user.id],
      joinCode,
    });
    res.json(g);
  } catch (e) {
    console.error("POST /groups error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /groups/mine
 * Lists groups where current user is a member.
 */
router.get("/mine", auth, async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user.id })
      .sort({ createdAt: -1 })
      .lean();
    res.json(groups);
  } catch (e) {
    console.error("GET /groups/mine error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /groups/:id
 * Returns one group with members populated.
 */
router.get("/:id", auth, async (req, res) => {
  try {
    const g = await Group.findById(req.params.id)
      .populate("members", "name email")
      .lean();
    if (!g) return res.status(404).json({ error: "Not found" });
    // only member can view
    if (!g.members.some((m) => String(m._id || m) === String(req.user.id))) {
      return res.status(403).json({ error: "Not allowed" });
    }
    res.json(g);
  } catch (e) {
    console.error("GET /groups/:id error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /groups/join
 * body: { code }
 * Joins a group by joinCode.
 */
router.post("/join", auth, async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: "Join code required" });

    const g = await Group.findOne({ joinCode: String(code).toUpperCase() });
    if (!g) return res.status(404).json({ error: "Invalid code" });

    if (!g.members.some((m) => String(m) === String(req.user.id))) {
      g.members.push(req.user.id);
      await g.save();
    }
    res.json(g);
  } catch (e) {
    console.error("POST /groups/join error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /groups/:id/leave
 * Any member can leave; owner cannot leave if others remain.
 */
router.post("/:id/leave", auth, async (req, res) => {
  try {
    const g = await Group.findById(req.params.id);
    if (!g) return res.status(404).json({ error: "Group not found" });

    const isOwner = String(g.owner) === String(req.user.id);
    if (isOwner && g.members.length > 1) {
      return res
        .status(400)
        .json({ error: "Owner must transfer or delete group first" });
    }

    g.members = g.members.filter((m) => String(m) !== String(req.user.id));
    await g.save();
    res.json({ ok: true });
  } catch (e) {
    console.error("POST /groups/:id/leave error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /groups/:id/remove
 * Owner only; removes a member (not the owner).
 * body: { userId }
 */
router.post("/:id/remove", auth, async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId required" });

    const g = await assertOwner(req.params.id, req.user.id);
    if (String(userId) === String(g.owner)) {
      return res.status(400).json({ error: "Owner cannot be removed" });
    }

    g.members = g.members.filter((m) => String(m) !== String(userId));
    await g.save();
    res.json({ ok: true });
  } catch (e) {
    console.error("POST /groups/:id/remove error:", e);
    res.status(e.status || 500).json({ error: e.message || "Server error" });
  }
});

/**
 * DELETE /groups/:id
 * Owner only; soft-deletes all expenses then deletes group.
 */
router.delete("/:id", auth, async (req, res) => {
  try {
    await assertOwner(req.params.id, req.user.id);
    await Expense.updateMany(
      { groupId: req.params.id, deletedAt: null },
      { $set: { deletedAt: new Date() } }
    );
    await Group.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /groups/:id error:", e);
    res.status(e.status || 500).json({ error: e.message || "Server error" });
  }
});

module.exports = router;