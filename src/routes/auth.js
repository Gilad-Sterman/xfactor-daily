import express from 'express';
import { body, validationResult } from 'express-validator';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Generate random OTP
const generateOTP = () => {
    const length = parseInt(process.env.OTP_LENGTH) || 6;
    return Math.floor(Math.random() * Math.pow(10, length)).toString().padStart(length, '0');
};

// Store OTPs temporarily (in production, use Redis or database)
const otpStore = new Map();

// Clean up expired OTPs
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of otpStore.entries()) {
        if (now > value.expires) {
            otpStore.delete(key);
        }
    }
}, 60000); // Clean up every minute

/**
 * @route   POST /api/auth/login
 * @desc    Login with email and password
 * @access  Public
 */
router.post('/login', [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 1 }).withMessage('Password is required')
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { email, password } = req.body;

        // Get user from database
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (userError || !user) {
            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'Email or password is incorrect'
            });
        }

        if (!user.is_active) {
            return res.status(403).json({
                error: 'Account deactivated',
                message: 'Your account has been deactivated. Please contact support.'
            });
        }

        // For development, we'll use simple password comparison
        // In production, you'd hash passwords with bcrypt
        const isValidPassword = password === 'password123'; // Simple dev password
        
        if (!isValidPassword) {
            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'Email or password is incorrect'
            });
        }

        // Create JWT tokens
        const accessToken = jwt.sign(
            { 
                userId: user.id,
                email: user.email,
                role: 'authenticated'
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );
        
        const refreshToken = jwt.sign(
            { 
                userId: user.id,
                email: user.email,
                type: 'refresh'
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
        );

        // Update last login
        await supabaseAdmin
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', user.id);

        // Return success response
        res.status(200).json({
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                phone: user.phone,
                role: user.role,
                company: user.company,
                team: user.team,
                avatar_url: user.avatar_url,
                notification_time: user.notification_time,
                notification_enabled: user.notification_enabled,
                timezone: user.timezone,
                current_streak: user.current_streak,
                longest_streak: user.longest_streak,
                total_lessons_completed: user.total_lessons_completed,
                badges_earned: user.badges_earned,
                created_at: user.created_at,
                last_login: user.last_login,
                last_activity_date: user.last_activity_date
            },
            tokens: {
                accessToken: accessToken,
                refreshToken: refreshToken,
                expiresIn: process.env.JWT_EXPIRES_IN || '24h'
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'Login failed',
            message: 'An error occurred during login'
        });
    }
});

/**
 * @route   POST /api/auth/send-otp (DEPRECATED - keeping for reference)
 * @desc    Send OTP to user's email
 * @access  Public
 */
router.post('/send-otp', [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { email } = req.body;

        // Check if user exists in our database
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .select('id, email, first_name, is_active')
            .eq('email', email)
            .single();

        if (userError || !user) {
            return res.status(404).json({
                error: 'User not found',
                message: 'No account found with this email address'
            });
        }

        if (!user.is_active) {
            return res.status(403).json({
                error: 'Account deactivated',
                message: 'Your account has been deactivated. Please contact support.'
            });
        }

        // Generate OTP
        const otp = generateOTP();
        const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
        const expires = Date.now() + (expiryMinutes * 60 * 1000);

        // Store OTP
        otpStore.set(email, {
            otp,
            expires,
            userId: user.id,
            attempts: 0
        });

        // TODO: Send OTP via email
        // For now, we'll just log it (in development)
        if (process.env.NODE_ENV === 'development') {
            console.log(`🔐 OTP for ${email}: ${otp}`);
        }

        // TODO: Implement actual email sending
        // const emailSent = await sendOTPEmail(email, otp, user.first_name);

        res.status(200).json({
            message: 'OTP sent successfully',
            email: email,
            expiresIn: expiryMinutes,
            // In development, include OTP for testing
            ...(process.env.NODE_ENV === 'development' && { otp })
        });

    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({
            error: 'Failed to send OTP',
            message: 'An error occurred while sending the OTP'
        });
    }
});

/**
 * @route   POST /api/auth/verify-otp
 * @desc    Verify OTP and login user
 * @access  Public
 */
