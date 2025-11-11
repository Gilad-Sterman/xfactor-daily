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

-- Insert sample support tickets
INSERT INTO support_tickets (
    user_id, 
    title, 
    description, 
    status, 
    priority,
    messages,
    assigned_to
) VALUES

-- Get user IDs for sample data (assuming the users exist)
(
    (SELECT id FROM users WHERE email = 'learner1@company1.co.il'),
    'בעיה בהשמעת וידאו',
    'הוידאו לא נטען בשיעור על רטיבות מצע הריצוף',
    'open',
    'medium',
    '[
        {
            "user_id": "' || (SELECT id FROM users WHERE email = 'learner1@company1.co.il') || '",
            "message": "הוידאו לא נטען בשיעור על רטיבות מצע הריצוף. מקבל שגיאה כשאני מנסה להפעיל.",
            "timestamp": "2024-01-15T14:30:00Z",
            "attachments": [],
            "is_internal": false
        }
    ]'::jsonb,
    (SELECT id FROM users WHERE email = 'support@xfactor.co.il')
),

(
    (SELECT id FROM users WHERE email = 'learner2@company1.co.il'),
    'שאלה על תוכן השיעור',
    'שאלה לגבי דרישות התקן בספי מעבר',
    'resolved',
    'low',
    '[
        {
            "user_id": "' || (SELECT id FROM users WHERE email = 'learner2@company1.co.il') || '",
            "message": "יש לי שאלה לגבי הגובה המותר של סף בחדר רחצה. האם יש הבדל בין דירות חדשות לישנות?",
            "timestamp": "2024-01-14T10:15:00Z",
            "attachments": [],
            "is_internal": false
        },
        {
            "user_id": "' || (SELECT id FROM users WHERE email = 'support@xfactor.co.il') || '",
            "message": "שלום, התקן קובע גובה מקסימלי של 2 ס״מ לסף בחדר רחצה, ללא הבדל בין דירות חדשות לישנות. תוכל למצוא מידע נוסף בחומרי העזר של השיעור.",
            "timestamp": "2024-01-14T11:30:00Z",
            "attachments": [],
            "is_internal": false
        },
        {
            "user_id": "' || (SELECT id FROM users WHERE email = 'learner2@company1.co.il') || '",
            "message": "תודה רבה! עזר מאוד.",
            "timestamp": "2024-01-14T12:00:00Z",
            "attachments": [],
            "is_internal": false
        }
    ]'::jsonb,
    (SELECT id FROM users WHERE email = 'support@xfactor.co.il')
),

(
    (SELECT id FROM users WHERE email = 'learner3@company2.co.il'),
    'בקשה לחומר נוסף',
    'האם יש חומרי עזר נוספים על בדיקת מישקים?',
    'in_progress',
    'low',
    '[
        {
            "user_id": "' || (SELECT id FROM users WHERE email = 'learner3@company2.co.il') || '",
            "message": "שלום, האם יש חומרי עזר נוספים על בדיקת רוחב מישקים? אשמח לקבל דוגמאות מעשיות.",
            "timestamp": "2024-01-16T09:45:00Z",
            "attachments": [],
            "is_internal": false
        },
        {
            "user_id": "' || (SELECT id FROM users WHERE email = 'support@xfactor.co.il') || '",
            "message": "שלום, אני בודק אילו חומרים נוספים יש לנו. אחזור אליך בקרוב.",
            "timestamp": "2024-01-16T10:15:00Z",
            "attachments": [],
            "is_internal": false
        },
        {
            "user_id": "' || (SELECT id FROM users WHERE email = 'support@xfactor.co.il') || '",
            "message": "הוספתי הערה לצוות התוכן להכין חומרים נוספים",
            "timestamp": "2024-01-16T10:16:00Z",
            "attachments": [],
            "is_internal": true
        }
    ]'::jsonb,
    (SELECT id FROM users WHERE email = 'support@xfactor.co.il')
);
