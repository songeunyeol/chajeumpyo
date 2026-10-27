-- 세부 종류 (큰 종류 24개는 그대로, 일부 종류에 한 단계 더). 값 목록은 packages/shared/src/enums.ts SUB_CATEGORIES
ALTER TABLE "found_item" ADD COLUMN "sub_category" TEXT;
