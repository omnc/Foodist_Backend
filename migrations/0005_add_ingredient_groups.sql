-- Migration: Ingredient groups (headings) on recipe ingredients, plus an index for "my recipes"
-- Created: 2026-10-13
-- Additive only: existing rows become group 0 with no heading, in insertion order.

ALTER TABLE "IngredientBlockItem" ADD COLUMN "heading" TEXT;
ALTER TABLE "IngredientBlockItem" ADD COLUMN "groupIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "IngredientBlockItem" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Recipe_userID_idx" ON "Recipe"("userID");
