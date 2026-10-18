-- 대면 확인 수령 (#8 리뷰, #29 후속): 온라인 확인이 막힌 물건을 관리자가 신분 확인 후 수령 완료
ALTER TYPE "PickupMethod" ADD VALUE 'IN_PERSON' BEFORE 'DEMO';
ALTER TABLE "pickup" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "pickup" ADD COLUMN "verification_note" TEXT;

-- 같은 트랜잭션에서 새 enum 값을 쓸 수 없어 text로 비교한다
-- 계정 없는 수령은 대면 확인만, 대면 확인은 처리 관리자·메모 필수(메모는 기록 삭제 전까지)
ALTER TABLE "pickup" ADD CONSTRAINT "pickup_in_person_check" CHECK (
  CASE WHEN "method"::text = 'IN_PERSON'
    THEN "processed_by_admin_id" IS NOT NULL AND "verification_note" IS NOT NULL
    ELSE "user_id" IS NOT NULL AND "verification_note" IS NULL
  END
);
