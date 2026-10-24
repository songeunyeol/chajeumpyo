import { Construction } from "lucide-react";
import type { Flow } from "@/components/layout/flow";
import { BandHeader, Screen } from "@/components/layout/screen";
import { EmptyState } from "@/components/ui/misc";
import { ResultIcon } from "@/components/ui/status";

/** 아직 만들지 않은 화면 자리. 화면 ID와 이름을 보여 준다 */
export function ScreenPlaceholder({
  id,
  title,
  flow,
  tabs,
}: {
  id: string;
  title: string;
  flow: Flow;
  tabs?: boolean;
}) {
  return (
    <Screen
      flow={flow}
      tabs={tabs}
      wide={flow === "admin"}
      header={<BandHeader variant={flow === "demo" ? "lost" : flow} title={title} back={!tabs} />}
    >
      <EmptyState icon={<ResultIcon tone="neutral" icon={Construction} size={64} />} title={`${id} ${title}`}>
        이 화면은 곧 만들어요.
      </EmptyState>
    </Screen>
  );
}
