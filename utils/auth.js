// utils/auth.js
const jwt = require('jsonwebtoken');

function getUserOr401(req, res) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.set('WWW-Authenticate', 'Bearer realm="api", error="invalid_request"');
    res.status(401).json({ message: 'Authorization Bearer token required', code: 'NO_BEARER' });
    return null;
  }

  const token = authHeader.split(' ')[1];
  try {
    // { uid, provider, providerID, iat, exp, ... }
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      res.set('WWW-Authenticate', 'Bearer error="invalid_token", error_description="expired"');
      res.status(401).json({ message: 'access token expired', code: 'TOKEN_EXPIRED' });
      return null;
    }
    res.set('WWW-Authenticate', 'Bearer error="invalid_token", error_description="invalid signature or malformed"');
    res.status(401).json({ message: 'invalid access token', code: 'TOKEN_INVALID' });
    return null;
  }
}

module.exports = { getUserOr401 };