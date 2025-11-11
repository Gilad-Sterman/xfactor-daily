# Row Level Security (RLS) Summary
## XFactor Daily Database Security Policies

### 🔐 Security Overview

All tables now have Row Level Security enabled with role-based access control:

---

## 👥 **Users Table Security**

### **Learners:**
- ✅ Can view their own profile
- ✅ Can update their own profile (except role/company)
- ❌ Cannot view other users
- ❌ Cannot change their role or company

### **Managers:**
- ✅ Can view all users from their company
- ✅ Can view their own profile
- ✅ Can update their own profile
- ❌ Cannot view users from other companies
- ❌ Cannot create or delete users

### **Support:**
- ✅ Can view their own profile
- ✅ Can update their own profile
- ❌ Cannot view other users (unless admin)

### **Admins:**
- ✅ Can view all users
- ✅ Can create new users
- ✅ Can update any user
- ✅ Can delete users
- ✅ Full access to user management

---

## 📚 **Lessons Table Security**

### **All Authenticated Users:**
- ✅ Can view published lessons only
- ❌ Cannot view unpublished lessons
- ❌ Cannot create, update, or delete lessons

### **Admins:**
- ✅ Can view all lessons (published and unpublished)
- ✅ Can create new lessons
- ✅ Can update existing lessons
- ✅ Can delete lessons
- ✅ Full lesson management access

---

## 🎫 **Support Tickets Security**

### **Learners:**
- ✅ Can view their own tickets
- ✅ Can create new tickets
- ✅ Can update their own tickets (add messages)
- ❌ Cannot view other users' tickets

### **Managers:**
- ✅ Can view tickets from users in their company
- ✅ Can view their own tickets
- ✅ Can create and update their own tickets
- ❌ Cannot view tickets from other companies

### **Support Staff:**
- ✅ Can view all tickets
- ✅ Can update all tickets
- ✅ Can respond to any ticket
- ❌ Cannot delete tickets (for audit trail)

### **Admins:**
- ✅ Full access to all tickets
- ✅ Can view, update, and manage all tickets

---

## ⚙️ **System Settings Security**

### **All Authenticated Users:**
- ✅ Can view public settings only:
  - `app_name`, `app_version`
  - `daily_notification_time`
  - `available_badges`
  - `support_categories`
  - `allowed_file_types`, `max_file_size_mb`
- ❌ Cannot view sensitive settings
- ❌ Cannot modify any settings

### **Admins:**
- ✅ Can view all settings (including sensitive ones)
- ✅ Can update all settings
- ✅ Can create new settings
- ✅ Full system configuration access

---

## 🛡️ **Additional Security Features**

### **Helper Functions:**
- `get_current_user_role()` - Returns current user's role
- `is_admin()` - Checks if current user is admin
- `is_manager()` - Checks if current user is manager
- `get_user_company()` - Returns current user's company

### **Security Measures:**
- Users cannot delete their own accounts
- Support tickets cannot be deleted (audit trail)
- Users cannot change their own role or company
- Company isolation for managers
- Sensitive settings are admin-only

---

## 🚀 **How to Apply**

1. **Run the RLS script:**
   ```sql
   -- Copy and paste 05_row_level_security.sql into Supabase SQL Editor
   ```

2. **Verify RLS is enabled:**
   ```sql
   SELECT schemaname, tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public' 
   AND rowsecurity = true;
   ```

3. **Test with different user roles:**
   - Login as different users and verify access
   - Ensure users can only see their authorized data

---

## ⚠️ **Important Notes**

- **Authentication Required:** All policies require `auth.uid()` to be set
- **Company Isolation:** Managers can only access their company's data  
- **Audit Trail:** Support tickets cannot be deleted for compliance
- **Role Immutability:** Users cannot change their own roles
- **Public Settings:** Only safe settings are visible to all users

This security model ensures proper data isolation while allowing necessary collaboration within companies and appropriate administrative access.
