import express from 'express';
import { authenticateToken, requireAdmin, requireManager } from '../middleware/auth.js';

const router = express.Router();

// Placeholder routes - will implement these next

/**
 * @route   GET /api/users
 * @desc    Get users (admin/manager only)
 * @access  Private (Admin/Manager)
 */
router.get('/', authenticateToken, requireManager, (req, res) => {
    res.status(200).json({ message: 'Users endpoint - coming soon' });
});

/**
 * @route   PUT /api/users/profile
 * @desc    Update own profile
 * @access  Private
 */
router.put('/profile', authenticateToken, (req, res) => {
    res.status(200).json({ message: 'Update profile endpoint - coming soon' });
});

/**
 * @route   PUT /api/users/progress
 * @desc    Update lesson progress & streaks
 * @access  Private
 */
router.put('/progress', authenticateToken, (req, res) => {
    res.status(200).json({ message: 'Update progress endpoint - coming soon' });
});

/**
 * @route   POST /api/users/invite
 * @desc    Invite new user (admin only)
 * @access  Private (Admin)
 */
router.post('/invite', authenticateToken, requireAdmin, (req, res) => {
    res.status(200).json({ message: 'Invite user endpoint - coming soon' });
});

export default router;
