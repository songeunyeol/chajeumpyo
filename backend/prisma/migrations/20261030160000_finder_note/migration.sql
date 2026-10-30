-- 습득자가 적은 물건 설명(선택). 비공개 상세에만 두고, 수령·만료 때 다른 비공개 정보와 같이 지운다
ALTER TABLE "found_item_detail" ADD COLUMN "finder_note" TEXT;
