-- Row Level Security (RLS) Policies for XFactor Daily
-- Run this script after creating the tables to enable proper security

-- =============================================================================
-- ENABLE RLS ON ALL TABLES
-- =============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- USERS TABLE POLICIES
-- =============================================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid()::text = id::text);

-- Users can update their own profile (except role and company)
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid()::text = id::text)
    WITH CHECK (
        auth.uid()::text = id::text AND
        -- Prevent users from changing their role or company
        role = (SELECT role FROM users WHERE id = auth.uid()::uuid) AND
        company = (SELECT company FROM users WHERE id = auth.uid()::uuid)
    );

-- Managers can view users from their company
CREATE POLICY "Managers can view company users" ON users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid()::uuid 
            AND role = 'manager' 
            AND company = users.company
        )
    );

-- Admins can view all users
CREATE POLICY "Admins can view all users" ON users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid()::uuid 
            AND role = 'admin'
        )
    );

-- Admins can insert new users
CREATE POLICY "Admins can create users" ON users
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid()::uuid 
            AND role = 'admin'
        )
    );

-- Admins can update any user
CREATE POLICY "Admins can update users" ON users
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid()::uuid 
            AND role = 'admin'
        )
    );

-- =============================================================================
-- LESSONS TABLE POLICIES
-- =============================================================================

-- All authenticated users can view published lessons
CREATE POLICY "Users can view published lessons" ON lessons
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND 
        is_published = true
    );

-- Admins can view all lessons (including unpublished)
CREATE POLICY "Admins can view all lessons" ON lessons
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid()::uuid 
            AND role = 'admin'
        )
    );

-- Admins can create lessons
CREATE POLICY "Admins can create lessons" ON lessons
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid()::uuid 
            AND role = 'admin'
        )
    );

-- Admins can update lessons
CREATE POLICY "Admins can update lessons" ON lessons
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid()::uuid 
            AND role = 'admin'
        )
    );

-- Admins can delete lessons
CREATE POLICY "Admins can delete lessons" ON lessons
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid()::uuid 
            AND role = 'admin'
        )
    );

-- =============================================================================
-- SUPPORT TICKETS TABLE POLICIES
-- =============================================================================

-- Users can view their own tickets
CREATE POLICY "Users can view own tickets" ON support_tickets
    FOR SELECT USING (user_id = auth.uid()::uuid);

-- Users can create their own tickets
CREATE POLICY "Users can create own tickets" ON support_tickets
    FOR INSERT WITH CHECK (user_id = auth.uid()::uuid);

-- Users can update their own tickets (add messages)
CREATE POLICY "Users can update own tickets" ON support_tickets
    FOR UPDATE USING (user_id = auth.uid()::uuid);

-- Support staff can view all tickets
CREATE POLICY "Support can view all tickets" ON support_tickets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid()::uuid 
            AND role IN ('support', 'admin')
        )
    );

-- Support staff can update all tickets
CREATE POLICY "Support can update all tickets" ON support_tickets
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid()::uuid 
            AND role IN ('support', 'admin')
        )
    );

-- Managers can view tickets from their company users
CREATE POLICY "Managers can view company tickets" ON support_tickets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users u1
            JOIN users u2 ON u2.id = support_tickets.user_id
            WHERE u1.id = auth.uid()::uuid 
            AND u1.role = 'manager'
            AND u1.company = u2.company
        )
    );

-- =============================================================================
-- SYSTEM SETTINGS TABLE POLICIES
-- =============================================================================

-- All authenticated users can view public settings
CREATE POLICY "Users can view public settings" ON system_settings
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND
        key IN (
            'app_name',
            'app_version',
            'daily_notification_time',
            'available_badges',
            'support_categories',
            'allowed_file_types',
            'max_file_size_mb'
        )
    );

-- Admins can view all settings
CREATE POLICY "Admins can view all settings" ON system_settings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid()::uuid 
            AND role = 'admin'
        )
    );

-- Admins can update settings
CREATE POLICY "Admins can update settings" ON system_settings
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid()::uuid 
            AND role = 'admin'
        )
    );

-- Admins can create new settings
CREATE POLICY "Admins can create settings" ON system_settings
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid()::uuid 
            AND role = 'admin'
        )
    );

-- =============================================================================
-- HELPER FUNCTIONS FOR AUTHENTICATION
-- =============================================================================

-- Function to get current user role (useful for application logic)
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
BEGIN
    RETURN (
        SELECT role 
        FROM users 
        WHERE id = auth.uid()::uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SELECT role = 'admin'
        FROM users 
        WHERE id = auth.uid()::uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is manager
CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SELECT role = 'manager'
        FROM users 
        WHERE id = auth.uid()::uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's company
CREATE OR REPLACE FUNCTION get_user_company()
RETURNS TEXT AS $$
BEGIN
    RETURN (
        SELECT company 
        FROM users 
        WHERE id = auth.uid()::uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- ADDITIONAL SECURITY MEASURES
-- =============================================================================

-- Prevent users from deleting their own account (only admins can)
CREATE POLICY "Only admins can delete users" ON users
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid()::uuid 
            AND role = 'admin'
        )
    );

-- Prevent deletion of support tickets (for audit trail)
-- Support tickets should be closed, not deleted

-- Create audit trigger for sensitive operations (optional)
-- This will log important changes for security auditing

-- Success message
SELECT 'Row Level Security policies created successfully!' as status,
       'All tables now have proper access controls based on user roles.' as details;
