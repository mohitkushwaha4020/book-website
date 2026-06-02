const auth = require('./auth');

const adminAuth = (req, res, next) => {
  auth(req, res, () => {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }
    next();
  });
};

module.exports = adminAuth;
