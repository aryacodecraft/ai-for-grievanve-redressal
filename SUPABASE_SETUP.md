# Supabase Integration Setup Guide

## Overview
Your Grievance Redressal Portal is now fully integrated with **Supabase Authentication** and **Database**. This eliminates the need for a custom backend API - everything works directly with Supabase!

## What's Configured

✅ **Supabase Authentication** - Email/password login
✅ **Database Tables** - profiles, grievances
✅ **Row Level Security (RLS)** - Secure data access
✅ **Frontend Integration** - All pages updated to use Supabase

---

## How to Test the Application

### Step 1: Create Your First Account

1. Go to http://localhost:3000/register
2. Fill in the registration form:
   - **Full Name:** Your name
   - **Email:** your-email@example.com
   - **Mobile:** 10-digit number
   - **Password:** At least 6 characters
3. Click "Create Account"
4. You'll be redirected to login

### Step 2: Login as Citizen

1. Go to http://localhost:3000/login
2. Use the email and password you just created
3. You'll be taken to your user dashboard

### Step 3: Test Citizen Features

Once logged in, you can:
- **View Dashboard** - See your statistics
- **Submit Grievance** - Click "New Grievance" to submit a complaint
- **View Grievances** - See all your submitted grievances
- **Track Status** - See the status of each grievance (pending, in-progress, resolved)
- **Update Profile** - Edit your personal information

---

## How to Test Admin Features

### Creating an Admin Account

To test admin features, you need to promote a user to admin role:

**Option 1: Using Supabase Dashboard (Recommended)**

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **SQL Editor**
4. Run this query:
   ```sql
   UPDATE profiles
   SET role = 'admin'
   WHERE email = 'your-email@example.com';
   ```
5. Replace `your-email@example.com` with the email you used to register

**Option 2: Using Supabase Data Editor**

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Go to **Data Editor** → **profiles**
3. Find your user record
4. Change the `role` column from `citizen` to `admin`
5. Click Save

### Step 4: Login as Admin

1. Go to http://localhost:3000/admin/login
2. Use your email and password (same as citizen account)
3. You'll be taken to the admin dashboard

### Step 5: Test Admin Features

Once logged in as admin, you can:
- **Admin Dashboard** - View system-wide statistics
- **All Grievances** - See grievances from all citizens
- **Update Status** - Click "Update" to change grievance status
- **User Management** - View all registered users
- **Filter & Search** - Filter by status or search by ID/subject

---

## Database Structure

### profiles table
Stores user information:
- `id` - User ID (from Supabase Auth)
- `name` - Full name
- `email` - Email address
- `phone` - Phone number
- `address` - User address
- `role` - Either `citizen` or `admin`
- `created_at` - Account creation date

### grievances table
Stores all grievances:
- `id` - Grievance ID
- `user_id` - Submitted by user
- `category` - Type of grievance
- `subject` - Title
- `description` - Detailed description
- `department` - Responsible department
- `priority` - low, medium, or high
- `status` - pending, in-progress, resolved, rejected
- `remarks` - Admin remarks
- `created_at` - Submission date
- `updated_at` - Last update date

---

## Supabase Configuration

Your environment variables are already configured:
```
VITE_SUPABASE_URL=https://0ec90b57d6e95fcbda19832f.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

These allow the frontend to connect to your Supabase project.

---

## Testing Workflow

### Complete Citizen Workflow

1. **Register** → Create account at `/register`
2. **Login** → Access portal at `/login`
3. **Submit Grievance** → Go to user dashboard → Click "New Grievance"
4. **View Grievances** → Go to "My Grievances"
5. **Track Status** → See grievance details and current status
6. **Update Profile** → Go to Profile page to update info
7. **Logout** → Click Logout button

### Complete Admin Workflow

1. **Promote to Admin** → Use dashboard query above
2. **Admin Login** → Access portal at `/admin/login`
3. **View Dashboard** → See system statistics
4. **Manage Grievances** → Go to "All Grievances"
5. **Update Status** → Click "Update" on any grievance
6. **View Users** → Go to "User Management"
7. **Logout** → Click Logout button

---

## Sample Test Data

After creating accounts and submitting grievances, you'll have data to work with:

**Test Grievance Categories:**
- Public Services
- Healthcare
- Education
- Transportation
- Water Supply
- Electricity
- Sanitation
- Police
- Municipal Services

**Test Grievance Status:**
- pending (default)
- in-progress
- resolved
- rejected

---

## Troubleshooting

### "Registration failed" Error
- Check if email already exists
- Verify password is at least 6 characters
- Check browser console for detailed error

### "Invalid email or password" on Login
- Double-check email and password spelling
- Make sure you've confirmed email (if required in Supabase)
- Verify user exists in Supabase Auth

### Can't access admin features
- Confirm you've updated `role` to `admin` in profiles table
- Logout and login again
- Clear browser cache

### Grievances not showing
- Make sure you're logged in
- Check Supabase RLS policies are enabled
- Verify grievances table has data

---

## Development Commands

### Start development server
```bash
npm run dev
```
Access at: http://localhost:3000

### Build for production
```bash
npm run build
```

### View production build
```bash
npm run preview
```

---

## Important Notes

1. **Email Confirmation:** By default, Supabase may require email verification. You can disable this in Supabase settings if testing locally.

2. **RLS Policies:** All tables have Row Level Security enabled. Users can only see their own data unless they're admins.

3. **Password Reset:** Password reset functionality needs email setup. For testing, manually reset in Supabase Auth settings.

4. **Session Storage:** Sessions are managed by Supabase Auth. Closing the browser will require re-login.

5. **Production Deployment:** When deploying to production:
   - Update Supabase URL and keys for production instance
   - Enable email verification
   - Configure CORS for your domain
   - Set up proper password reset email

---

## Next Steps

1. ✅ Register as a citizen
2. ✅ Submit a sample grievance
3. ✅ Promote yourself to admin
4. ✅ Login as admin and manage grievances
5. ✅ Test all features

Then you're ready to deploy!

---

## Support

For issues with:
- **Frontend**: Check browser console for errors
- **Supabase**: Visit [Supabase Docs](https://supabase.com/docs)
- **Database**: Use Supabase Dashboard → SQL Editor to debug queries

Enjoy your working Grievance Redressal System! 🎉
