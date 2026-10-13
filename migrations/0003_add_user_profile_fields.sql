-- Migration: Add user profile fields (username, pfpUrl, bio)
-- Created: 2025-11-28

-- Add username column
-- SQLite has no ADD COLUMN IF NOT EXISTS. If these columns already exist on "User" (schema
-- changed outside wrangler), this file fails with "duplicate column name"; record it as applied
-- in d1_migrations instead of re-running it.

ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Add pfpUrl (profile picture URL) column
ALTER TABLE "User" ADD COLUMN "pfpUrl" TEXT;

-- Add bio column
ALTER TABLE "User" ADD COLUMN "bio" TEXT;
