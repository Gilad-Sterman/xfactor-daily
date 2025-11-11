-- XFactor Daily Database Setup Script
-- Run this script in Supabase SQL Editor to create all tables and sample data
-- 
-- Instructions:
-- 1. Copy and paste this entire script into Supabase SQL Editor
-- 2. Click "Run" to execute all table creations and data insertions
-- 3. Verify tables were created successfully

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. USERS TABLE
-- =============================================================================

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

-- =============================================================================
-- 2. LESSONS TABLE
-- =============================================================================

-- Create Lessons Table with Enhanced Content Support
CREATE TABLE lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    vimeo_video_id VARCHAR(100),
    video_duration INTEGER, -- in seconds
    thumbnail_url TEXT,
    category VARCHAR(100),
    tags TEXT[],
    
    -- Lesson Content (Hebrew support)
    lesson_topics TEXT[], -- נושאי השיעור - array of topics
    support_materials JSONB DEFAULT '[]', -- חומרי עזר - [{name, url, type, size}]
    key_points TEXT[],
    
    -- Scheduling
    scheduled_date DATE,
    is_published BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_lessons_category ON lessons(category);
CREATE INDEX idx_lessons_scheduled_date ON lessons(scheduled_date);
CREATE INDEX idx_lessons_is_published ON lessons(is_published);
CREATE INDEX idx_lessons_vimeo_id ON lessons(vimeo_video_id);

-- =============================================================================
-- 3. SUPPORT TICKETS TABLE
-- =============================================================================

-- Create Support Tickets Table with Messages in JSONB
CREATE TABLE support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    
    -- All messages in JSONB array
    messages JSONB DEFAULT '[]', -- [{user_id, message, timestamp, attachments, is_internal}]
    
    -- Assignment
    assigned_to UUID REFERENCES users(id),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX idx_support_tickets_assigned_to ON support_tickets(assigned_to);
CREATE INDEX idx_support_tickets_created_at ON support_tickets(created_at);

-- =============================================================================
-- 4. SYSTEM SETTINGS TABLE
-- =============================================================================

-- Create System Settings Table for App Configuration
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX idx_system_settings_key ON system_settings(key);

-- =============================================================================
-- SAMPLE DATA INSERTION
-- =============================================================================

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

-- Insert sample lessons based on provided data
INSERT INTO lessons (
    title, 
    description, 
    vimeo_video_id, 
    video_duration, 
    category, 
    lesson_topics, 
    key_points,
    scheduled_date,
    is_published,
    tags
) VALUES

-- פרק 1 – ריצוף
(
    'שיעור 1: רטיבות מצע הריצוף',
    'בשיעור זה נדבר על הנושאים הבאים: דרישות הרטיבות לפני הנחת האריחים, דרישות הרטיבות אחרי הנחת האריחים, איך בודקים את רטיבות מצע הריצוף',
    '919630593',
    720, -- estimated 12 minutes
    'ריצוף',
    ARRAY['דרישות הרטיבות לפני הנחת האריחים', 'דרישות הרטיבות אחרי הנחת האריחים', 'איך בודקים את רטיבות מצע הריצוף'],
    ARRAY['בדיקת רטיבות היא קריטית לאיכות הריצוף', 'יש לבדוק לפני ואחרי הנחת האריחים', 'שימוש בכלים מתאימים לבדיקה'],
    CURRENT_DATE,
    true,
    ARRAY['ריצוף', 'רטיבות', 'בדיקות', 'איכות']
),

(
    'שיעור 2: ספי מעבר בין אזורים בדירה',
    'בשיעור זה נדבר על הנושאים הבאים: דרישות התקן, סף כניסה לדירה, סף בחדר רחצה',
    '919630952',
    600, -- estimated 10 minutes
    'ריצוף',
    ARRAY['דרישות התקן', 'סף כניסה לדירה', 'סף בחדר רחצה'],
    ARRAY['ספי מעבר חייבים לעמוד בתקנים', 'הבדלים בין סף כניסה לסף חדר רחצה', 'חשיבות הגובה והחומר'],
    CURRENT_DATE + INTERVAL '1 day',
    true,
    ARRAY['ריצוף', 'ספי מעבר', 'תקנים', 'חדר רחצה']
),

(
    'שיעור 4: רוחב מישקים',
    'בשיעור זה נדבר על הנושאים הבאים: דרישות התקן, ביצוע הבדיקה בשטח, הבדיקות המותרות',
    '919631254',
    540, -- estimated 9 minutes
    'ריצוף',
    ARRAY['דרישות התקן', 'ביצוע הבדיקה בשטח', 'הבדיקות המותרות'],
    ARRAY['רוחב מישקים משפיע על איכות הריצוף', 'שיטות בדיקה מדויקות', 'טווח הסטיות המותרות'],
    CURRENT_DATE + INTERVAL '2 days',
    true,
    ARRAY['ריצוף', 'מישקים', 'בדיקות', 'תקנים']
),

-- פרק 2 – טיח
(
    'שיעור 13: סדקים וגימור פני הטיח',
    'בשיעור זה נלמד על זיהוי וטיפול בסדקים בטיח ועל דרישות גימור פני הטיח',
    '919972939',
    660, -- estimated 11 minutes
    'טיח',
    ARRAY['זיהוי סדקים בטיח', 'סוגי סדקים', 'דרישות גימור פני הטיח', 'שיטות תיקון'],
    ARRAY['סדקים יכולים להעיד על בעיות מבניות', 'חשיבות גימור איכותי', 'שיטות זיהוי מוקדמות'],
    CURRENT_DATE + INTERVAL '3 days',
    true,
    ARRAY['טיח', 'סדקים', 'גימור', 'איכות']
),

(
    'שיעור 14: אנכיות טיח',
    'בשיעור זה נדבר על הנושאים הבאים: דרישות התקן, אופן ביצוע הבדיקה בשטח',
    '919973196',
    480, -- estimated 8 minutes
    'טיח',
    ARRAY['דרישות התקן', 'אופן ביצוע הבדיקה בשטח'],
    ARRAY['אנכיות הטיח קריטית לאיכות הבנייה', 'שימוש בכלי מדידה מתאימים', 'טווח הסטיות המותרות'],
    CURRENT_DATE + INTERVAL '4 days',
    true,
    ARRAY['טיח', 'אנכיות', 'בדיקות', 'תקנים']
);

-- Insert default system settings
INSERT INTO system_settings (key, value, description) VALUES
('app_name', '"XFactor Daily"', 'Application name'),
('daily_notification_time', '"09:00"', 'Default time for daily lesson notifications'),
('lesson_completion_threshold', '80', 'Percentage watched to consider lesson completed'),
('streak_reset_hours', '48', 'Hours after which streak resets if no activity');

-- Success message
SELECT 'Database setup completed successfully! All tables created with sample data.' as status;
