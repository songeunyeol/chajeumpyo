import { useParams } from "react-router";
import { ConsentSheet } from "@/components/consent-sheet";
import { BandHeader, Screen } from "@/components/layout/screen";

/** 개발 중에만 열리는 미리보기 (아직 화면이 없는 상태를 확인할 때). 빌드에서는 경로가 없다 */
export function DevPreviewPage() {
  const { name } = useParams();
  if (name === "consent-member") {
    return (
      <Screen flow="lost" header={<BandHeader variant="lost" back title="회원가입" />}>
        <ConsentSheet flow="member" open onOpenChange={() => {}} onAgree={() => {}} initial={{ email: true }} />
      </Screen>
    );
  }
  return <p>없는 미리보기</p>;
}
