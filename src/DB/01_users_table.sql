-- Create Users Table with Enhanced Progress Tracking
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
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


