const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// Serve uploaded images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// DB
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Routes
app.use("/auth", require("./routes/auth"));
app.use("/groups", require("./routes/groups"));
app.use("/expenses", require("./routes/expenses"));
app.use("/reminders", require("./routes/reminders"));
app.use("/upload", require("./routes/upload"));
app.use("/billing", require("./routes/billing"));

app.get("/", (_, res) => res.send("BudgetSplit API is running..."));

app.use((err, req, res, next) => {
  console.error("Global error:", err);
  res.status(500).json({ error: "Something went wrong" });
});

// --- Daily reminder cron at 09:00 Africa/Lagos ---
const cron = require("node-cron");
const Product = require("./models/Product");
cron.schedule(
  "0 9 * * *",
  async () => {
    try {
      const now = new Date();
      const tzNow = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
      const yyyy = tzNow.getFullYear();
      const mm = String(tzNow.getMonth() + 1).padStart(2, "0");
      const dd = String(tzNow.getDate()).padStart(2, "0");
      const todayKey = `${yyyy}-${mm}-${dd}`;
      const start = new Date(yyyy, tzNow.getMonth(), tzNow.getDate());

      const products = await Product.find({}).lean();
      for (const p of products) {
        const expires = new Date(p.expiresAt);
        const daysLeft = Math.ceil((expires - start) / (1000 * 60 * 60 * 24));
        const remindDays = Array.isArray(p.notifyDaysBefore) ? p.notifyDaysBefore : [3, 4];
        const already = Array.isArray(p.notifiedOnDates) && p.notifiedOnDates.includes(todayKey);

        if (remindDays.includes(daysLeft) && !already) {
          // TODO: replace with in-app or email
          console.log(`🔔 Expiry reminder: "${p.name}" expires in ${daysLeft} day(s)`);
          await Product.updateOne({ _id: p._id }, { $push: { notifiedOnDates: todayKey } });
        }
      }
    } catch (e) {
      console.error("Reminder cron error:", e);
    }
  },
  { timezone: "Africa/Lagos" }
);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));