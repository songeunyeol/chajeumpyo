-- 동의 기록 (QA B15, open-issues #35)
ALTER TABLE "user" ADD COLUMN "consent_version" TEXT;
ALTER TABLE "user" ADD COLUMN "consented_at" TIMESTAMP(3);
ALTER TABLE "user" ADD COLUMN "location_consent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "found_item" ADD COLUMN "consent_version" TEXT;
ALTER TABLE "found_item" ADD COLUMN "location_consent" BOOLEAN NOT NULL DEFAULT false;
