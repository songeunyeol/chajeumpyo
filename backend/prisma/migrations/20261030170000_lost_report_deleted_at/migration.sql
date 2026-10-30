-- 신고자가 지운 신고. 확인 시도 기록(계정·물건별 실패 횟수)이 이 신고를 가리키므로 행은 남기고 설명·분석 결과·임베딩만 비운다
ALTER TABLE "lost_report" ADD COLUMN "deleted_at" TIMESTAMP(3);
