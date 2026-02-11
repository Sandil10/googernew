# 🔧 Troubleshooting 500 Internal Server Error

## Issue
Getting "500 Internal Server Error" when trying to access the application.

## Quick Fix Steps

### Step 1: Check if Backend Server is Running ✅
The backend server is already running on port 5000 (PID: 24676).

### Step 2: Setup Database Tables
The 500 error is likely because the database tables haven't been created yet.

**Solution:**
1. Open your browser
2. Go to: `http://localhost:5000/api/setup-db`
3. You should see: `{"success":true,"message":"Database tables created successfully!"}`

### Step 3: Verify Database Connection
After setting up tables, test the health endpoint:
- Go to: `http://localhost:5000/api/health`
- Should show database status as "Connected"

### Step 4: Test Registration
Try registering a new user to verify everything works.

## Alternative: Use Test Page
I've created a test page for you:
1. Open: `f:\googer new\googer-next\backend-test.html` in your browser
2. Click "Test Health" - Should show server is running
3. Click "Setup Database" - Creates all tables
4. Click "Test Register" - Tests user registration

## Common Issues & Solutions

### Issue 1: Database Not Connected
**Error**: Database connection failed in health check
**Solution**: 
1. Make sure PostgreSQL is running
2. Check backend/.env file has correct database credentials:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=Googer
   DB_USER=postgres
   DB_PASSWORD=Admin@1234
   ```

### Issue 2: Tables Don't Exist
**Error**: relation "users" does not exist
**Solution**: Visit `http://localhost:5000/api/setup-db`

### Issue 3: Port Already in Use
**Error**: EADDRINUSE :::5000
**Solution**: 
```powershell
# Find process using port 5000
netstat -ano | findstr :5000

# Kill the process (replace PID with actual number)
taskkill /PID 24676 /F

# Restart backend
cd backend
npm start
```

### Issue 4: Frontend Can't Connect to Backend
**Error**: Failed to fetch
**Solution**:
1. Check if backend is running: `http://localhost:5000/api/health`
2. Make sure CORS is enabled (already configured in backend)
3. Verify API_URL in frontend matches backend port

## Environment Setup Checklist

### Backend (.env file)
```env
PORT=5000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=Googer
DB_USER=postgres
DB_PASSWORD=Admin@1234
JWT_SECRET=googer_secret_key_2024_change_in_production
JWT_EXPIRE=7d
```

### Frontend (.env.local file - CREATE THIS)
Create a file named `.env.local` in the root directory:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

## Step-by-Step Fresh Start

If nothing works, follow these steps:

### 1. Stop All Servers
```powershell
# Find and kill backend
netstat -ano | findstr :5000
taskkill /PID [PID_NUMBER] /F

# Stop frontend (Ctrl+C in terminal)
```

### 2. Setup Database
```powershell
# Make sure PostgreSQL is running
# Create database if it doesn't exist
psql -U postgres
CREATE DATABASE "Googer";
\q
```

### 3. Start Backend
```powershell
cd backend
npm install
npm start
```
Should see: "🚀 Server is running on port 5000"

### 4. Setup Database Tables
Open browser: `http://localhost:5000/api/setup-db`

### 5. Verify Backend
Open browser: `http://localhost:5000/api/health`
Should show: `{"success":true,"database":"Connected"}`

### 6. Start Frontend
```powershell
# In new terminal
cd f:\googer new\googer-next
npm run dev
```

### 7. Test Application
1. Go to `http://localhost:3000`
2. Try registering a new user
3. Should work without 500 errors!

## API Endpoints Reference

### Public Endpoints (No Auth Required)
- `GET /api/health` - Check server status
- `GET /api/setup-db` - Create database tables
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Protected Endpoints (Require Token)
- `GET /api/auth/profile` - Get user profile
- `GET /api/auth/wallet` - Get wallet data

## Testing with cURL

### Test Health
```powershell
curl http://localhost:5000/api/health
```

### Test Register
```powershell
curl -X POST http://localhost:5000/api/auth/register `
  -H "Content-Type: application/json" `
  -d '{\"username\":\"testuser\",\"fullName\":\"Test User\",\"email\":\"test@example.com\",\"password\":\"Test@1234\"}'
```

### Test Login
```powershell
curl -X POST http://localhost:5000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"test@example.com\",\"password\":\"Test@1234\"}'
```

## Quick Diagnosis

Run these commands to diagnose the issue:

```powershell
# 1. Check if backend is running
netstat -ano | findstr :5000

# 2. Check backend health
curl http://localhost:5000/api/health

# 3. Check if database exists
psql -U postgres -c "\l" | findstr Googer

# 4. Setup database tables
curl http://localhost:5000/api/setup-db
```

## Most Likely Solution

Based on the 500 error, the most likely issue is that **database tables haven't been created yet**.

**Quick Fix:**
1. Open browser
2. Go to: `http://localhost:5000/api/setup-db`
3. Refresh your application
4. Try registering/logging in again

This should resolve the 500 error! 🎉
