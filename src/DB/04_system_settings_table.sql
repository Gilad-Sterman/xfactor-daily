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

-- Insert default system settings
INSERT INTO system_settings (key, value, description) VALUES

-- App Configuration
('app_name', '"XFactor Daily"', 'Application name'),
('app_version', '"1.0.0"', 'Current application version'),
('maintenance_mode', 'false', 'Enable/disable maintenance mode'),

-- Notification Settings
('daily_notification_time', '"09:00"', 'Default time for daily lesson notifications'),
('notification_enabled', 'true', 'Global notification toggle'),
('email_notifications', 'true', 'Enable email notifications'),
('push_notifications', 'true', 'Enable push notifications'),

-- Learning Settings
('streak_reset_hours', '48', 'Hours after which streak resets if no activity'),
('lesson_completion_threshold', '80', 'Percentage watched to consider lesson completed'),
('auto_advance_lessons', 'true', 'Automatically advance to next lesson after completion'),

-- Video Settings
('vimeo_player_config', '{
    "autoplay": false,
    "controls": true,
    "responsive": true,
    "dnt": true,
    "quality": "auto"
}', 'Default Vimeo player configuration'),

-- Gamification Settings
('badges_enabled', 'true', 'Enable badge system'),
('streaks_enabled', 'true', 'Enable streak tracking'),
('available_badges', '[
    {
        "id": "first_lesson",
        "name": "השיעור הראשון",
        "description": "השלמת השיעור הראשון",
        "icon": "🎯",
        "criteria": {"lessons_completed": 1}
    },
    {
        "id": "week_streak",
        "name": "שבוע רצוף",
        "description": "7 ימים רצופים של למידה",
        "icon": "🔥",
        "criteria": {"streak_days": 7}
    },
    {
        "id": "flooring_expert",
        "name": "מומחה ריצוף",
        "description": "השלמת כל שיעורי הריצוף",
        "icon": "🏗️",
        "criteria": {"category_completed": "ריצוף"}
    },
    {
        "id": "plaster_expert",
        "name": "מומחה טיח",
        "description": "השלמת כל שיעורי הטיח",
        "icon": "🧱",
        "criteria": {"category_completed": "טיח"}
    },
    {
        "id": "perfect_score",
        "name": "ציון מושלם",
        "description": "דירוג 5 כוכבים ב-10 שיעורים",
        "icon": "⭐",
        "criteria": {"perfect_ratings": 10}
    }
]', 'Available badges configuration'),

-- Support Settings
('support_categories', '[
    "בעיות טכניות",
    "שאלות על תוכן",
    "בקשות לחומר נוסף",
    "הצעות שיפור",
    "אחר"
]', 'Available support ticket categories'),
('auto_assign_support', 'true', 'Automatically assign new tickets to support team'),

-- Analytics Settings
('analytics_enabled', 'true', 'Enable analytics tracking'),
('session_timeout_minutes', '30', 'Session timeout in minutes'),
('track_video_events', 'true', 'Track detailed video viewing events'),

-- File Upload Settings
('max_file_size_mb', '10', 'Maximum file size for uploads in MB'),
('allowed_file_types', '["pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png"]', 'Allowed file types for uploads'),
('upload_path', '"/uploads"', 'Base path for file uploads'),

-- Security Settings
('jwt_expiry_hours', '24', 'JWT token expiry time in hours'),
('otp_expiry_minutes', '10', 'OTP code expiry time in minutes'),
('max_login_attempts', '5', 'Maximum login attempts before lockout'),
('lockout_duration_minutes', '15', 'Account lockout duration in minutes'),

-- Business Settings
('company_name', '"XFactor Daily"', 'Company name'),
('support_email', '"support@xfactor.co.il"', 'Support contact email'),
('support_phone', '"+972-50-123-4567"', 'Support contact phone'),
('terms_version', '"1.0"', 'Current terms of service version'),
('privacy_version', '"1.0"', 'Current privacy policy version');
