-- 두 단계 등록(analyze → confirm), 자세한 위치 설명, 맡긴 물건의 주운 건물 선택 사항화

-- 확정 전(ANALYZING)에는 보관 방식과 건물을 아직 모른다
ALTER TABLE "found_item" ALTER COLUMN "storage_type" DROP NOT NULL;
-- 보관처에 맡긴 물건은 주운 건물을 몰라도 된다. 그 자리에 둔 물건은 건물이 있어야 찾으러 갈 수 있다
ALTER TABLE "found_item" ALTER COLUMN "building_id" DROP NOT NULL;
ALTER TABLE "found_item" ADD CONSTRAINT "found_item_in_place_building_check"
  CHECK ("storage_type" IS DISTINCT FROM 'IN_PLACE' OR "building_id" IS NOT NULL);

ALTER TABLE "found_item" ADD COLUMN "confirm_token_hash" TEXT;
ALTER TABLE "found_item_detail" ADD COLUMN "location_detail" TEXT;
