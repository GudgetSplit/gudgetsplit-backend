// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");


const app = express();

// -------------------- CORS --------------------
const FRONTEND_URL = process.env.APP_BASE_URL || "http://localhost:5173"; // can be your Vercel URL too

// Add any other allowed origins here (exact strings)
const allowedOrigins = [
  "http://localhost:5173",
  FRONTEND_URL, // from env
  "https://budgetsplit-frontend-v1.vercel.app", // <-- replace if your Vercel domain is different
];

// Allow any *.vercel.app just in case you create preview deployments
const vercelRegex = /\.vercel\.app$/;

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // allow mobile apps / curl / Postman (no origin)
      const ok =
        allowedOrigins.includes(origin) || vercelRegex.test(origin || "");
      return ok ? cb(null, true) : cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));

// -------------------- MongoDB --------------------
const MONGO_URL = process.env.MONGO_URL;
if (!MONGO_URL) {
  console.error("❌ MONGO_URL is missing in environment variables");
  process.exit(1);
}

mongoose
  .connect(MONGO_URL, {
    // options can be added if needed
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// -------------------- Routes --------------------
const authRoutes = require("./routes/auth");
const groupRoutes = require("./routes/groups");
const expenseRoutes = require("./routes/expenses");
const reminderRoutes = require("./routes/reminders");
const billingRoutes = require("./routes/billing");

// Health / root
app.get("/", (req, res) => {
  res.send("BudgetSplit API is running...");
});

// Mount route modules
app.use("/auth", authRoutes);
app.use("/groups", groupRoutes);
app.use("/expenses", expenseRoutes);
app.use("/reminders", reminderRoutes);
app.use("/billing", billingRoutes);

// -------------------- Error handler --------------------
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  const code = err.status || 500;
  res.status(code).json({ error: err.message || "Server error" });
});

// -------------------- Start server --------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);