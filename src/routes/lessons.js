import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

/**
 * @route   GET /api/lessons
 * @desc    Get all lessons (with filters)
 * @access  Private
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { 
            category, 
            difficulty, 
            status, 
            search, 
            page = 1, 
            limit = 12 
        } = req.query;

        // First get all lessons
        let query = supabaseAdmin
            .from('lessons')
            .select('*')
            .order('created_at', { ascending: false });

        // Apply filters
        if (category && category !== 'all') {
            query = query.eq('category', category);
        }
        
        if (difficulty && difficulty !== 'all') {
            query = query.eq('difficulty_level', difficulty);
        }
        
        if (search) {
            query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
        }

        // Get total count for pagination
        const { count } = await supabaseAdmin
            .from('lessons')
            .select('*', { count: 'exact', head: true });

        // Apply pagination
        const offset = (page - 1) * limit;
        query = query.range(offset, offset + limit - 1);

        const { data: lessons, error } = await query;

        if (error) {
            console.error('Error fetching lessons:', error);
            return res.status(500).json({
                error: 'Failed to fetch lessons',
                message: 'An error occurred while fetching lessons'
            });
        }

        // Get user progress from users table (lesson_progress JSONB field)
        const { data: userData } = await supabaseAdmin
            .from('users')
            .select('lesson_progress')
            .eq('id', req.user.id)
            .single();

        // Extract lesson progress from JSONB field
        const userLessonProgress = userData?.lesson_progress || {};

        // Format the response and apply status filter
        let formattedLessons = lessons.map(lesson => {
            const progress = userLessonProgress[lesson.id] || {
                status: 'not_started',
                last_watched_position: 0,
                total_watch_time: 0,
                completion_percentage: 0
            };

            return {
                id: lesson.id,
                title: lesson.title,
                description: lesson.description,
                difficulty: 'beginner', // Default since no difficulty field in DB
                duration: lesson.video_duration ? Math.round(lesson.video_duration / 60) : null, // Convert seconds to minutes
                category: lesson.category,
                thumbnail: lesson.thumbnail_url,
                vimeoId: lesson.vimeo_video_id,
                videoUrl: lesson.vimeo_video_id ? `https://vimeo.com/${lesson.vimeo_video_id}` : null,
                tags: lesson.lesson_topics || [],
                createdAt: lesson.created_at,
                updatedAt: lesson.updated_at,
                userProgress: progress
            };
        });

        // Apply status filter after getting user progress
        if (status && status !== 'all') {
            formattedLessons = formattedLessons.filter(lesson => 
                lesson.userProgress.status === status
            );
        }

        res.status(200).json({
            lessons: formattedLessons,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(count / limit),
                totalLessons: count,
                lessonsPerPage: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error in lessons route:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while processing your request'
        });
    }
});

/**
 * @route   GET /api/lessons/today
 * @desc    Get today's lesson
 * @access  Private
 */
router.get('/today', authenticateToken, async (req, res) => {
    try {
        // Get today's date
        const today = new Date().toISOString().split('T')[0];
        
        // Get all lessons first
        const { data: allLessons, error: lessonsError } = await supabaseAdmin
            .from('lessons')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10); // Get first 10 lessons

        if (lessonsError || !allLessons || allLessons.length === 0) {
            return res.status(404).json({
                error: 'No lessons found',
                message: 'No lessons available in the database'
            });
        }

        // Get user progress from users table (lesson_progress JSONB field)
        const { data: userData } = await supabaseAdmin
            .from('users')
            .select('lesson_progress')
            .eq('id', req.user.id)
            .single();

        // Extract lesson progress from JSONB field
        const userLessonProgress = userData?.lesson_progress || {};

        // Find a lesson that's not completed (or if all completed, get the first one)
        let selectedLesson = allLessons.find(lesson => {
            const progress = userLessonProgress[lesson.id];
            return !progress || progress.status !== 'completed';
        }) || allLessons[0];

        const lessonProgress = userLessonProgress[selectedLesson.id] || {
            status: 'not_started',
            last_watched_position: 0,
            total_watch_time: 0,
            completion_percentage: 0
        };

        const formattedLesson = {
            id: selectedLesson.id,
            title: selectedLesson.title,
            description: selectedLesson.description,
            difficulty: 'beginner', // Default since no difficulty field in DB
            duration: selectedLesson.video_duration ? Math.round(selectedLesson.video_duration / 60) : null, // Convert seconds to minutes
            category: selectedLesson.category,
            thumbnail: selectedLesson.thumbnail_url,
            vimeoId: selectedLesson.vimeo_video_id,
            videoUrl: selectedLesson.vimeo_video_id ? `https://vimeo.com/${selectedLesson.vimeo_video_id}` : null,
            tags: selectedLesson.lesson_topics || [],
            userProgress: lessonProgress
        };

        res.status(200).json({ lesson: formattedLesson });

    } catch (error) {
        console.error('Error fetching today\'s lesson:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while fetching today\'s lesson'
        });
    }
});

