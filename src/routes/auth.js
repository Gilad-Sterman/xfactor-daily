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
    body('email').isEmail().withMessage('Valid email is required'),
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

        // Get user from database (case-insensitive email lookup)
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .select('*')
            .ilike('email', email)
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

        // Check if user has a password hash (for backward compatibility)
        if (!user.password_hash) {
            // Fallback for existing users without password hash
            const isValidPassword = password === 'password123';
            if (!isValidPassword) {
                return res.status(401).json({
                    error: 'Invalid credentials',
                    message: 'Email or password is incorrect. Please contact admin to set up your password.'
                });
            }
        } else {
            // Use bcrypt to compare hashed password
            const isValidPassword = await bcrypt.compare(password, user.password_hash);
            if (!isValidPassword) {
                return res.status(401).json({
                    error: 'Invalid credentials',
                    message: 'Email or password is incorrect'
                });
            }
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
                last_activity_date: user.last_activity_date,
                preferences: user.preferences || {
                    program_type: 'full_access',
                    chat_terms_accepted: false,
                    chat_terms_accepted_date: null
                }
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
 * @route   POST /api/auth/register
 * @desc    Register new user with email and password
 * @access  Public
 */
router.post('/register', [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('firstName').notEmpty().withMessage('First name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
    body('company').optional(),
    body('team').optional(),
    body('phone').optional()
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

        const { email, password, firstName, lastName, company, team, phone } = req.body;

        // Check if user already exists (case-insensitive)
        const { data: existingUser, error: checkError } = await supabaseAdmin
            .from('users')
            .select('id, email')
            .ilike('email', email)
            .single();

        if (existingUser) {
            return res.status(409).json({
                error: 'User already exists',
                message: 'An account with this email already exists'
            });
        }

        // Create user in Supabase Auth first (for password reset functionality)
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true, // Skip email confirmation
            user_metadata: {
                first_name: firstName,
                last_name: lastName
            }
        });

        if (authError) {
            console.error('Supabase Auth user creation error:', authError);
            return res.status(500).json({
                error: 'Registration failed',
                message: 'Failed to create authentication account'
            });
        }

        // Hash password for custom users table
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create user in custom users table
        const { data: newUser, error: createError } = await supabaseAdmin
            .from('users')
            .insert({
                id: authUser.user.id, // Use same ID as Supabase Auth user
                email,
                password_hash: passwordHash,
                first_name: firstName,
                last_name: lastName,
                role: 'learner',
                company: company || null,
                team: team || null,
                phone: phone || null,
                is_active: true,
                preferences: {
                    program_type: 'full_access',
                    chat_terms_accepted: false,
                    chat_terms_accepted_date: null
                }
            })
            .select()
            .single();

        if (createError || !newUser) {
            console.error('User creation error:', createError);
            // Clean up Supabase Auth user if custom table insert fails
            await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
            return res.status(500).json({
                error: 'Registration failed',
                message: 'Failed to create user account'
            });
        }

        // Create JWT tokens
        const accessToken = jwt.sign(
            { 
                userId: newUser.id,
                email: newUser.email,
                role: 'authenticated'
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );
        
        const refreshToken = jwt.sign(
            { 
                userId: newUser.id,
                email: newUser.email,
                type: 'refresh'
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
        );

        // Return success response (same format as login)
        res.status(201).json({
            message: 'Registration successful',
            user: {
                id: newUser.id,
                email: newUser.email,
                first_name: newUser.first_name,
                last_name: newUser.last_name,
                phone: newUser.phone,
                role: newUser.role,
                company: newUser.company,
                team: newUser.team,
                avatar_url: newUser.avatar_url,
                notification_time: newUser.notification_time,
                notification_enabled: newUser.notification_enabled,
                timezone: newUser.timezone,
                current_streak: newUser.current_streak,
                longest_streak: newUser.longest_streak,
                total_lessons_completed: newUser.total_lessons_completed,
                badges_earned: newUser.badges_earned,
                created_at: newUser.created_at,
                last_login: null,
                last_activity_date: newUser.last_activity_date,
                preferences: newUser.preferences
            },
            tokens: {
                accessToken: accessToken,
                refreshToken: refreshToken,
                expiresIn: process.env.JWT_EXPIRES_IN || '24h'
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            error: 'Registration failed',
            message: 'An error occurred during registration'
        });
    }
});

/**
 * @route   POST /api/auth/send-otp (DEPRECATED - keeping for reference)
 * @desc    Send OTP to user's email
 * @access  Public
 */
router.post('/send-otp', [
    body('email').isEmail().withMessage('Valid email is required')
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

        // Check if user exists and is active (case-insensitive)
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .select('id, email, first_name, is_active')
            .ilike('email', email)
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
    body('email').isEmail().withMessage('Valid email is required'),
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
 * @route   POST /api/auth/forgot-password
 * @desc    Send password reset email using Supabase Auth
 * @access  Public
 */
router.post('/forgot-password', [
    body('email').isEmail().withMessage('Valid email is required')
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

        // Check if user exists in our database (case-insensitive)
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .select('id, email, first_name, is_active')
            .ilike('email', email)
            .single();

        if (userError || !user) {
            // Don't reveal if user exists or not for security
            return res.status(200).json({
                message: 'If an account with this email exists, a password reset link has been sent.'
            });
        }

        if (!user.is_active) {
            return res.status(200).json({
                message: 'If an account with this email exists, a password reset link has been sent.'
            });
        }

        // Check if user exists in Supabase Auth
        const { data: authUsers, error: authCheckError } = await supabaseAdmin.auth.admin.listUsers();
        const existingAuthUser = authUsers?.users?.find(authUser => 
            authUser.email?.toLowerCase() === email.toLowerCase()
        );

        if (!existingAuthUser) {
            // Create user in Supabase Auth for existing users (migration)
            const { data: newAuthUser, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
                email: email,
                password: 'temp-password-' + Date.now(), // Temporary password, will be reset
                email_confirm: true,
                user_metadata: {
                    first_name: user.first_name,
                    last_name: user.last_name,
                    migrated_from_custom_table: true
                }
            });

            if (authCreateError) {
                console.error('Failed to create Supabase Auth user for migration:', authCreateError);
                return res.status(500).json({
                    error: 'Failed to prepare password reset',
                    message: 'An error occurred while preparing your password reset'
                });
            }

            // Update custom users table with Supabase Auth ID
            const { error: updateError } = await supabaseAdmin
                .from('users')
                .update({ id: newAuthUser.user.id })
                .eq('id', user.id);

            if (updateError) {
                console.error('Failed to update user ID after migration:', updateError);
                // Continue anyway, the reset will still work
            }
        }

        // Use Supabase Auth to send password reset email
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password`
        });

        if (resetError) {
            console.error('Password reset error:', resetError);
            return res.status(500).json({
                error: 'Failed to send reset email',
                message: 'An error occurred while sending the password reset email'
            });
        }

        res.status(200).json({
            message: 'If an account with this email exists, a password reset link has been sent.',
            email: email
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            error: 'Failed to process request',
            message: 'An error occurred while processing your password reset request'
        });
    }
});

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password using Supabase Auth token and sync to our database
 * @access  Public
 */
router.post('/reset-password', [
    body('access_token').notEmpty().withMessage('Access token is required'),
    body('refresh_token').notEmpty().withMessage('Refresh token is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
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

        const { access_token, refresh_token, password } = req.body;

        // Set the session with the tokens from the reset email
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token
        });

        if (sessionError || !sessionData.user) {
            return res.status(400).json({
                error: 'Invalid reset token',
                message: 'The password reset token is invalid or has expired'
            });
        }

        // Update password using Supabase Auth
        const { error: updateError } = await supabase.auth.updateUser({
            password: password
        });

        if (updateError) {
            console.error('Supabase Auth password update error:', updateError);
            return res.status(400).json({
                error: 'Failed to update password',
                message: 'An error occurred while updating your password'
            });
        }

        // Hash the new password and sync to our users table
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Update our users table with the new password hash
        const { error: dbUpdateError } = await supabaseAdmin
            .from('users')
            .update({ 
                password_hash: passwordHash,
                updated_at: new Date().toISOString()
            })
            .eq('id', sessionData.user.id); // Use Supabase Auth user ID

        if (dbUpdateError) {
            console.error('Database password sync error:', dbUpdateError);
            // Don't fail the request since Supabase password was updated successfully
        }

        res.status(200).json({
            message: 'Password reset successfully',
            user: {
                email: sessionData.user.email
            }
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            error: 'Failed to reset password',
            message: 'An error occurred while resetting your password'
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
                phone: user.phone,
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
                createdAt: user.created_at,
                preferences: user.preferences || {
                    program_type: 'full_access',
                    chat_terms_accepted: false,
                    chat_terms_accepted_date: null
                }
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
