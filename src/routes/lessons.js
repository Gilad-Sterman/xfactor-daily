import express from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';
import { uploadToCloudinary, generateSignedUrl } from '../config/cloudinary.js';
import axios from 'axios';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 10 // Max 10 files per request
    },
    fileFilter: (req, file, cb) => {
        // Only allow PDF files for support materials
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed for support materials'), false);
        }
    }
});

// Helper function to process support materials with file uploads
const processSupportMaterials = async (materials, files) => {
    if (!materials || !Array.isArray(materials)) {
        return []
    }

    const processedMaterials = []

    for (const material of materials) {
        
        if (material.type === 'link') {
            // Link materials - just store as is
            processedMaterials.push({
                id: material.id || Date.now().toString(),
                type: 'link',
                name: material.name,
                url: material.url,
                created_at: material.created_at || new Date().toISOString()
            });
        } else if (material.type === 'file') {
            // File materials - find corresponding uploaded file
            // Try multiple matching strategies due to encoding issues with Hebrew filenames
            let uploadedFile = files?.find(file => 
                file.fieldname === `material_file_${material.id}`
            );
            
            // If not found by fieldname, try by filename with encoding fixes
            if (!uploadedFile && files?.length > 0) {
                // For now, if we have exactly one file and one material, match them
                if (files.length === 1 && materials.filter(m => m.type === 'file').length === 1) {
                    uploadedFile = files[0];
                } else {
                    // Try to match by file extension and approximate size
                    const materialExt = material.fileName?.split('.').pop()?.toLowerCase()
                    uploadedFile = files.find(file => {
                        const fileExt = file.originalname?.split('.').pop()?.toLowerCase()
                        return fileExt === materialExt
                    })
                }
            }


            if (uploadedFile) {
                try {
                    // Upload to Cloudinary using the original material filename (proper encoding)
                    // instead of the corrupted multer filename
                    const uploadResult = await uploadToCloudinary(
                        uploadedFile.buffer,
                        material.fileName, // Use original filename with proper Hebrew encoding
                        'lesson_materials'
                    );

                    processedMaterials.push({
                        id: material.id || Date.now().toString(),
                        type: 'file',
                        name: material.name,
                        fileName: material.fileName, // Use original filename with proper Hebrew encoding
                        fileSize: uploadedFile.size,
                        fileType: uploadedFile.mimetype,
                        url: uploadResult.secure_url,
                        cloudinaryPublicId: uploadResult.public_id,
                        created_at: material.created_at || new Date().toISOString()
                    });
                } catch (uploadError) {
                    console.error('Error uploading file to Cloudinary:', uploadError);
                    throw new Error(`Failed to upload file: ${uploadedFile.originalname}`);
                }
            } else if (material.url) {
                // File already uploaded (update scenario)
                processedMaterials.push(material);
            }
        }
    }

    return processedMaterials;
};

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
                supportMaterials: lesson.support_materials || [],
                scheduledDate: lesson.scheduled_date,
                isPublished: lesson.is_published,
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
            supportMaterials: selectedLesson.support_materials || [],
            scheduledDate: selectedLesson.scheduled_date,
            isPublished: selectedLesson.is_published,
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
            scheduledDate: lesson.scheduled_date,
            isPublished: lesson.is_published,
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
                    } else {
                        // Gap in activity - reset streak to 1
                        newStreak = 1;
                    }
                } else {
                    // First ever lesson completion - start streak
                    newStreak = 1;
                }
                
                // Special case: if current streak is 0, always set to 1 for first completion today
                if (newStreak === 0) {
                    newStreak = 1;
                }
                
                // Update longest streak if current streak is higher
                if (newStreak > newLongestStreak) {
                    newLongestStreak = newStreak;
                }
            } else {
                // User already completed a lesson today
                // Special edge case: if streak is 0 but user completed lesson today, fix it
                if (newStreak === 0) {
                    newStreak = 1;
                    if (newStreak > newLongestStreak) {
                        newLongestStreak = newStreak;
                    }
                }
            }
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
router.post('/', authenticateToken, requireAdmin, upload.array('support_files', 10), async (req, res) => {
    try {
        const {
            title,
            description,
            vimeo_video_id,
            video_duration,
            thumbnail_url,
            category,
            tags,
            lesson_topics,
            key_points,
            support_materials,
            scheduled_date,
            is_published = false
        } = req.body;

        // Validate required fields
        if (!title) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'Title is required'
            });
        }

        // Parse support_materials if it's a string (from FormData)
        let parsedSupportMaterials = [];
        if (support_materials) {
            try {
                parsedSupportMaterials = typeof support_materials === 'string' 
                    ? JSON.parse(support_materials) 
                    : support_materials;
            } catch (parseError) {
                console.error('Error parsing support_materials:', parseError);
                return res.status(400).json({
                    error: 'Invalid support materials format',
                    message: 'Support materials must be valid JSON'
                });
            }
        }

        // Process support materials with file uploads
        const processedMaterials = await processSupportMaterials(parsedSupportMaterials, req.files);

        // Parse other array fields if they're strings
        const parsedTags = tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [];
        const parsedTopics = lesson_topics ? (typeof lesson_topics === 'string' ? JSON.parse(lesson_topics) : lesson_topics) : [];
        const parsedKeyPoints = key_points ? (typeof key_points === 'string' ? JSON.parse(key_points) : key_points) : [];

        // Create lesson
        const { data: lesson, error } = await supabaseAdmin
            .from('lessons')
            .insert({
                title,
                description,
                vimeo_video_id,
                video_duration,
                thumbnail_url,
                category,
                tags: parsedTags,
                lesson_topics: parsedTopics,
                key_points: parsedKeyPoints,
                scheduled_date: scheduled_date || null,
                is_published,
                support_materials: processedMaterials
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating lesson:', error);
            return res.status(500).json({
                error: 'Failed to create lesson',
                message: 'An error occurred while creating the lesson'
            });
        }

        res.status(201).json({
            message: 'Lesson created successfully',
            lesson
        });

    } catch (error) {
        console.error('Error in create lesson route:', error);
        
        // Handle multer errors
        if (error.message === 'Only PDF files are allowed for support materials') {
            return res.status(400).json({
                error: 'Invalid file type',
                message: 'Only PDF files are allowed for support materials'
            });
        }

        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while processing your request'
        });
    }
});

