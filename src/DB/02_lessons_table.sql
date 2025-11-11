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

-- Add some sample support materials to lessons
UPDATE lessons SET 
    support_materials = '[
        {
            "name": "מדריך בדיקת רטיבות.pdf",
            "url": "/uploads/moisture-guide.pdf",
            "type": "pdf",
            "size": 1024000,
            "uploaded_at": "2024-01-15T10:00:00Z"
        },
        {
            "name": "טבלת ערכי רטיבות.xlsx",
            "url": "/uploads/moisture-values.xlsx",
            "type": "xlsx",
            "size": 512000,
            "uploaded_at": "2024-01-15T10:05:00Z"
        }
    ]'::jsonb
WHERE title = 'שיעור 1: רטיבות מצע הריצוף';

UPDATE lessons SET 
    support_materials = '[
        {
            "name": "תקן ספי מעבר.pdf",
            "url": "/uploads/threshold-standard.pdf",
            "type": "pdf",
            "size": 2048000,
            "uploaded_at": "2024-01-15T11:00:00Z"
        }
    ]'::jsonb
WHERE title = 'שיעור 2: ספי מעבר בין אזורים בדירה';