router.post('/verify-otp', [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('otp').isLength({ min: 4, max: 8 }).withMessage('Valid OTP is required')
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { email, otp } = req.body;

        // Get stored OTP
        const storedOTP = otpStore.get(email);
        
        if (!storedOTP) {
            return res.status(400).json({
                error: 'OTP not found',
                message: 'No OTP found for this email. Please request a new one.'
            });
        }

        // Check if OTP is expired
        if (Date.now() > storedOTP.expires) {
            otpStore.delete(email);
            return res.status(400).json({
                error: 'OTP expired',
                message: 'The OTP has expired. Please request a new one.'
            });
        }

        // Check attempts
        if (storedOTP.attempts >= 3) {
            otpStore.delete(email);
            return res.status(429).json({
                error: 'Too many attempts',
                message: 'Too many failed attempts. Please request a new OTP.'
            });
        }

        // Verify OTP
        if (storedOTP.otp !== otp) {
            storedOTP.attempts++;
            return res.status(400).json({
                error: 'Invalid OTP',
                message: 'The OTP you entered is incorrect.',
                attemptsLeft: 3 - storedOTP.attempts
            });
        }

        // OTP is valid, create our own JWT tokens
        
        const accessToken = jwt.sign(
            { 
                userId: storedOTP.userId,
                email: email,
                role: 'authenticated'
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );
        
        const refreshToken = jwt.sign(
            { 
                userId: storedOTP.userId,
                email: email,
                type: 'refresh'
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
        );

        const tokens = {
            accessToken: accessToken,
            refreshToken: refreshToken
        };

        // Get user data
        const { data: userData, error: userError } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('id', storedOTP.userId)
            .single();

        if (userError || !userData) {
            return res.status(500).json({
                error: 'User data error',
                message: 'Failed to retrieve user data'
            });
        }

        // Update last login
        await supabaseAdmin
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', userData.id);

        // Clean up OTP
        otpStore.delete(email);

        // Return success with user data and tokens
        res.status(200).json({
            message: 'Login successful',
            user: {
                id: userData.id,
                email: userData.email,
                firstName: userData.first_name,
                lastName: userData.last_name,
                role: userData.role,
                company: userData.company,
                team: userData.team,
                avatarUrl: userData.avatar_url,
                currentStreak: userData.current_streak,
                totalLessonsCompleted: userData.total_lessons_completed
            },
            tokens: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresIn: process.env.JWT_EXPIRES_IN || '24h'
            }
        });

    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({
            error: 'Verification failed',
            message: 'An error occurred while verifying the OTP'
        });
    }
});

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh', [
    body('refreshToken').notEmpty().withMessage('Refresh token is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { refreshToken } = req.body;

        // Refresh the session with Supabase
        const { data, error } = await supabase.auth.refreshSession({
            refresh_token: refreshToken
        });

        if (error) {
            return res.status(401).json({
                error: 'Invalid refresh token',
                message: 'The refresh token is invalid or expired'
            });
        }

        res.status(200).json({
            message: 'Token refreshed successfully',
            tokens: {
                accessToken: data.session?.access_token,
                refreshToken: data.session?.refresh_token,
                expiresIn: process.env.JWT_EXPIRES_IN || '24h'
            }
        });

    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(500).json({
            error: 'Refresh failed',
            message: 'An error occurred while refreshing the token'
        });
    }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Public (no auth required - logout is client-side)
 */
router.post('/logout', async (req, res) => {
    try {
        // With JWT tokens, logout is handled client-side by removing the token
        // Server-side logout would require token blacklisting, which we're not implementing yet
        
        res.status(200).json({
            message: 'Logged out successfully'
        });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            error: 'Logout failed',
            message: 'An error occurred while logging out'
        });
    }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user info
 * @access  Private
 */
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = req.user;

        res.status(200).json({
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
                company: user.company,
                team: user.team,
                avatarUrl: user.avatar_url,
                notificationTime: user.notification_time,
                notificationEnabled: user.notification_enabled,
                timezone: user.timezone,
                currentStreak: user.current_streak,
                longestStreak: user.longest_streak,
                totalLessonsCompleted: user.total_lessons_completed,
                badgesEarned: user.badges_earned,
                lastActivityDate: user.last_activity_date,
                createdAt: user.created_at
            }
        });

    } catch (error) {
        console.error('Get user info error:', error);
        res.status(500).json({
            error: 'Failed to get user info',
            message: 'An error occurred while retrieving user information'
        });
    }
});

export default router;
