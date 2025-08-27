-- AlterTable
ALTER TABLE "public"."Recipe" ADD COLUMN     "titleImage" TEXT;

-- CreateTable
CREATE TABLE "public"."DescriptionBlock" (
    "id" SERIAL NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "recipeId" INTEGER NOT NULL,

    CONSTRAINT "DescriptionBlock_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."DescriptionBlock" ADD CONSTRAINT "DescriptionBlock_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "public"."Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
