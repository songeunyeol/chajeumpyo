-- DropIndex
DROP INDEX "reveal_log_match_attempt_id_key";

-- CreateIndex
CREATE INDEX "reveal_log_user_id_found_item_id_idx" ON "reveal_log"("user_id", "found_item_id");
