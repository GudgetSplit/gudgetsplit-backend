const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true, lowercase: true },
    password: { type: String, required: true },
    // for password reset
    resetToken: { type: String, default: null },
    resetExpires: { type: Date, default: null },

    
    // add inside the schema definition
plan: { type: String, enum: ["free", "premium"], default: "free" },

  },
  { timestamps: true }
);

// hash on save if modified
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = async function (candidate) {
  // if somehow this user has no password stored, fail gracefully
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model("User", UserSchema);