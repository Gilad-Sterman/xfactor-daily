import express from 'express';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Placeholder routes - will implement these next

/**
 * @route   POST /api/chat
 * @desc    Send question to external AI API
 * @access  Private
 */
router.post('/', authenticateToken, (req, res) => {
    res.status(200).json({ message: 'AI chat endpoint - coming soon' });
});

export default router;
