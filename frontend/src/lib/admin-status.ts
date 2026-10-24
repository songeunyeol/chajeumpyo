import type { FoundStatus } from "@chajeumpyo/shared";
import { CalendarX, CircleCheck, Clock, Eye, Loader, type LucideIcon, PackageCheck } from "lucide-react";
import type { Tone } from "@/components/ui/status";

/** 관리자 화면 습득물 상태: 글자 + 아이콘 + 색 (색만으로 구분하지 않음) */
export const FOUND_STATUS_VIEW: Record<FoundStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  ANALYZING: { label: "분석 중", tone: "neutral", icon: Loader },
  REVIEW: { label: "검토 대기", tone: "review", icon: Clock },
  REGISTERED: { label: "등록됨", tone: "pass", icon: CircleCheck },
  REVEALED: { label: "열람됨", tone: "neutral", icon: Eye },
  CLAIMED: { label: "수령 완료", tone: "neutral", icon: PackageCheck },
  EXPIRED: { label: "기한 만료", tone: "neutral", icon: CalendarX },
};

/** A-03 필터 칩 순서 */
export const STATUS_FILTERS: FoundStatus[] = ["REVIEW", "REGISTERED", "REVEALED", "CLAIMED", "EXPIRED"];
