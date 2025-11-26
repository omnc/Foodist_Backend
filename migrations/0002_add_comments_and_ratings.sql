-- Migration: Add Comment table with ratings
-- Created: 2025-11-23

-- CreateTable: Comment
CREATE TABLE "Comment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userID" INTEGER NOT NULL,
    "recipeID" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Comment_userID_fkey" FOREIGN KEY ("userID") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Comment_recipeID_fkey" FOREIGN KEY ("recipeID") REFERENCES "Recipe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex: Index on recipeID for faster comment queries
CREATE INDEX "Comment_recipeID_idx" ON "Comment"("recipeID");

-- CreateIndex: Index on userID for faster user comment queries
CREATE INDEX "Comment_userID_idx" ON "Comment"("userID");