/**
 * @route   GET /api/lessons/:id
 * @desc    Get lesson details
 * @access  Private
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: lesson, error } = await supabaseAdmin
            .from('lessons')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !lesson) {
            return res.status(404).json({
                error: 'Lesson not found',
                message: 'The requested lesson does not exist or is not available'
            });
        }

        // Get user progress from users table (lesson_progress JSONB field)
        const { data: userData } = await supabaseAdmin
            .from('users')
            .select('lesson_progress')
            .eq('id', req.user.id)
            .single();

        // Extract lesson progress from JSONB field
        const userLessonProgress = userData?.lesson_progress || {};
        const lessonProgress = userLessonProgress[lesson.id] || {
            status: 'not_started',
            last_watched_position: 0,
            total_watch_time: 0,
            completion_percentage: 0
        };

        // Format the response
        const formattedLesson = {
            id: lesson.id,
            title: lesson.title,
            description: lesson.description,
            difficulty: 'beginner', // Default since no difficulty field in DB
            duration: lesson.video_duration ? Math.round(lesson.video_duration / 60) : null, // Convert seconds to minutes
            category: lesson.category,
            thumbnail: lesson.thumbnail_url,
            vimeoId: lesson.vimeo_video_id,
            videoUrl: lesson.vimeo_video_id ? `https://vimeo.com/${lesson.vimeo_video_id}` : null,
            tags: lesson.lesson_topics || [],
            supportMaterials: lesson.support_materials || [],
            createdAt: lesson.created_at,
            updatedAt: lesson.updated_at,
            userProgress: lessonProgress
        };

        res.status(200).json({ lesson: formattedLesson });

    } catch (error) {
        console.error('Error fetching lesson details:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while fetching lesson details'
        });
    }
});

/**
 * @route   POST /api/lessons/:id/start
 * @desc    Start lesson session
 * @access  Private
 */
