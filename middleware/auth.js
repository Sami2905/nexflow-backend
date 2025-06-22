const jwt = require('jsonwebtoken');

function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('401: No token provided for', req.method, req.originalUrl);
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    console.warn('401: Invalid token for', req.method, req.originalUrl, '-', err.message);
    res.status(401).json({ message: 'Invalid token' });
  }
}

module.exports = { auth }; 