import type { BuildingListItem } from "@chajeumpyo/shared";
import { Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OptionList } from "@/components/ui/chips";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { josa } from "@/lib/josa";

/** 건물 직접 고르기 시트: 검색 + 라디오 목록 */
export function BuildingSheet({
  open,
  onOpenChange,
  buildings,
  value,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  buildings: BuildingListItem[];
  value?: number;
  onPick: (id: number) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | undefined>(value);
  const list = buildings.filter((b) => b.name.includes(q.trim()));
  const picked = buildings.find((b) => b.id === sel);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="어느 건물에서 주웠나요?">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-muted"
          aria-hidden
        />
        <Input
          aria-label="건물 이름 검색"
          placeholder="건물 이름 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-11"
        />
      </div>
      {list.length > 0 ? (
        <OptionList
          label="건물"
          value={sel}
          onChange={setSel}
          options={list.map((b) => ({ value: b.id, title: b.name }))}
          className="max-h-[50dvh] overflow-y-auto"
        />
      ) : (
        <p className="m-0 py-6 text-center text-ink-muted">‘{q}’ 건물을 찾지 못했어요.</p>
      )}
      <Button disabled={!picked} onClick={() => picked && onPick(picked.id)}>
        {picked ? `${josa(picked.name, "으로/로")} 할게요` : "건물을 골라 주세요"}
      </Button>
    </Sheet>
  );
}