/**
 * @route   PUT /api/lessons/:id
 * @desc    Update lesson (admin)
 * @access  Private (Admin)
 */
router.put('/:id', authenticateToken, requireAdmin, upload.array('support_files', 10), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            description,
            vimeo_video_id,
            video_duration,
            thumbnail_url,
            category,
            tags,
            lesson_topics,
            key_points,
            support_materials,
            scheduled_date,
            is_published
        } = req.body;

        // Check if lesson exists
        const { data: existingLesson, error: fetchError } = await supabaseAdmin
            .from('lessons')
            .select('id')
            .eq('id', id)
            .single();

        if (fetchError || !existingLesson) {
            return res.status(404).json({
                error: 'Lesson not found',
                message: 'The lesson you are trying to update does not exist'
            });
        }

        // Process support materials if provided
        let processedMaterials = undefined;
        if (support_materials !== undefined) {
            try {
                const parsedSupportMaterials = typeof support_materials === 'string' 
                    ? JSON.parse(support_materials) 
                    : support_materials;
                processedMaterials = await processSupportMaterials(parsedSupportMaterials, req.files);
            } catch (parseError) {
                console.error('Error parsing support_materials:', parseError);
                return res.status(400).json({
                    error: 'Invalid support materials format',
                    message: 'Support materials must be valid JSON'
                });
            }
        }

        // Parse array fields if they're strings (from FormData)
        const parsedTags = tags !== undefined ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : undefined;
        const parsedTopics = lesson_topics !== undefined ? (typeof lesson_topics === 'string' ? JSON.parse(lesson_topics) : lesson_topics) : undefined;
        const parsedKeyPoints = key_points !== undefined ? (typeof key_points === 'string' ? JSON.parse(key_points) : key_points) : undefined;

        // Prepare update data (only include fields that are provided)
        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (vimeo_video_id !== undefined) updateData.vimeo_video_id = vimeo_video_id;
        if (video_duration !== undefined) updateData.video_duration = video_duration;
        if (thumbnail_url !== undefined) updateData.thumbnail_url = thumbnail_url;
        if (category !== undefined) updateData.category = category;
        if (parsedTags !== undefined) updateData.tags = parsedTags;
        if (parsedTopics !== undefined) updateData.lesson_topics = parsedTopics;
        if (parsedKeyPoints !== undefined) updateData.key_points = parsedKeyPoints;
        if (processedMaterials !== undefined) updateData.support_materials = processedMaterials;
        if (scheduled_date !== undefined) updateData.scheduled_date = scheduled_date || null;
        if (is_published !== undefined) updateData.is_published = is_published;
        
        // Always update the updated_at timestamp
        updateData.updated_at = new Date().toISOString();

        // Update lesson
        const { data: lesson, error } = await supabaseAdmin
            .from('lessons')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating lesson:', error);
            return res.status(500).json({
                error: 'Failed to update lesson',
                message: 'An error occurred while updating the lesson'
            });
        }

        res.status(200).json({
            message: 'Lesson updated successfully',
            lesson
        });

    } catch (error) {
        console.error('Error in update lesson route:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while processing your request'
        });
    }
});

