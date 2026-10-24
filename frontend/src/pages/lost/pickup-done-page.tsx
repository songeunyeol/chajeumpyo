import { CATEGORY_LABELS, type Category } from "@chajeumpyo/shared";
import { CircleCheck, FlaskConical, PackageCheck } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { BandHeader, Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { ResultIcon, StatusBadge } from "@/components/ui/status";
import { useLogout } from "@/data";
import { josa } from "@/lib/josa";

/** L-12 수령 완료: 일반 / 체험(시연) / 그 자리 찾았어요 */
export function PickupDonePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useLogout();
  const kind = params.get("kind");
  const st = (location.state as { category?: Category; placeName?: string | null } | null) ?? {};
  const item = st.category ? CATEGORY_LABELS[st.category] : "물건";
  const home = () => navigate("/home", { replace: true });

  if (kind === "demo") {
    return (
      <Done
        icon={<ResultIcon tone="info" icon={PackageCheck} />}
        badge={
          <StatusBadge tone="seed" icon={FlaskConical}>
            시연
          </StatusBadge>
        }
        title="시연: 보관처에서 수령 처리됨"
        body={
          <>
            실제 서비스에서는 보관처 직원이 QR을
            <br />
            스캔하면 이 화면이 나와요.
          </>
        }
        note="체험 기록은 실제 물건 상태를 바꾸지 않아요."
        footer={
          <>
            <Button onClick={() => navigate("/", { replace: true })}>처음으로</Button>
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                logout("member");
                navigate("/demo", { replace: true });
              }}
            >
              체험 다시 하기
            </Button>
          </>
        }
      />
    );
  }
  if (kind === "inplace") {
    return (
      <Done
        icon={<ResultIcon tone="pass" icon={CircleCheck} />}
        title="찾았다고 기록했어요"
        body={
          <>
            {josa(item, "은/는")} 이제 다른 사람의 후보에
            <br />
            나오지 않아요. 신고는 “찾음”으로 닫혔어요.
          </>
        }
        note="확인·수령 기록은 30일 뒤 지워져요."
        footer={<Button onClick={home}>홈으로</Button>}
      />
    );
  }
  return (
    <Done
      icon={<ResultIcon tone="info" icon={PackageCheck} />}
      title="물건을 찾았어요"
      body={
        <>
          {josa(item, "을/를")} {st.placeName ? `${st.placeName}에서` : "보관처에서"}
          <br />
          받았어요. 신고는 “찾음”으로 닫혔어요.
        </>
      }
      note="확인·수령 기록은 30일 뒤 지워져요."
      footer={<Button onClick={home}>홈으로</Button>}
    />
  );
}

function Done({
  icon,
  badge,
  title,
  body,
  note,
  footer,
}: {
  icon: React.ReactNode;
  badge?: React.ReactNode;
  title: string;
  body: React.ReactNode;
  note: string;
  footer: React.ReactNode;
}) {
  return (
    <Screen
      flow="lost"
      header={<BandHeader variant="lost" back={{ close: "/home" }} title="수령 완료" />}
      bodyClassName="items-center justify-center text-center"
      footer={footer}
    >
      <div role="status" className="flex flex-col items-center gap-3">
        {icon}
        {badge}
        <p className="m-0 text-title font-bold">{title}</p>
        <p className="m-0 text-ink-muted">{body}</p>
        <p className="m-0 mt-1 text-caption text-ink-subtle">{note}</p>
      </div>
    </Screen>
  );
}
