import { CONSENT_TEXTS, CONSENT_VERSION } from "@chajeumpyo/shared";
import {
  CalendarClock,
  ChevronRight,
  Eye,
  FlaskConical,
  Info,
  LogOut,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { BandHeader, Screen } from "@/components/layout/screen";
import { SectionLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { maskEmail, useLogout, useMe, useSession } from "@/data";

/** C-05 내 정보: 가린 이메일·역할·개인정보 안내·동의 내용·로그아웃. 체험 계정 변형 */
export function MePage() {
  const navigate = useNavigate();
  const session = useSession("member");
  const me = useMe();
  const logout = useLogout();
  const [consentOpen, setConsentOpen] = useState(false);
  const email = me.data?.email ?? session.user?.email ?? "";

  const signOut = (to: string) => {
    logout("member");
    navigate(to, { replace: true });
  };

  if (session.isDemo) {
    return (
      <Screen flow="lost" tabs header={<BandHeader variant="lost" title="내 정보" />}>
        <div className="flex items-center gap-4 rounded-lg bg-white p-4 shadow-card">
          <span
            className="flex size-14 items-center justify-center rounded-full bg-band-demo text-band-demo-fg"
            aria-hidden
          >
            <FlaskConical className="size-7" />
          </span>
          <div className="flex flex-col">
            <b className="text-body-lg">체험 계정</b>
            <span className="text-small text-ink-muted">이메일을 받지 않았어요</span>
          </div>
        </div>
        <div className="flex items-start gap-2.5 rounded-md bg-surface-sunken px-3.5 py-3 text-[14px] leading-5 text-ink-muted">
          <Info className="size-5 shrink-0" aria-hidden />
          체험에서 한 확인·수령은 실제 물건 상태를 바꾸지 않아요.
        </div>
        <MenuList
          items={[
            { icon: UserRound, label: "회원가입하고 실제로 쓰기", onClick: () => signOut("/signup") },
            { icon: LogOut, label: "체험 끝내기", onClick: () => signOut("/") },
          ]}
        />
      </Screen>
    );
  }

  return (
    <Screen flow="lost" tabs header={<BandHeader variant="lost" title="내 정보" />}>
      <div className="flex items-center gap-4 rounded-lg bg-white p-4 shadow-card">
        <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand" aria-hidden>
          <UserRound className="size-7" />
        </span>
        <div className="flex min-w-0 flex-col">
          {email ? <b className="mask truncate text-body-lg">{maskEmail(email)}</b> : <Skeleton className="h-5 w-40" />}
          <span className="text-small text-ink-muted">학생 계정</span>
        </div>
      </div>
      <section className="flex flex-col gap-2">
        <SectionLabel>개인정보 안내</SectionLabel>
        <ul className="m-0 flex list-none flex-col gap-3 rounded-lg bg-white p-4 text-[14px] leading-5 shadow-card">
          <li className="flex gap-2.5">
            <Mail className="mt-0.5 size-[18px] shrink-0" aria-hidden />
            <span>
              <b>받는 정보</b> 학교 이메일 하나뿐이에요. 학번·이름은 받지 않아요.
            </span>
          </li>
          <li className="flex gap-2.5">
            <Eye className="mt-0.5 size-[18px] shrink-0" aria-hidden />
            <span>
              <b>확인 기록</b> 물건 사진·위치를 본 계정은 기록돼요.
            </span>
          </li>
          <li className="flex gap-2.5">
            <CalendarClock className="mt-0.5 size-[18px] shrink-0" aria-hidden />
            <span>
              <b>삭제</b> 수령 30일 뒤 관련 기록을 지워요.
            </span>
          </li>
        </ul>
      </section>
      <MenuList
        items={[
          { icon: ShieldCheck, label: `동의 내용 보기 (${CONSENT_VERSION})`, onClick: () => setConsentOpen(true) },
          { icon: LogOut, label: "로그아웃", onClick: () => signOut("/") },
        ]}
      />
      <Sheet open={consentOpen} onOpenChange={setConsentOpen} title={`동의 내용 (${CONSENT_VERSION})`}>
        <dl className="m-0 flex flex-col gap-3 text-[14px] leading-5">
          {(
            [
              ["학교 이메일 수집 (필수)", CONSENT_TEXTS.email],
              ["사진·설명 외부 AI 처리 (필수)", CONSENT_TEXTS.externalAi],
              ["위치 사용 (선택)", CONSENT_TEXTS.location],
            ] as const
          ).map(([t, d]) => (
            <div key={t}>
              <dt className="font-bold">{t}</dt>
              <dd className="m-0 text-ink-muted">{d}</dd>
            </div>
          ))}
        </dl>
      </Sheet>
    </Screen>
  );
}

function MenuList({ items }: { items: { icon: typeof Mail; label: string; onClick: () => void }[] }) {
  return (
    <ul className="m-0 list-none overflow-hidden rounded-lg bg-white p-0 shadow-card">
      {items.map(({ icon: Icon, label, onClick }, i) => (
        <li key={label} className={i > 0 ? "border-t border-line" : ""}>
          <button
            type="button"
            onClick={onClick}
            className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[15px]"
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            <span className="flex-1">{label}</span>
            <ChevronRight className="size-5 text-ink-muted" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
