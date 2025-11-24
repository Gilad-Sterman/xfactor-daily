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
    
    -- Ordering & Organization
    chapter_order INTEGER NOT NULL DEFAULT 0,
    lesson_number INTEGER NOT NULL DEFAULT 1,
    
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
CREATE INDEX idx_lessons_chapter_order ON lessons(chapter_order);
CREATE INDEX idx_lessons_lesson_number ON lessons(lesson_number);
CREATE INDEX idx_lessons_chapter_lesson ON lessons(chapter_order, lesson_number);

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
-- SAMPLE USERS
-- =============================================================================

-- Insert sample users for development/testing
-- Password for all users: "password123" (hashed with bcrypt)
INSERT INTO users (email, password_hash, first_name, last_name, role, company, team, phone) VALUES
-- Admin user
('admin@xfactor.co.il', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO.2', 'אדמין', 'ראשי', 'admin', 'XFactor Daily', 'ניהול', '+972501234567'),

-- Learner users  
('learner1@company1.co.il', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO.2', 'משה', 'אברהם', 'learner', 'חברת בנייה א', 'מהנדסים', '+972505678901'),
('learner2@company1.co.il', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO.2', 'שרה', 'יעקב', 'learner', 'חברת בנייה א', 'מפקחים', '+972506789012');

-- Success message
SELECT 'Database setup completed successfully! All tables created with sample users.' as status,
       '1 admin and 2 learners added for development/testing. Password: "password123"' as note;