router.post('/:id/start', authenticateToken, async (req, res) => {
    try {
        const { id: lessonId } = req.params;
        const userId = req.user.id;
        const { device_info = 'web_browser', session_id } = req.body;

        // Verify lesson exists
        const { data: lesson, error: lessonError } = await supabaseAdmin
            .from('lessons')
            .select('id, title')
            .eq('id', lessonId)
            .single();

        if (lessonError || !lesson) {
            return res.status(404).json({
                error: 'Lesson not found',
                message: 'The requested lesson does not exist'
            });
        }

        // Get current user progress
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .select('lesson_progress')
            .eq('id', userId)
            .single();

        if (userError) {
            return res.status(500).json({
                error: 'Database error',
                message: 'Failed to fetch user progress'
            });
        }

        const currentProgress = user.lesson_progress || {};
        const lessonProgress = currentProgress[lessonId] || {};

        // Create new session data
        const sessionData = {
            session_id: session_id || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            started_at: new Date().toISOString(),
            device_info,
            events: []
        };

        // Update lesson progress
        const updatedProgress = {
            ...lessonProgress,
            status: lessonProgress.status === 'completed' ? 'completed' : 'in_progress',
            started_at: lessonProgress.started_at || new Date().toISOString(),
            last_watched_position: lessonProgress.last_watched_position || 0,
            total_watch_time: lessonProgress.total_watch_time || 0,
            completion_percentage: lessonProgress.completion_percentage || 0,
            watch_sessions: [
                ...(lessonProgress.watch_sessions || []),
                sessionData
            ]
        };

        // Update user progress in database
        const updatedLessonProgress = {
            ...currentProgress,
            [lessonId]: updatedProgress
        };

        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
                lesson_progress: updatedLessonProgress,
                last_activity_date: new Date().toISOString().split('T')[0],
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);

        if (updateError) {
            return res.status(500).json({
                error: 'Update failed',
                message: 'Failed to start lesson session'
            });
        }

        res.status(200).json({
            message: 'Lesson session started successfully',
            session: {
                session_id: sessionData.session_id,
                lesson_id: lessonId,
                lesson_title: lesson.title,
                started_at: sessionData.started_at,
                resume_position: updatedProgress.last_watched_position
            }
        });

    } catch (error) {
        console.error('Error starting lesson session:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while starting lesson session'
        });
    }
});

/**
 * @route   PUT /api/lessons/:id/progress
 * @desc    Update lesson progress (batched)
 * @access  Private
 */
router.put('/:id/progress', authenticateToken, async (req, res) => {
    try {
        const { id: lessonId } = req.params;
        const userId = req.user.id;
        const {
            last_watched_position,
            total_watch_time,
            completion_percentage,
            watch_session_data
        } = req.body;

        // Validate required fields
        if (typeof last_watched_position !== 'number' || typeof total_watch_time !== 'number') {
            return res.status(400).json({
                error: 'Invalid data',
                message: 'last_watched_position and total_watch_time are required and must be numbers'
            });
        }

        // Get current user progress
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .select('lesson_progress')
            .eq('id', userId)
            .single();

        if (userError) {
            return res.status(500).json({
                error: 'Database error',
                message: 'Failed to fetch user progress'
            });
        }

        const currentProgress = user.lesson_progress || {};
        const lessonProgress = currentProgress[lessonId] || {};

        // Update lesson progress
        const updatedProgress = {
            ...lessonProgress,
            status: completion_percentage >= 100 ? 'completed' : 'in_progress',
            last_watched_position: Math.max(last_watched_position, lessonProgress.last_watched_position || 0),
            total_watch_time: Math.max(total_watch_time, lessonProgress.total_watch_time || 0),
            completion_percentage: Math.min(Math.max(completion_percentage || 0, lessonProgress.completion_percentage || 0), 100),
            updated_at: new Date().toISOString()
        };

        // Update watch sessions if provided
        if (watch_session_data && watch_session_data.session_id) {
            const sessions = lessonProgress.watch_sessions || [];
            const sessionIndex = sessions.findIndex(s => s.session_id === watch_session_data.session_id);
            
            if (sessionIndex >= 0) {
                // Update existing session
                sessions[sessionIndex] = {
                    ...sessions[sessionIndex],
                    ...watch_session_data,
                    updated_at: new Date().toISOString()
                };
            } else {
                // Add new session data
                sessions.push({
                    ...watch_session_data,
                    updated_at: new Date().toISOString()
                });
            }
            
            updatedProgress.watch_sessions = sessions;
        }

        // Update user progress in database
        const updatedLessonProgress = {
            ...currentProgress,
            [lessonId]: updatedProgress
        };

        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
                lesson_progress: updatedLessonProgress,
                last_activity_date: new Date().toISOString().split('T')[0],
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);

        if (updateError) {
            return res.status(500).json({
                error: 'Update failed',
                message: 'Failed to update lesson progress'
            });
        }

        res.status(200).json({
            message: 'Progress updated successfully',
            progress: {
                lesson_id: lessonId,
                status: updatedProgress.status,
                last_watched_position: updatedProgress.last_watched_position,
                total_watch_time: updatedProgress.total_watch_time,
                completion_percentage: updatedProgress.completion_percentage,
                updated_at: updatedProgress.updated_at
            }
        });

    } catch (error) {
        console.error('Error updating lesson progress:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while updating lesson progress'
        });
    }
});

