import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { BandHeader, Screen } from "@/components/layout/screen";
import {
  PageSkeleton,
  SessionExpiredSheet,
  STATUS_KINDS,
  type StatusKind,
  StatusScreen,
} from "@/components/status-view";

/** C-06 상태 화면 미리보기 경로 /status/:kind (loading·offline·notfound·expired·ratelimit·server) */
export function StatusPage() {
  const { kind = "notfound" } = useParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  if (kind === "loading")
    return (
      <Screen flow="lost" header={<BandHeader variant="lost" back />}>
        <PageSkeleton delay={0} />
      </Screen>
    );
  if (kind === "expired" || kind === "expired-demo")
    return (
      <Screen flow="lost" header={<BandHeader variant="lost" title="찾음표" back={false} />}>
        <SessionExpiredSheet
          open={open}
          demo={kind === "expired-demo"}
          onClose={() => {
            setOpen(false);
            navigate("/login");
          }}
        />
      </Screen>
    );
  const k = (STATUS_KINDS as string[]).includes(kind) ? (kind as StatusKind) : "notfound";
  return <StatusScreen kind={k} onRetry={k === "notfound" ? undefined : () => window.location.reload()} />;
}

/** 없는 주소 */
export function NotFoundPage() {
  return <StatusScreen kind="notfound" />;
}
