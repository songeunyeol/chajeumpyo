-- 습득 층 (QA 리뷰 PR #6), 후보 카드용 강한 블러본 (open-issues #29), 관리자용 제목 (#38)
ALTER TABLE "found_item" ADD COLUMN "floor" INTEGER;
ALTER TABLE "found_item_detail" ADD COLUMN "image_thumb_key" TEXT;
ALTER TABLE "found_item_detail" ADD COLUMN "title" TEXT;
