const User = require('../models/User');

function requireRole(roles) {
  return async function (req, res, next) {
    try {
      const user = await User.findById(req.userId);
      if (!user) return res.status(401).json({ message: 'User not found' });
      const allowed = Array.isArray(roles) ? roles : [roles];
      if (!allowed.includes(user.role)) {
        return res.status(403).json({ message: 'Forbidden: insufficient role' });
      }
      next();
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  };
}

module.exports = { requireRole }; 