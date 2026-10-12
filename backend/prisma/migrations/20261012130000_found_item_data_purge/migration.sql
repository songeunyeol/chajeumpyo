-- 수령·기한 만료 시 사진과 비공개 정보 삭제 (open-issues #33, QA B13)
ALTER TABLE "found_item" ADD COLUMN "data_purged_at" TIMESTAMP(3);
ALTER TABLE "found_item_detail" ALTER COLUMN "image_original_key" DROP NOT NULL;
ALTER TABLE "found_item_detail" ALTER COLUMN "image_public_key" DROP NOT NULL;
