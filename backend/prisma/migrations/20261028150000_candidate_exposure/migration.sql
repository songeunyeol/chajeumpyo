-- 신고별로 보여 준 후보 기록. 새 습득물 때문에 상위 3개에서 밀려난 물건에도 판정을 요청할 수 있게 한다
CREATE TABLE "candidate_exposure" (
    "lost_report_id" UUID NOT NULL,
    "found_item_id" UUID NOT NULL,
    "first_shown_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_exposure_pkey" PRIMARY KEY ("lost_report_id","found_item_id")
);

CREATE INDEX "candidate_exposure_found_item_id_idx" ON "candidate_exposure"("found_item_id");

ALTER TABLE "candidate_exposure" ADD CONSTRAINT "candidate_exposure_lost_report_id_fkey" FOREIGN KEY ("lost_report_id") REFERENCES "lost_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "candidate_exposure" ADD CONSTRAINT "candidate_exposure_found_item_id_fkey" FOREIGN KEY ("found_item_id") REFERENCES "found_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
