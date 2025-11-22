import express from 'express';
import { authenticateToken, requireAdmin, requireManager } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

/**
 * @route   GET /api/users
 * @desc    Get users (admin/manager only)
 * @access  Private (Admin/Manager)
 */
router.get('/', authenticateToken, requireManager, async (req, res) => {
    try {
        const { 
            search, 
            role, 
            company, 
            is_active,
            page = 1, 
            limit = 20 
        } = req.query;

        let query = supabaseAdmin
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        // Apply filters
        if (search) {
            query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
        }
        
        if (role && role !== 'all') {
            query = query.eq('role', role);
        }
        
        if (company && company !== 'all') {
            query = query.eq('company', company);
        }
        
        if (is_active !== undefined && is_active !== 'all') {
            query = query.eq('is_active', is_active === 'true');
        }

        // Get total count for pagination (using same filters)
        let countQuery = supabaseAdmin
            .from('users')
            .select('*', { count: 'exact', head: true });

        // Apply same filters to count query
        if (search) {
            countQuery = countQuery.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
        }
        
        if (role && role !== 'all') {
            countQuery = countQuery.eq('role', role);
        }
        
        if (company && company !== 'all') {
            countQuery = countQuery.eq('company', company);
        }
        
        if (is_active !== undefined && is_active !== 'all') {
            countQuery = countQuery.eq('is_active', is_active === 'true');
        }

        const { count } = await countQuery;

        // Apply pagination
        const offset = (page - 1) * limit;
        query = query.range(offset, offset + limit - 1);

        const { data: users, error } = await query;


        if (error) {
            console.error('Error fetching users:', error);
            return res.status(500).json({
                error: 'Failed to fetch users',
                message: 'An error occurred while fetching users'
            });
        }

        // Format the response
        const formattedUsers = users.map(user => ({
            id: user.id,
            email: user.email,
            phone: user.phone,
            firstName: user.first_name,
            lastName: user.last_name,
            fullName: `${user.first_name} ${user.last_name}`,
            role: user.role,
            company: user.company,
            team: user.team,
            isActive: user.is_active,
            avatarUrl: user.avatar_url,
            currentStreak: user.current_streak,
            longestStreak: user.longest_streak,
            totalLessonsCompleted: user.total_lessons_completed,
            badgesEarned: user.badges_earned || [],
            lastActivityDate: user.last_activity_date,
            lastLogin: user.last_login,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
            preferences: user.preferences || {
                program_type: 'full_access',
                chat_terms_accepted: false,
                chat_terms_accepted_date: null
            }
        }));

        res.status(200).json({
            users: formattedUsers,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(count / limit),
                totalUsers: count,
                usersPerPage: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error in users route:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while processing your request'
        });
    }
});

/**
 * @route   PUT /api/users/profile
 * @desc    Update own profile
 * @access  Private
 */
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { 
            first_name, 
            last_name, 
            notification_enabled, 
            notification_time 
        } = req.body;

        // Build update object with only provided fields
        const updateData = {
            updated_at: new Date().toISOString()
        };

        if (first_name !== undefined) updateData.first_name = first_name;
        if (last_name !== undefined) updateData.last_name = last_name;
        if (notification_enabled !== undefined) updateData.notification_enabled = notification_enabled;
        if (notification_time !== undefined) updateData.notification_time = notification_time;

        // Update user profile
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .update(updateData)
            .eq('id', userId)
            .select('*')
            .single();

        if (error) {
            console.error('Error updating user profile:', error);
            return res.status(500).json({
                error: 'Failed to update profile',
                message: 'An error occurred while updating your profile'
            });
        }

        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                message: 'Your user profile could not be found'
            });
        }

        // Return updated user data in the same format as auth endpoints
        res.status(200).json({
            message: 'Profile updated successfully',
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
                badgesEarned: user.badges_earned || [],
                lastActivityDate: user.last_activity_date,
                createdAt: user.created_at,
                updatedAt: user.updated_at
            }
        });

    } catch (error) {
        console.error('Error in update profile route:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while processing your request'
        });
    }
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
 * @route   PUT /api/users/:id/role
 * @desc    Update user role (admin only)
 * @access  Private (Admin)
 */
router.put('/:id/role', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        // Validate role
        const validRoles = ['learner', 'manager', 'support', 'admin'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({
                error: 'Invalid role',
                message: `Role must be one of: ${validRoles.join(', ')}`
            });
        }

        // Update user role
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .update({ 
                role,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating user role:', error);
            return res.status(500).json({
                error: 'Failed to update user role',
                message: 'An error occurred while updating the user role'
            });
        }

        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                message: 'The user you are trying to update does not exist'
            });
        }

        res.status(200).json({
            message: 'User role updated successfully',
            user: {
                id: user.id,
                email: user.email,
                fullName: `${user.first_name} ${user.last_name}`,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Error in update user role route:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while processing your request'
        });
    }
});

/**
 * @route   PUT /api/users/:id/status
 * @desc    Update user active status (admin only)
 * @access  Private (Admin)
 */
router.put('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        // Update user status
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .update({ 
                is_active,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating user status:', error);
            return res.status(500).json({
                error: 'Failed to update user status',
                message: 'An error occurred while updating the user status'
            });
        }

        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                message: 'The user you are trying to update does not exist'
            });
        }

        res.status(200).json({
            message: `User ${is_active ? 'activated' : 'deactivated'} successfully`,
            user: {
                id: user.id,
                email: user.email,
                fullName: `${user.first_name} ${user.last_name}`,
                isActive: user.is_active
            }
        });

    } catch (error) {
        console.error('Error in update user status route:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while processing your request'
        });
    }
});

/**
 * @route   PUT /api/users/:id/details
 * @desc    Update user details (email, status, program type) - admin only
 * @access  Private (Admin)
 */
router.put('/:id/details', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { email, is_active, program_type } = req.body;

        // Build update object with only provided fields
        const updateData = {
            updated_at: new Date().toISOString()
        };

        if (email !== undefined) updateData.email = email;
        if (is_active !== undefined) updateData.is_active = is_active;
        
        // Handle program_type update in preferences
        if (program_type !== undefined) {
            // First get current preferences
            const { data: currentUser } = await supabaseAdmin
                .from('users')
                .select('preferences')
                .eq('id', id)
                .single();

            const currentPreferences = currentUser?.preferences || {
                program_type: 'full_access',
                chat_terms_accepted: false,
                chat_terms_accepted_date: null
            };

            updateData.preferences = {
                ...currentPreferences,
                program_type
            };
        }

        // Update user
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .update(updateData)
            .eq('id', id)
            .select('*')
            .single();

        if (error) {
            console.error('Error updating user details:', error);
            return res.status(500).json({
                error: 'Failed to update user details',
                message: 'An error occurred while updating the user details'
            });
        }

        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                message: 'The user you are trying to update does not exist'
            });
        }

        res.status(200).json({
            message: 'User details updated successfully',
            user: {
                id: user.id,
                email: user.email,
                fullName: `${user.first_name} ${user.last_name}`,
                role: user.role,
                isActive: user.is_active,
                preferences: user.preferences
            }
        });

    } catch (error) {
        console.error('Error in update user details route:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while processing your request'
        });
    }
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
