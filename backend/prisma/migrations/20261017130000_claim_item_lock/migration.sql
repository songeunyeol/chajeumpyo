-- 물건별 확인 실패 합계 잠금 (#29)
ALTER TABLE "found_item" ADD COLUMN "claim_locked_at" TIMESTAMP(3);
ALTER TYPE "NotificationType" ADD VALUE 'CLAIM_LOCKED' BEFORE 'SYSTEM';
