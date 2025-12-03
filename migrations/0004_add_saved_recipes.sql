-- Migration: Add SavedRecipe join table for users to save recipes
-- Created: 2025-11-28

-- CreateTable: SavedRecipe
CREATE TABLE "SavedRecipe" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userID" INTEGER NOT NULL,
    "recipeID" INTEGER NOT NULL,
    "savedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "SavedRecipe_userID_fkey" FOREIGN KEY ("userID") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SavedRecipe_recipeID_fkey" FOREIGN KEY ("recipeID") REFERENCES "Recipe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex: Prevent duplicate saves (user can't save same recipe twice)
CREATE UNIQUE INDEX "SavedRecipe_userID_recipeID_key" ON "SavedRecipe"("userID", "recipeID");

