const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Notification = require('../models/Notification');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const router = express.Router();

// Auth middleware
function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'All fields required' });
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'Email already in use' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword });
    await user.save();
    // Auto-login after registration:
    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get current user info
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('name email');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ name: user.name, email: user.email, _id: user._id });
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

// Get all users (for assignee selection)
router.get('/users', auth, async (req, res) => {
  try {
    const users = await User.find({}).select('name email').sort({ name: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all notifications for the logged-in user
router.get('/notifications', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const notifications = await Notification.find({ user: decoded.id }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

// Mark a notification as read
router.patch('/notifications/:id/read', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: decoded.id },
      { read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json(notification);
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

// Mark all notifications as read
router.patch('/notifications/read-all', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    await Notification.updateMany({ user: decoded.id, read: false }, { read: true });
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

// Update user settings
router.put('/me/settings', auth, async (req, res) => {
  try {
    const { notificationsEnabled, emailPrefs, language, highContrast } = req.body;
    const user = await User.findByIdAndUpdate(req.userId, { notificationsEnabled, emailPrefs, language, highContrast }, { new: true }).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Change password
router.put('/change-password', auth, async (req, res) => {
  try {
    const { current, newPassword } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const valid = await user.comparePassword(current);
    if (!valid) return res.status(400).json({ message: 'Current password is incorrect' });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: 'Password changed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete account
router.delete('/me', auth, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.userId);
    res.json({ message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(200).json({ message: 'If that email exists, a reset link was sent.' });
  const token = crypto.randomBytes(32).toString('hex');
  user.resetToken = token;
  user.resetTokenExpires = Date.now() + 1000 * 60 * 30; // 30 min
  await user.save();
  // Simulate sending email
  console.log(`Reset link: http://localhost:5173/reset-password/${token}`);
  res.json({ message: 'If that email exists, a reset link was sent.' });
});

// Reset password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  const user = await User.findOne({ resetToken: token, resetTokenExpires: { $gt: Date.now() } });
  if (!user) return res.status(400).json({ message: 'Invalid or expired token' });
  user.password = await bcrypt.hash(password, 10);
  user.resetToken = undefined;
  user.resetTokenExpires = undefined;
  await user.save();
  res.json({ message: 'Password reset successful' });
});

// 2FA setup (TOTP with QR code)
router.post('/2fa/setup', auth, async (req, res) => {
  const user = await User.findById(req.userId);
  const secret = speakeasy.generateSecret({ name: `NexFlow (${user.email})` });
  user.twoFactorSecret = secret.base32;
  await user.save();
  const otpauthUrl = secret.otpauth_url;
  const qr = await QRCode.toDataURL(otpauthUrl);
  res.json({ secret: secret.base32, otpauthUrl, qr });
});

// 2FA enable
router.post('/2fa/enable', auth, async (req, res) => {
  await User.findByIdAndUpdate(req.userId, { twoFactorEnabled: true });
  res.json({ message: '2FA enabled' });
});

// 2FA disable
router.post('/2fa/disable', auth, async (req, res) => {
  await User.findByIdAndUpdate(req.userId, { twoFactorEnabled: false, twoFactorSecret: null });
  res.json({ message: '2FA disabled' });
});

// 2FA verify (TOTP)
router.post('/2fa/verify', auth, async (req, res) => {
  const { code } = req.body;
  const user = await User.findById(req.userId);
  if (!user || !user.twoFactorSecret) return res.status(400).json({ message: '2FA not set up' });
  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token: code,
    window: 1
  });
  if (!verified) return res.status(400).json({ message: 'Invalid code' });
  res.json({ message: '2FA verified' });
});

// Email 2FA: send code
router.post('/2fa/email/send', auth, async (req, res) => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const user = await User.findByIdAndUpdate(req.userId, { email2FACode: code, email2FACodeExpires: Date.now() + 10 * 60 * 1000 });
  // Simulate sending email
  console.log(`Email 2FA code for ${user.email}: ${code}`);
  res.json({ message: '2FA code sent to email' });
});

// Email 2FA: verify code
router.post('/2fa/email/verify', auth, async (req, res) => {
  const { code } = req.body;
  const user = await User.findById(req.userId);
  if (!user || !user.email2FACode || user.email2FACodeExpires < Date.now()) return res.status(400).json({ message: 'Code expired' });
  if (user.email2FACode !== code) return res.status(400).json({ message: 'Invalid code' });
  user.email2FACode = undefined;
  user.email2FACodeExpires = undefined;
  await user.save();
  res.json({ message: '2FA verified' });
});

// Helper to emit notification event
function emitNotification(io, userId, notification) {
  if (io) io.emit('notification', { userId, notification });
}

module.exports = router; 