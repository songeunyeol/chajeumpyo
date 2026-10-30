-- 관리자 알림: 맡긴 물건 등록, 수령 예정 (QA 10/30 3차)
ALTER TYPE "NotificationType" ADD VALUE 'ITEM_INCOMING';
ALTER TYPE "NotificationType" ADD VALUE 'PICKUP_SCHEDULED';

-- 관리자 보관 종료: 행을 지우지 않고 이유·처리자·시각을 남긴다
CREATE TYPE "ClosedReason" AS ENUM ('DISPOSED', 'MISREGISTERED');

ALTER TABLE "found_item"
  ADD COLUMN "closed_at" TIMESTAMP(3),
  ADD COLUMN "closed_reason" "ClosedReason",
  ADD COLUMN "closed_by_id" UUID;

ALTER TABLE "found_item"
  ADD CONSTRAINT "found_item_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
