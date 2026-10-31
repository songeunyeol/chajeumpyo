-- 카메라 없는 PC에서도 수령을 끝낼 수 있게 8자리 수령 코드를 둔다 (10/31 검증 #13).
-- 원문은 저장하지 않고 HMAC만 둔다. 발급된(ISSUED) 수령 건끼리만 겹치지 않으면 된다.
-- 추가만 하는 변경: 기존 행은 NULL로 남고, 부분 인덱스라 기존 행에는 영향이 없다.
ALTER TABLE "pickup" ADD COLUMN "short_code_hash" TEXT;

CREATE UNIQUE INDEX "pickup_short_code_issued" ON "pickup"("short_code_hash") WHERE status = 'ISSUED' AND short_code_hash IS NOT NULL;
