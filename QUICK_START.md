# Quick Start Guide

## Installation & Running

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at: **http://localhost:3000**

---

## Quick Test (5 Minutes)

### 1. Create Citizen Account (1 min)
- Go to http://localhost:3000/register
- Fill in: Name, Email, Phone (10 digits), Password (6+ chars)
- Click "Create Account"

### 2. Login as Citizen (1 min)
- Go to http://localhost:3000/login
- Enter email and password
- You'll see your dashboard

### 3. Submit a Grievance (2 min)
- Click "New Grievance" button
- Fill in: Category, Department, Subject, Description
- Click "Submit Grievance"
- You'll get a tracking ID

### 4. View Grievances (1 min)
- Click "My Grievances" menu
- See your submitted grievance
- Click "View Details" to see full information

---

## Testing as Admin (Optional)

### Promote to Admin
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Click SQL Editor
4. Run:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'your-email@example.com';
   ```

### Login as Admin
- Go to http://localhost:3000/admin/login
- Use same email and password
- View all grievances and manage them

---

## Key Features

✅ User registration and login
✅ Submit grievances with categories
✅ Track grievance status
✅ User profile management
✅ Admin dashboard with statistics
✅ Admin can update grievance status
✅ View all users (admin only)
✅ Real-time data sync with Supabase

---

## What Was Fixed

The registration and login errors were happening because:
- **Before:** Frontend expected a Flask backend API that didn't exist
- **After:** Frontend now uses Supabase Authentication directly ✅

Now everything works end-to-end with Supabase!

---

## File Structure

```
src/
├── services/
│   └── supabase.js          ← All Supabase API calls
├── context/
│   └── AuthContext.jsx      ← Authentication logic
├── pages/
│   ├── user/                ← Citizen portal pages
│   └── admin/               ← Admin portal pages
└── components/
    ├── landing/             ← Public pages
    ├── user/                ← Navigation layouts
    └── admin/
```

---

## Environment Setup

The project already has Supabase configured:
- `VITE_SUPABASE_URL` - Database URL
- `VITE_SUPABASE_ANON_KEY` - Public API key

No additional setup needed!

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "Registration failed" | Check email isn't already registered, password 6+ chars |
| "Invalid credentials" | Verify email and password match exactly |
| Can't access admin | Check you've updated role to 'admin' in Supabase |
| Changes not showing | Refresh the page (Supabase syncs in real-time) |

---

## Deployment

When you're ready to deploy:

```bash
npm run build
```

This creates an optimized production build in the `dist/` folder.

Deploy to: Vercel, Netlify, GitHub Pages, or any static hosting.

For production Supabase:
1. Create a new Supabase project
2. Update `.env` with production URL and keys
3. Deploy!

---

## Deployment Platforms (Free)

- **Vercel** (recommended) - Automatic from GitHub
- **Netlify** - Easy deployment
- **GitHub Pages** - Simple static hosting

---

## Need Help?

1. Check **SUPABASE_SETUP.md** for detailed setup
2. Check **FRONTEND_README.md** for complete documentation
3. Browser console for error messages
4. Supabase Dashboard for database issues

---

## You're All Set! 🎉

Your Grievance Redressal Portal is ready to use!

- ✅ Registration works
- ✅ Login works
- ✅ Submit grievances works
- ✅ Track status works
- ✅ Admin features work
- ✅ Database is secure with RLS

Start with Step 1 above and enjoy!
