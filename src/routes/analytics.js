import express from 'express';
import { authenticateToken, requireManager } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

/**
 * @route   GET /api/analytics/dashboard
 * @desc    Get dashboard stats for admin dashboard
 * @access  Private (Manager/Admin)
 */
router.get('/dashboard', authenticateToken, requireManager, async (req, res) => {
    try {
        // Get total users count
        const { count: totalUsers } = await supabaseAdmin
            .from('users')
            .select('*', { count: 'exact', head: true });

        // Get active users count (using is_active field from database)
        const { count: activeUsers } = await supabaseAdmin
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        // Get total lessons count
        const { count: totalLessons } = await supabaseAdmin
            .from('lessons')
            .select('*', { count: 'exact', head: true });

        // Get published lessons count
        const { count: publishedLessons } = await supabaseAdmin
            .from('lessons')
            .select('*', { count: 'exact', head: true })
            .eq('is_published', true);

        // Get total views count (calculate from user lesson progress)
        const { data: usersData } = await supabaseAdmin
            .from('users')
            .select('lesson_progress')
            .not('lesson_progress', 'is', null);

        let totalViews = 0;
        if (usersData) {
            totalViews = usersData.reduce((sum, user) => {
                const progress = user.lesson_progress || {};
                return sum + Object.keys(progress).length; // Count lessons accessed by users
            }, 0);
        }

        // Get support tickets count (if support_tickets table exists)
        let totalSupportTickets = 0;
        let openSupportTickets = 0;
        try {
            const { count: supportCount } = await supabaseAdmin
                .from('support_tickets')
                .select('*', { count: 'exact', head: true });
            totalSupportTickets = supportCount || 0;

            // Get open support tickets count
            const { count: openCount } = await supabaseAdmin
                .from('support_tickets')
                .select('*', { count: 'exact', head: true })
                .in('status', ['open', 'in_progress']);
            openSupportTickets = openCount || 0;
        } catch (error) {
            // Support tickets table might not exist yet
            console.log('Support tickets table not found:', error.message);
        }

        // Get bot questions count from user preferences
        let totalBotQuestions = 0;
        try {
            const { data: usersWithBotUsage } = await supabaseAdmin
                .from('users')
                .select('preferences')
                .not('preferences', 'is', null);
            
            if (usersWithBotUsage) {
                totalBotQuestions = usersWithBotUsage.reduce((sum, user) => {
                    const preferences = user.preferences || {};
                    const botQuestions = preferences.bot_questions_count || 0;
                    return sum + botQuestions;
                }, 0);
            }
        } catch (error) {
            console.log('Error fetching bot usage data:', error.message);
        }

        // Calculate completion rate (users with at least one completed lesson)
        const { data: usersWithProgress } = await supabaseAdmin
            .from('users')
            .select('lesson_progress, total_lessons_completed')
            .not('lesson_progress', 'is', null);

        let usersWithCompletedLessons = 0;
        if (usersWithProgress) {
            usersWithCompletedLessons = usersWithProgress.filter(user => {
                // Check both total_lessons_completed field and lesson_progress
                if (user.total_lessons_completed && user.total_lessons_completed > 0) {
                    return true;
                }
                
                const progress = user.lesson_progress || {};
                return Object.values(progress).some(lessonProgress => 
                    lessonProgress.status === 'completed' || lessonProgress.completed === true
                );
            }).length;
        }

        const completionRate = totalUsers > 0 ? Math.round((usersWithCompletedLessons / totalUsers) * 100) : 0;

        const dashboardStats = {
            totalUsers,
            activeUsers,
            totalLessons,
            publishedLessons,
            totalViews,
            totalSupportTickets,
            openSupportTickets,
            totalBotQuestions,
            completionRate,
            usersWithCompletedLessons
        };

        res.status(200).json({
            success: true,
            data: dashboardStats
        });

    } catch (error) {
        console.error('Error fetching dashboard analytics:', error);
        res.status(500).json({
            success: false,
            message: 'שגיאה בטעינת נתוני המערכת',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/analytics/export
 * @desc    Export user data to CSV
 * @access  Private (Manager/Admin)
 */
router.get('/export', authenticateToken, requireManager, (req, res) => {
    res.status(200).json({ message: 'Export analytics endpoint - coming soon' });
});

export default router;
