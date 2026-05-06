# Supabase & Vercel Database Setup Guide

## 1. Update Your Database Schema (Supabase)

Your existing `users` table needs to be updated with new columns (like `user_id`, `user_type`, etc.) to match the new code.

1.  **Open Supabase Dashboard**: Go to your project.
2.  **Go to SQL Editor**: Click on the SQL icon in the left sidebar.
3.  **New Query**: Click **+ New Query**.
4.  **Run Migration**:
    *   Open the file `backend/supabase_migration.sql` in your VS Code.
    *   Copy **ALL** the content.
    *   Paste it into the Supabase SQL Editor.
    *   Click **Run**.
    *   *Result*: This will safely add the missing columns to your existing `users` table without deleting your old data.

## 2. Connect Backend to Supabase (Vercel)

Now you need to tell your Vercel deployment where the database is.

1.  **Get Connection String**:
    *   In Supabase, go to **Settings** (gear icon) -> **Database**.
    *   Under **Connection Parameters**, find **Connection String**.
    *   Select **NodeJS** tab (or ensure it looks like `postgres://...` or `postgresql://...`).
    *   Copy the **URI**.
    *   *Note*: Use the "Transaction" mode (port 6543) if available for serverless, usually labeled "Transaction" or pooler. If not, the default (Session, port 5432) is fine for low traffic/starting out.

2.  **Add to Vercel**:
    *   Go to your Vercel Project Dashboard.
    *   Click **Settings** -> **Environment Variables**.
    *   Add a new variable:
        *   **Key**: `DATABASE_URL`
        *   **Value**: Paste the Supabase connection URI you copied.
        *   *Check*: Ensure the password inside the URL is correct (replace `[YOUR-PASSWORD]` if needed).
    *   Click **Save**.

3.  **Redeploy**:
    *   Go to **Deployments**.
    *   Redeploy your latest commit (or push a new change) for the new Environment Variable to take effect.
