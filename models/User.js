const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'member', 'guest'],
    default: 'member'
  },
  avatar: { type: String },
  notificationsEnabled: { type: Boolean, default: true },
  emailPrefs: { type: Boolean, default: true },
  language: { type: String, default: 'en' },
  highContrast: { type: Boolean, default: false },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String },
  resetToken: { type: String },
  resetTokenExpires: { type: Date },
  email2FACode: { type: String },
  email2FACodeExpires: { type: Date }
}, { timestamps: true });

userSchema.methods.comparePassword = async function(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema); 