/**
 * @route   POST /api/lessons/:id/complete
 * @desc    Complete lesson
 * @access  Private
 */
router.post('/:id/complete', authenticateToken, async (req, res) => {
    try {
        const { id: lessonId } = req.params;
        const userId = req.user.id;
        const {
            final_watch_time,
            completion_percentage = 100,
            session_summary,
            rating,
            feedback
        } = req.body;

        // Get current user progress
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .select('lesson_progress, current_streak, longest_streak, total_lessons_completed, badges_earned, last_activity_date')
            .eq('id', userId)
            .single();

        if (userError) {
            return res.status(500).json({
                error: 'Database error',
                message: 'Failed to fetch user progress'
            });
        }

        const currentProgress = user.lesson_progress || {};
        const lessonProgress = currentProgress[lessonId] || {};
        const wasAlreadyCompleted = lessonProgress.status === 'completed';

        // Update lesson progress
        const updatedProgress = {
            ...lessonProgress,
            status: 'completed',
            completed_at: new Date().toISOString(),
            final_watch_time: final_watch_time || lessonProgress.total_watch_time || 0,
            completion_percentage: 100,
            rating: rating || lessonProgress.rating,
            feedback: feedback || lessonProgress.feedback,
            session_summary: session_summary || lessonProgress.session_summary
        };

        // Calculate streak and completion stats
        let newStreak = user.current_streak || 0;
        let newLongestStreak = user.longest_streak || 0;
        let newTotalCompleted = user.total_lessons_completed || 0;

        if (!wasAlreadyCompleted) {
            newTotalCompleted += 1;
            
            // Streak logic: only increase if this is the first lesson completed today
            // and the last activity was yesterday (consecutive days)
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const lastActivityDate = user.last_activity_date;
            
            // Check if user has completed any lesson today already
            const hasCompletedTodayAlready = Object.entries(currentProgress).some(([progressLessonId, progress]) => {
                if (progress.status === 'completed' && progress.completed_at) {
                    const completedDate = new Date(progress.completed_at).toISOString().split('T')[0];
                    return completedDate === today && progressLessonId !== lessonId;
                }
                return false;
            });
            
            if (!hasCompletedTodayAlready) {
                // This is the first lesson completed today
                if (lastActivityDate) {
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    const yesterdayStr = yesterday.toISOString().split('T')[0];
                    
                    if (lastActivityDate === yesterdayStr) {
                        // Last activity was yesterday - continue streak
                        newStreak += 1;
                    } else if (lastActivityDate === today) {
                        // Last activity was today - maintain current streak
                        // (this shouldn't happen with our logic, but just in case)
                    } else {
                        // Gap in activity - reset streak to 1
                        newStreak = 1;
                    }
                } else {
                    // First ever lesson completion - start streak
                    newStreak = 1;
                }
                
                // Update longest streak if current streak is higher
                if (newStreak > newLongestStreak) {
                    newLongestStreak = newStreak;
                }
            }
            // If user already completed a lesson today, don't change streak
        }

        // Badge system - check for new badges earned
        let currentBadges = Array.isArray(user.badges_earned) ? [...user.badges_earned] : [];
        let newBadgesEarned = [];
        
        if (!wasAlreadyCompleted) {
            // First lesson badge
            if (newTotalCompleted === 1 && !currentBadges.includes('שיעור ראשון')) {
                currentBadges.push('שיעור ראשון');
                newBadgesEarned.push('שיעור ראשון');
            }

            // 5 lessons badge
            if (newTotalCompleted === 5 && !currentBadges.includes('5 שיעורים')) {
                currentBadges.push('5 שיעורים');
                newBadgesEarned.push('5 שיעורים');
            }

            // 10 lessons badge
            if (newTotalCompleted === 10 && !currentBadges.includes('10 שיעורים')) {
                currentBadges.push('10 שיעורים');
                newBadgesEarned.push('10 שיעורים');
            }

            // Streak badges
            if (newStreak === 3 && !currentBadges.includes('רצף 3 ימים')) {
                currentBadges.push('רצף 3 ימים');
                newBadgesEarned.push('רצף 3 ימים');
            }

            if (newStreak === 7 && !currentBadges.includes('רצף שבוע')) {
                currentBadges.push('רצף שבוע');
                newBadgesEarned.push('רצף שבוע');
            }

            if (newStreak === 30 && !currentBadges.includes('רצף חודש')) {
                currentBadges.push('רצף חודש');
                newBadgesEarned.push('רצף חודש');
            }
        }

        // Update user progress in database
        const updatedLessonProgress = {
            ...currentProgress,
            [lessonId]: updatedProgress
        };

        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
                lesson_progress: updatedLessonProgress,
                current_streak: newStreak,
                longest_streak: newLongestStreak,
                total_lessons_completed: newTotalCompleted,
                badges_earned: currentBadges,
                last_activity_date: new Date().toISOString().split('T')[0],
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);

        if (updateError) {
            return res.status(500).json({
                error: 'Update failed',
                message: 'Failed to complete lesson'
            });
        }

        res.status(200).json({
            message: 'Lesson completed successfully',
            completion: {
                lesson_id: lessonId,
                completed_at: updatedProgress.completed_at,
                final_watch_time: updatedProgress.final_watch_time,
                completion_percentage: updatedProgress.completion_percentage,
                was_already_completed: wasAlreadyCompleted
            },
            user_stats: {
                current_streak: newStreak,
                longest_streak: newLongestStreak,
                total_lessons_completed: newTotalCompleted,
                badges_earned: currentBadges
            },
            new_badges: newBadgesEarned
        });

    } catch (error) {
        console.error('Error completing lesson:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while completing lesson'
        });
    }
});

