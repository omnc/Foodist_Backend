-- Migration: Add user profile fields (username, pfpUrl, bio)
-- Created: 2025-11-28

-- Add username column
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Add pfpUrl (profile picture URL) column
ALTER TABLE "User" ADD COLUMN "pfpUrl" TEXT;

-- Add bio column
ALTER TABLE "User" ADD COLUMN "bio" TEXT;