/**
 * @route   POST /api/lessons/:id/materials
 * @desc    Upload support materials (admin)
 * @access  Private (Admin)
 */
/**
 * @route   GET /api/lessons/:id/materials/:materialId/view
 * @desc    Get signed URL for protected PDF viewing
 * @access  Private
 */
router.get('/:id/materials/:materialId/view', authenticateToken, async (req, res) => {
    try {
        const { id: lessonId, materialId } = req.params;
        const userId = req.user.id;

        // Verify lesson exists and user has access
        const { data: lesson, error: lessonError } = await supabaseAdmin
            .from('lessons')
            .select('support_materials, is_published')
            .eq('id', lessonId)
            .single();

        if (lessonError || !lesson) {
            return res.status(404).json({
                error: 'Lesson not found',
                message: 'The requested lesson does not exist'
            });
        }

        // Check if lesson is published (or user is admin)
        if (!lesson.is_published && req.user.role !== 'admin') {
            return res.status(403).json({
                error: 'Access denied',
                message: 'This lesson is not yet published'
            });
        }

        // Find the specific material
        const supportMaterials = lesson.support_materials || [];
        const material = supportMaterials.find(m => m.id === materialId);

        if (!material) {
            return res.status(404).json({
                error: 'Material not found',
                message: 'The requested support material does not exist'
            });
        }

        // Only handle file materials (PDFs)
        if (material.type !== 'file') {
            return res.status(400).json({
                error: 'Invalid material type',
                message: 'This endpoint only handles file materials'
            });
        }

        // Generate signed URL for 2 hours access
        const expiresInHours = 2;
        const expiresAt = Math.floor(Date.now() / 1000) + (60 * 60 * expiresInHours);
        
        try {
            const signedUrl = generateSignedUrl(material.cloudinaryPublicId, { 
                expires_at: expiresAt,
                resource_type: 'raw'
            });

            // Log access for security auditing
            console.log(`📄 PDF access granted: User ${userId} accessing material ${materialId} from lesson ${lessonId}`);

            res.json({
                success: true,
                data: {
                    materialId,
                    materialName: material.name,
                    fileName: material.fileName,
                    signedUrl,
                    expiresAt: new Date(expiresAt * 1000).toISOString(),
                    expiresInMinutes: expiresInHours * 60
                }
            });

        } catch (cloudinaryError) {
            console.error('Error generating signed URL:', cloudinaryError);
            return res.status(500).json({
                error: 'Failed to generate access URL',
                message: 'Unable to generate secure access to the file'
            });
        }

    } catch (error) {
        console.error('Error in PDF view endpoint:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while processing your request'
        });
    }
});

/**
 * @route   GET /api/lessons/:id/materials/:materialId/stream
 * @desc    Stream PDF file with authentication (proxy through backend)
 * @access  Private
 */
