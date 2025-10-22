const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Product = require("../models/Product");
const Group = require("../models/Group");

// ensure member of group
async function ensureMember(userId, groupId) {
  const g = await Group.findById(groupId).lean();
  if (!g) return null;
  const isMember = g.members.map(String).includes(String(userId));
  return isMember ? g : null;
}

// List reminders for a group (with daysLeft)
router.get("/:groupId", auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!(await ensureMember(req.user.id, groupId))) {
      return res.status(403).json({ error: "Not a group member" });
    }
    const items = await Product.find({ groupId })
      .populate("addedBy", "name email")
      .sort({ expiresAt: 1 })
      .lean();

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const withDays = items.map((it) => {
      const ex = new Date(it.expiresAt);
      const daysLeft = Math.ceil((ex - start) / (1000 * 60 * 60 * 24));
      return { ...it, daysLeft };
    });
    res.json(withDays);
  } catch (e) {
    console.error("GET reminders error:", e);
    res.status(500).json({ error: "Failed to load reminders" });
  }
});

// Create a reminder
router.post("/", auth, async (req, res) => {
  try {
    const { groupId, name, quantity, unit, notes, expiresAt, imageUrl } = req.body;
    if (!groupId || !name || !expiresAt) {
      return res.status(400).json({ error: "groupId, name and expiresAt are required" });
    }
    if (!(await ensureMember(req.user.id, groupId))) {
      return res.status(403).json({ error: "Not a group member" });
    }

    const item = await Product.create({
      groupId,
      addedBy: req.user.id,
      name: String(name).trim(),
      quantity: Number(quantity) || 0,
      unit: String(unit || ""),
      notes: String(notes || ""),
      expiresAt: new Date(expiresAt),
      imageUrl: String(imageUrl || ""),
      notifyDaysBefore: [3, 4],
    });
    res.json(item);
  } catch (e) {
    console.error("POST reminders error:", e);
    res.status(500).json({ error: "Could not save reminder" });
  }
});

// Delete a reminder (only owner can delete)
router.delete("/:id", auth, async (req, res) => {
  try {
    const item = await Product.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });

    // must be the creator
    if (String(item.addedBy) !== String(req.user.id)) {
      return res.status(403).json({ error: "Only creator can delete" });
    }
    await item.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE reminders error:", e);
    res.status(500).json({ error: "Delete failed" });
  }
});

module.exports = router;