/**
 * @route   GET /api/lessons/:id/resume
 * @desc    Get resume position for lesson
 * @access  Private
 */
router.get('/:id/resume', authenticateToken, async (req, res) => {
    try {
        const { id: lessonId } = req.params;
        const userId = req.user.id;

        // Get user progress
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .select('lesson_progress')
            .eq('id', userId)
            .single();

        if (userError) {
            return res.status(500).json({
                error: 'Database error',
                message: 'Failed to fetch user progress'
            });
        }

        const currentProgress = user.lesson_progress || {};
        const lessonProgress = currentProgress[lessonId] || {};

        res.status(200).json({
            lesson_id: lessonId,
            last_position: lessonProgress.last_watched_position || 0,
            total_progress: lessonProgress.completion_percentage || 0,
            status: lessonProgress.status || 'not_started',
            total_watch_time: lessonProgress.total_watch_time || 0,
            can_resume: (lessonProgress.last_watched_position || 0) > 0
        });

    } catch (error) {
        console.error('Error fetching resume position:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while fetching resume position'
        });
    }
});

/**
 * @route   POST /api/lessons
 * @desc    Create lesson (admin)
 * @access  Private (Admin)
 */
router.post('/', authenticateToken, requireAdmin, (req, res) => {
    res.status(200).json({ message: 'Create lesson endpoint - coming soon' });
});

/**
 * @route   PUT /api/lessons/:id
 * @desc    Update lesson (admin)
 * @access  Private (Admin)
 */
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
    res.status(200).json({ message: 'Update lesson endpoint - coming soon' });
});

/**
 * @route   POST /api/lessons/:id/materials
 * @desc    Upload support materials (admin)
 * @access  Private (Admin)
 */
router.post('/:id/materials', authenticateToken, requireAdmin, (req, res) => {
    res.status(200).json({ message: 'Upload materials endpoint - coming soon' });
});

export default router;
