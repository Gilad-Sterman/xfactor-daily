import jwt from 'jsonwebtoken';
import { supabaseAdmin, getUserFromToken } from '../config/supabase.js';

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({ 
                error: 'Access token required',
                message: 'Please provide a valid access token'
            });
        }

        // Verify the JWT token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            return res.status(401).json({ 
                error: 'Invalid token',
                message: 'The provided token is invalid or expired'
            });
        }

        // Get user details from our database
        const { data: userData, error } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('id', decoded.userId)
            .single();

        if (error || !userData) {
            return res.status(401).json({ 
                error: 'User not found',
                message: 'User associated with this token was not found'
            });
        }

        if (!userData.is_active) {
            return res.status(403).json({ 
                error: 'Account deactivated',
                message: 'Your account has been deactivated'
            });
        }

        // Note: We're using our own JWT tokens, not Supabase auth tokens

        // Attach user to request object
        req.user = userData;
        req.token = token;
        
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(401).json({ 
            error: 'Authentication failed',
            message: 'Failed to authenticate token'
        });
    }
};

// Middleware to check user roles
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                error: 'Authentication required',
                message: 'Please authenticate first'
            });
        }

        const userRole = req.user.role;
        const allowedRoles = Array.isArray(roles) ? roles : [roles];

        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({ 
                error: 'Insufficient permissions',
                message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`
            });
        }

        next();
    };
};

// Specific role middleware functions
const requireAdmin = requireRole('admin');
const requireManager = requireRole(['manager', 'admin']);
const requireSupport = requireRole(['support', 'admin']);
const requireLearner = requireRole(['learner', 'manager', 'admin']);

// Middleware to check if user can access company data
const requireSameCompany = (req, res, next) => {
    const targetUserId = req.params.userId || req.body.userId;
    const currentUser = req.user;

    // Admins can access any company data
    if (currentUser.role === 'admin') {
        return next();
    }

    // If no target user ID, just check if user is authenticated
    if (!targetUserId) {
        return next();
    }

    // For managers, check if target user is in same company
    if (currentUser.role === 'manager') {
        // This will be validated by RLS policies, but we can add extra check here
        return next();
    }

    // For learners, they can only access their own data
    if (currentUser.role === 'learner' && targetUserId !== currentUser.id) {
        return res.status(403).json({ 
            error: 'Access denied',
            message: 'You can only access your own data'
        });
    }

    next();
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            req.user = null;
            return next();
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            const { data: userData, error } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('id', decoded.userId)
                .single();

            if (!error && userData && userData.is_active) {
                req.user = userData;
                req.token = token;
            }
        } catch (jwtError) {
            // Invalid token, but don't fail for optional auth
            req.user = null;
        }

        next();
    } catch (error) {
        // Don't fail on optional auth errors
        req.user = null;
        next();
    }
};

export {
    authenticateToken,
    requireRole,
    requireAdmin,
    requireManager,
    requireSupport,
    requireLearner,
    requireSameCompany,
    optionalAuth
};
