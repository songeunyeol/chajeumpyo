-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'DEMO');

-- CreateEnum
CREATE TYPE "StorageOrg" AS ENUM ('CENTER', 'GUARD');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('EARPHONE', 'CHARGER', 'UMBRELLA', 'CARD', 'WALLET', 'TUMBLER', 'PENCIL_CASE', 'LAPTOP_TABLET', 'CLOTHING_BAG', 'ETC');

-- CreateEnum
CREATE TYPE "StorageType" AS ENUM ('IN_PLACE', 'HANDED_OVER');

-- CreateEnum
CREATE TYPE "FoundStatus" AS ENUM ('ANALYZING', 'REVIEW', 'REGISTERED', 'REVEALED', 'CLAIMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MatchResult" AS ENUM ('PASS', 'BORDERLINE', 'FAIL');

-- CreateEnum
CREATE TYPE "PickupMethod" AS ENUM ('CENTER_QR', 'SELF_REPORT', 'DEMO');

-- CreateEnum
CREATE TYPE "PickupStatus" AS ENUM ('ISSUED', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_CANDIDATE', 'MULTI_REVEAL', 'SYSTEM');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "storage_place_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "building" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_place" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "building_id" INTEGER NOT NULL,
    "guide_text" TEXT NOT NULL,
    "org" "StorageOrg" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "storage_place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "found_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "building_id" INTEGER NOT NULL,
    "category" "Category",
    "category_alt" "Category",
    "storage_type" "StorageType" NOT NULL,
    "storage_place_id" INTEGER,
    "status" "FoundStatus" NOT NULL DEFAULT 'ANALYZING',
    "is_seed" BOOLEAN NOT NULL DEFAULT false,
    "uploader_fingerprint" TEXT,
    "found_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "found_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "found_item_detail" (
    "found_item_id" UUID NOT NULL,
    "image_original_key" TEXT NOT NULL,
    "image_public_key" TEXT NOT NULL,
    "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "brand" TEXT,
    "features" JSONB,
    "description" TEXT,
    "embedding" vector(1536),
    "raw_ai_response" JSONB,

    CONSTRAINT "found_item_detail_pkey" PRIMARY KEY ("found_item_id")
);

-- CreateTable
CREATE TABLE "lost_report" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "category" "Category" NOT NULL,
    "lost_from" TIMESTAMP(3) NOT NULL,
    "lost_to" TIMESTAMP(3) NOT NULL,
    "building_id" INTEGER,
    "description" TEXT NOT NULL,
    "description_hash" TEXT NOT NULL,
    "extracted_attributes" JSONB,
    "embedding" vector(1536),
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lost_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_attempt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "lost_report_id" UUID NOT NULL,
    "found_item_id" UUID NOT NULL,
    "description_hash" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "score_breakdown" JSONB NOT NULL,
    "matched_fields" JSONB NOT NULL,
    "result" "MatchResult" NOT NULL,
    "question" TEXT,
    "question_feature_key" TEXT,
    "answer_correct" BOOLEAN,
    "answered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reveal_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "found_item_id" UUID NOT NULL,
    "match_attempt_id" UUID,
    "revealed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reveal_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "found_item_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "method" "PickupMethod" NOT NULL,
    "status" "PickupStatus" NOT NULL DEFAULT 'ISSUED',
    "qr_token_hash" TEXT,
    "qr_expires_at" TIMESTAMP(3),
    "processed_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "purge_after" TIMESTAMP(3),

    CONSTRAINT "pickup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "found_item_id" UUID,
    "lost_report_id" UUID,
    "message" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "email_verification_email_idx" ON "email_verification"("email");

-- CreateIndex
CREATE UNIQUE INDEX "building_name_key" ON "building"("name");

-- CreateIndex
CREATE UNIQUE INDEX "storage_place_name_key" ON "storage_place"("name");

-- CreateIndex
CREATE INDEX "found_item_category_status_found_at_idx" ON "found_item"("category", "status", "found_at");

-- CreateIndex
CREATE INDEX "found_item_category_alt_idx" ON "found_item"("category_alt");

-- CreateIndex
CREATE INDEX "match_attempt_user_id_found_item_id_idx" ON "match_attempt"("user_id", "found_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "reveal_log_match_attempt_id_key" ON "reveal_log"("match_attempt_id");

-- CreateIndex
CREATE INDEX "reveal_log_found_item_id_idx" ON "reveal_log"("found_item_id");

-- CreateIndex
CREATE INDEX "pickup_found_item_id_idx" ON "pickup"("found_item_id");

-- CreateIndex
CREATE INDEX "pickup_user_id_status_idx" ON "pickup"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_one_completed_per_item" ON "pickup"("found_item_id") WHERE (status = 'COMPLETED' AND method <> 'DEMO');

-- CreateIndex
CREATE INDEX "notification_user_id_read_at_idx" ON "notification"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_storage_place_id_fkey" FOREIGN KEY ("storage_place_id") REFERENCES "storage_place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_place" ADD CONSTRAINT "storage_place_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "found_item" ADD CONSTRAINT "found_item_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "found_item" ADD CONSTRAINT "found_item_storage_place_id_fkey" FOREIGN KEY ("storage_place_id") REFERENCES "storage_place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "found_item_detail" ADD CONSTRAINT "found_item_detail_found_item_id_fkey" FOREIGN KEY ("found_item_id") REFERENCES "found_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lost_report" ADD CONSTRAINT "lost_report_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lost_report" ADD CONSTRAINT "lost_report_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "building"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_attempt" ADD CONSTRAINT "match_attempt_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_attempt" ADD CONSTRAINT "match_attempt_lost_report_id_fkey" FOREIGN KEY ("lost_report_id") REFERENCES "lost_report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_attempt" ADD CONSTRAINT "match_attempt_found_item_id_fkey" FOREIGN KEY ("found_item_id") REFERENCES "found_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reveal_log" ADD CONSTRAINT "reveal_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reveal_log" ADD CONSTRAINT "reveal_log_found_item_id_fkey" FOREIGN KEY ("found_item_id") REFERENCES "found_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reveal_log" ADD CONSTRAINT "reveal_log_match_attempt_id_fkey" FOREIGN KEY ("match_attempt_id") REFERENCES "match_attempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup" ADD CONSTRAINT "pickup_found_item_id_fkey" FOREIGN KEY ("found_item_id") REFERENCES "found_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup" ADD CONSTRAINT "pickup_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup" ADD CONSTRAINT "pickup_processed_by_admin_id_fkey" FOREIGN KEY ("processed_by_admin_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_found_item_id_fkey" FOREIGN KEY ("found_item_id") REFERENCES "found_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_lost_report_id_fkey" FOREIGN KEY ("lost_report_id") REFERENCES "lost_report"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── 수동 추가: Prisma 스키마로 표현할 수 없는 규칙 (02_ERD.md 4장) ──

-- 보관처에 맡긴 물건은 보관처가 필수.
ALTER TABLE "found_item" ADD CONSTRAINT "found_item_storage_place_required"
  CHECK ("storage_type" <> 'HANDED_OVER' OR "storage_place_id" IS NOT NULL);
