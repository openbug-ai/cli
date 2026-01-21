const router = require('express').Router();
const { 
  signToken, 
  verifyToken, 
  requireRole,
  signTokenWithExpired,
  requireRoleWithAssignmentBug,
} = require('../services/authService');

router.post('/login', (req, res) => {
  const { userId = 'user-1', role = 'user' } = req.body || {};
  const token = signToken({ userId, role });
  res.json({ token });
});

router.get('/me', verifyToken, (req, res) => {
  res.json({ user: req.user });
});

router.get('/admin', verifyToken, requireRole('admin'), (req, res) => {
  res.json({ secret: 'admin-area' });
});

router.post('/login-expired', (req, res) => {
  const { userId = 'user-1', role = 'user' } = req.body || {};
  const token = signTokenWithExpired({ userId, role });
  res.json({ token, note: 'This token is already expired' });
});

router.get('/admin-assignment-bug', verifyToken, requireRoleWithAssignmentBug('admin'), (req, res) => {
  res.json({ secret: 'admin-area', note: 'RBAC with assignment bug' });
});


module.exports = router;
