-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "objectKey" TEXT,
ADD COLUMN     "storageProvider" TEXT NOT NULL DEFAULT 'local';
