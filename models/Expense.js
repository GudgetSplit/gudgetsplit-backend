const mongoose = require("mongoose");

const SplitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    share: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const ExpenseSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    mode: { type: String, enum: ["equal", "custom"], required: true },
    splits: { type: [SplitSchema], default: [] }, // required if mode = custom
    category: { type: String, default: "" },
    description: { type: String, default: "" },
    date: { type: Date, default: Date.now },

    // NEW:
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Expense", ExpenseSchema);