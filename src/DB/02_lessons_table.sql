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

