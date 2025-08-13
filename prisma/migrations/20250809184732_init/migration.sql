-- CreateEnum
CREATE TYPE "MealTypes" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SIDEDISH', 'APPETIZER', 'DESSERT', 'DRINK', 'BREAD');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientBlock" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "items" TEXT[],

    CONSTRAINT "IngredientBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" SERIAL NOT NULL,
    "userID" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mealtype" "MealTypes" NOT NULL,
    "servingSize" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "prepTime" INTEGER NOT NULL,
    "cookTime" INTEGER NOT NULL,
    "ingredientBlockID" INTEGER NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_userID_fkey" FOREIGN KEY ("userID") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_ingredientBlockID_fkey" FOREIGN KEY ("ingredientBlockID") REFERENCES "IngredientBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
