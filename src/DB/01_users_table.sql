-- Create Users Table with Enhanced Progress Tracking
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('learner', 'manager', 'support', 'admin')),
    company VARCHAR(255),
    team VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    
    -- Profile & Settings
    avatar_url TEXT,
    notification_time TIME DEFAULT '09:00:00',
    notification_enabled BOOLEAN DEFAULT true,
    timezone VARCHAR(50) DEFAULT 'Asia/Jerusalem',
    
    -- Progress & Gamification (JSONB for flexibility)
    lesson_progress JSONB DEFAULT '{}', -- Detailed progress per lesson
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_activity_date DATE,
    total_lessons_completed INTEGER DEFAULT 0,
    badges_earned TEXT[] DEFAULT '{}', -- Array of badge names/IDs
    
    -- User Preferences (program access & chat terms)
    preferences JSONB DEFAULT '{
        "program_type": "full_access",
        "chat_terms_accepted": false,
        "chat_terms_accepted_date": null
    }'::jsonb,
    
    -- Timestamps
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_company ON users(company);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_preferences_program_type ON users USING GIN ((preferences->>'program_type'));
CREATE INDEX idx_users_preferences_chat_terms ON users USING GIN ((preferences->>'chat_terms_accepted'));

-- Insert sample users with different roles
INSERT INTO users (email, first_name, last_name, role, company, team, phone) VALUES
-- Admin user
('admin@xfactor.co.il', 'אדמין', 'ראשי', 'admin', 'XFactor Daily', 'ניהול', '+972501234567'),

-- Manager users
('manager1@company1.co.il', 'יוסי', 'כהן', 'manager', 'חברת בנייה א', 'ניהול פרויקטים', '+972502345678'),
('manager2@company2.co.il', 'רחל', 'לוי', 'manager', 'חברת בנייה ב', 'בקרת איכות', '+972503456789'),

-- Support user
('support@xfactor.co.il', 'תמיכה', 'טכנית', 'support', 'XFactor Daily', 'תמיכה', '+972504567890'),

-- Learner users
('learner1@company1.co.il', 'משה', 'אברהם', 'learner', 'חברת בנייה א', 'מהנדסים', '+972505678901'),
('learner2@company1.co.il', 'שרה', 'יעקב', 'learner', 'חברת בנייה א', 'מפקחים', '+972506789012'),
('learner3@company2.co.il', 'דוד', 'שמואל', 'learner', 'חברת בנייה ב', 'מהנדסים', '+972507890123'),
('learner4@company2.co.il', 'מרים', 'רבקה', 'learner', 'חברת בנייה ב', 'בודקי דירות', '+972508901234'),
('learner5@company1.co.il', 'אברהם', 'יצחק', 'learner', 'חברת בנייה א', 'אנשי שטח', '+972509012345');

-- Update some users with sample progress data
UPDATE users SET 
    lesson_progress = '{
        "lesson-1": {
            "status": "completed",
            "started_at": "2024-01-15T10:30:00Z",
            "completed_at": "2024-01-15T10:45:00Z",
            "last_watched_position": 450,
            "total_watch_time": 600,
            "completion_percentage": 100,
            "rating": 5,
            "feedback": "שיעור מעולה!"
        },
        "lesson-2": {
            "status": "in_progress",
            "started_at": "2024-01-16T09:00:00Z",
            "last_watched_position": 180,
            "total_watch_time": 180,
            "completion_percentage": 30
        }
    }',
    current_streak = 3,
    longest_streak = 7,
    total_lessons_completed = 1,
    last_activity_date = CURRENT_DATE
WHERE email = 'learner1@company1.co.il';

UPDATE users SET 
    lesson_progress = '{
        "lesson-1": {
            "status": "completed",
            "started_at": "2024-01-14T14:00:00Z",
            "completed_at": "2024-01-14T14:12:00Z",
            "last_watched_position": 720,
            "total_watch_time": 720,
            "completion_percentage": 100,
            "rating": 4
        }
    }',
    current_streak = 1,
    longest_streak = 5,
    total_lessons_completed = 1,
    last_activity_date = CURRENT_DATE - INTERVAL '1 day',
    preferences = '{
        "program_type": "daily_video",
        "chat_terms_accepted": true,
        "chat_terms_accepted_date": "2024-01-10T10:00:00Z"
    }'::jsonb
WHERE email = 'learner2@company1.co.il';
