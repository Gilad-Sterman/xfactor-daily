import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Configure dotenv first
dotenv.config();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

// Client for regular operations (with RLS)
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: false // Server-side, we don't persist sessions
    }
});

// Admin client for operations that bypass RLS
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// Helper function to get user from JWT token
const getUserFromToken = async (token) => {
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error) throw error;
        return user;
    } catch (error) {
        console.error('Error getting user from token:', error);
        return null;
    }
};

// Helper function to set auth context for RLS
const setAuthContext = async (userId) => {
    try {
        // Set the auth context for RLS policies
        const { error } = await supabase.auth.admin.getUserById(userId);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error setting auth context:', error);
        return false;
    }
};

export {
    supabase,
    supabaseAdmin,
    getUserFromToken,
    setAuthContext
};
