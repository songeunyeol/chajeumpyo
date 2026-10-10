# ERD v1 (0단계)

> **초안 (draft, 회의에서 확정 전)** — 회의에서 확정되기 전의 초안입니다.

봇 초안 · 2026-10-10 · Prisma 기준 스케치

## 엔티티

### Building
- id, name (예: 본관), code, adjacent_ids[]

### FoundItem (습득물)
- id, building_id, found_at
- attrs (JSON: kind, color, shape, brand, …)
- embedding (vector)
- photo_blur_url, photo_private_ref
- status: stored | claimed | discarded
- source: campus | lost112_seed
- hidden_traits (server-only JSON, never to client)

### LostReport (분실 신고)
- id, building_id?, lost_at?
- attrs (JSON, same schema as FoundItem)
- embedding (vector)
- photo_blur_url?
- contact_handle (최소), status: open | matched | closed
- hidden_traits (server-only)

### Match
- id, lost_report_id, found_item_id
- score, score_breakdown (JSON: attr, emb, place, time)
- rank (1..3 for shown)
- created_at

### AdminUser (최소)
- id, email, role: admin

## 관계

Building 1—N FoundItem, Building 1—N LostReport  
LostReport 1—N Match —N FoundItem

## 의도적으로 빼 둔 것

- 정밀 GPS 좌표 (건물 단위만)
- 신분증 원본 저장
- LOST112 원문 전체 미러 (시드·링크만)