router.get('/:id/materials/:materialId/stream', async (req, res) => {
    try {
        const { id: lessonId, materialId } = req.params;
        
        // Manual authentication - check for token in header or query param
        let token = req.headers.authorization?.replace('Bearer ', '');
        if (!token && req.query.token) {
            token = req.query.token;
        }
        
        if (!token) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'No token provided'
            });
        }
        
        // Verify token manually (similar to authenticateToken middleware)
        let userId;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userId = decoded.id;
        } catch (tokenError) {
            console.error('Token verification failed:', tokenError);
            return res.status(401).json({
                error: 'Invalid token',
                message: 'Authentication failed'
            });
        }

        // Verify lesson exists and user has access
        const { data: lesson, error: lessonError } = await supabaseAdmin
            .from('lessons')
            .select('support_materials, is_published')
            .eq('id', lessonId)
            .single();

        if (lessonError || !lesson) {
            return res.status(404).json({
                error: 'Lesson not found',
                message: 'The requested lesson does not exist'
            });
        }

        // Check if lesson is published (or user is admin)
        if (!lesson.is_published && req.user.role !== 'admin') {
            return res.status(403).json({
                error: 'Access denied',
                message: 'This lesson is not yet published'
            });
        }

        // Find the specific material
        const supportMaterials = lesson.support_materials || [];
        const material = supportMaterials.find(m => m.id === materialId);

        if (!material || material.type !== 'file') {
            return res.status(404).json({
                error: 'Material not found',
                message: 'The requested PDF file does not exist'
            });
        }

        // Generate signed URL for immediate access
        const signedUrl = generateSignedUrl(material.cloudinaryPublicId, { 
            expires_at: Math.floor(Date.now() / 1000) + (60 * 5), // 5 minutes
            resource_type: 'raw'
        });

        try {
            // Stream the PDF through our backend
            const response = await axios({
                method: 'GET',
                url: signedUrl,
                responseType: 'stream',
                timeout: 30000 // 30 seconds timeout
            });

            // Set appropriate headers for PDF viewing
            res.setHeader('Content-Type', 'application/pdf');
            
            // Properly encode Hebrew filename for Content-Disposition header
            const encodedFilename = encodeURIComponent(material.fileName);
            res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedFilename}`);
            
            res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            
            // Security headers to prevent downloading/copying
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            // Remove X-Frame-Options to allow iframe embedding

            // Pipe the PDF data through our backend
            response.data.pipe(res);

        } catch (streamError) {
            console.error('Error streaming PDF:', streamError);
            return res.status(500).json({
                error: 'Failed to stream file',
                message: 'Unable to load the PDF file'
            });
        }

    } catch (error) {
        console.error('Error in PDF stream endpoint:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while processing your request'
        });
    }
});

/**
 * @route   GET /api/lessons/:id/materials
 * @desc    Get all support materials for a lesson (with access URLs)
 * @access  Private
 */
router.get('/:id/materials', authenticateToken, async (req, res) => {
    try {
        const { id: lessonId } = req.params;
        const userId = req.user.id;

        // Verify lesson exists and user has access
        const { data: lesson, error: lessonError } = await supabaseAdmin
            .from('lessons')
            .select('support_materials, is_published, title')
            .eq('id', lessonId)
            .single();

        if (lessonError || !lesson) {
            return res.status(404).json({
                error: 'Lesson not found',
                message: 'The requested lesson does not exist'
            });
        }

        // Check if lesson is published (or user is admin)
        if (!lesson.is_published && req.user.role !== 'admin') {
            return res.status(403).json({
                error: 'Access denied',
                message: 'This lesson is not yet published'
            });
        }

        const supportMaterials = lesson.support_materials || [];
        
        // Process materials and add access URLs
        const materialsWithAccess = supportMaterials.map(material => {
            if (material.type === 'link') {
                return {
                    ...material,
                    accessUrl: material.url,
                    accessType: 'direct'
                };
            } else if (material.type === 'file') {
                return {
                    ...material,
                    accessUrl: `/api/lessons/${lessonId}/materials/${material.id}/stream`,
                    viewUrl: `/api/lessons/${lessonId}/materials/${material.id}/view`,
                    accessType: 'protected'
                };
            }
            return material;
        });

        res.json({
            success: true,
            data: {
                lessonId,
                lessonTitle: lesson.title,
                materials: materialsWithAccess,
                totalCount: materialsWithAccess.length
            }
        });

    } catch (error) {
        console.error('Error fetching lesson materials:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while fetching materials'
        });
    }
});

export default router;
