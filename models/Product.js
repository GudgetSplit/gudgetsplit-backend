const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true, index: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    name: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1, min: 0 },
    unit: { type: String, default: "" },
    notes: { type: String, default: "" },

    imageUrl: { type: String, default: "" },      // product photo served by /uploads
    expiresAt: { type: Date, required: true },

    // Remind 3 or 4 days before by default
    notifyDaysBefore: { type: [Number], default: [3, 4] },
    // YYYY-MM-DD strings to avoid duplicate notifications
    notifiedOnDates: { type: [String], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", ProductSchema);