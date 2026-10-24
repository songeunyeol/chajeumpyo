import { CANDIDATE_REASON_LABELS, CATEGORY_LABELS, type Candidate, type CandidateReason } from "@chajeumpyo/shared";
import { Building2, Clock, EyeOff, Info, type LucideIcon, ShieldCheck, Tag, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReasonChip } from "@/components/ui/chips";
import { SeedBadge, StatusBadge } from "@/components/ui/status";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { formatDay, formatFloor } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 한 물건에 계정당 주는 확인 기회 */
export const MAX_ATTEMPTS = 3;

const REASON_ICONS: Record<CandidateReason, LucideIcon> = {
  SAME_CATEGORY: Tag,
  RELATED_CATEGORY: Tags,
  SAME_BUILDING: Building2,
  FOUND_SOON_AFTER: Clock,
};

/**
 * 후보 썸네일 필터. 서버가 이미 강하게 흐린 사진을 주지만, 색이 드러나지 않게 흑백까지 한 번 더 (디자인 배치 2 기준 1).
 * 카드에는 공개 정보(종류·습득 날짜·건물·층·근거·남은 기회)만. 색·브랜드·특징·점수·순위는 모양 자체에 없다.
 */
export const THUMB_FILTER = "blur(14px) grayscale(1)";

export function CandidateThumb({ candidate }: { candidate: Candidate }) {
  const CatIcon = CATEGORY_ICONS[candidate.category];
  if (!candidate.thumbnailUrl) {
    return (
      <div className="flex size-[72px] shrink-0 items-center justify-center rounded-md bg-surface-sunken text-ink-muted">
        <CatIcon className="size-7" aria-hidden />
      </div>
    );
  }
  return (
    <div className="relative size-[72px] shrink-0 overflow-hidden rounded-md bg-[#CFC8BB]">
      <img
        src={candidate.thumbnailUrl}
        alt="흐리게 가린 후보 사진"
        data-testid="candidate-thumb"
        className="absolute -inset-3 size-[calc(100%+24px)] max-w-none object-cover"
        style={{ filter: THUMB_FILTER }}
        draggable={false}
      />
      <EyeOff
        className="absolute right-1 bottom-1 size-4 text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.4)]"
        aria-hidden
      />
    </div>
  );
}

export function CandidateCard({
  candidate,
  centerName,
  onClaim,
  onInPerson,
}: {
  candidate: Candidate;
  centerName: string;
  onClaim: () => void;
  onInPerson: () => void;
}) {
  const c = candidate;
  const CatIcon = CATEGORY_ICONS[c.category];
  const lockedMine = c.locked && !c.inPersonOnly;
  return (
    <article
      aria-label={`${CATEGORY_LABELS[c.category]} 후보`}
      className={cn("flex flex-col gap-3 rounded-lg bg-white p-3.5 shadow-card", c.locked && "bg-[#FAF8F4]")}
    >
      <div className="flex gap-3">
        <CandidateThumb candidate={c} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="m-0 flex items-center gap-1.5 text-[16px] font-bold">
            <CatIcon className="size-5 shrink-0 text-brand" aria-hidden />
            {CATEGORY_LABELS[c.category]}
          </h3>
          <p className="m-0 text-small text-ink-muted">
            {formatDay(c.foundAt)} 습득 · {c.building.name} {formatFloor(c.floor)}
          </p>
          {c.reasons.length > 0 && (
            <ul className="m-0 mt-1 flex list-none flex-wrap gap-1.5 p-0" aria-label="후보로 고른 이유">
              {c.reasons.map((r) => (
                <li key={r}>
                  <ReasonChip icon={REASON_ICONS[r]}>{CANDIDATE_REASON_LABELS[r]}</ReasonChip>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {c.inPersonOnly ? (
        <>
          <div className="flex items-center gap-2">
            <StatusBadge tone="inperson">대면 확인만</StatusBadge>
            <span className="text-small text-ink-muted">온라인 확인이 닫혔어요</span>
          </div>
          <Button variant="secondary" onClick={onInPerson}>
            <Info aria-hidden /> 찾는 방법 보기
          </Button>
        </>
      ) : lockedMine ? (
        <>
          <div className="flex items-center gap-2">
            <StatusBadge tone="locked">잠김</StatusBadge>
            <span className="text-small text-ink-muted">확인 기회를 모두 썼어요</span>
          </div>
          <p className="m-0 text-small text-ink-muted">
            이 물건은 앱에서 더 확인할 수 없어요. 학생증을 가지고 {centerName}에 문의해 주세요.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <p className="m-0 flex flex-1 items-center gap-1 text-small text-ink-muted">
              <ShieldCheck className="size-4" aria-hidden />
              확인 기회{" "}
              <b className="text-ink">
                {MAX_ATTEMPTS}번 중 {c.attemptsLeft}번
              </b>{" "}
              남음
            </p>
            {c.isSeed && <SeedBadge />}
          </div>
          <Button onClick={onClaim}>내 물건인지 확인</Button>
        </>
      )}
    </article>
  );
}
