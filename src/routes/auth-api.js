const express = require('express');
const authController = require('../controllers/auth-controller');
const { loginLimiter, signupLimiter, verifyLimiter } = require('../middleware/rate-limiter');

const router = express.Router();

// Setup (initial superuser creation)
router.post('/setup', authController.setup);

// Login/Logout
router.post('/login', loginLimiter, authController.login);
router.post('/logout', authController.logout);

// Session management
router.get('/session', authController.getSession);
router.post('/session/refresh', authController.refreshSession);

// My profile (Phase 6)
router.get('/me', authController.getMe);
router.put('/me/password', authController.changePassword);
router.post('/me/regenerate-key', authController.regenerateKey);

// Signup workflow (Phase 7)
router.post('/signup', signupLimiter, authController.signup);
router.get('/verify/:token', verifyLimiter, authController.verifyEmail);

module.exports = router;
