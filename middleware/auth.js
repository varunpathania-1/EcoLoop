const jwt = require('jsonwebtoken');
const User = require('../models/User');

function getToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

async function auth(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (user.isActive === false || ['rejected', 'suspended'].includes(user.accountStatus) || (user.role === 'collector' && user.accountStatus === 'pending')) {
      return res.status(403).json({ error: 'Your account has been deactivated. Please contact the administrator.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(role) {
  return function roleGuard(req, res, next) {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
}

function requireRoles(...roles) {
  return function rolesGuard(req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
}

function requireCustomer(req, res, next) {
  if (!req.user || !['resident', 'customer'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Customer access required' });
  }
  next();
}

module.exports = { auth, requireRole, requireRoles, requireCustomer };
