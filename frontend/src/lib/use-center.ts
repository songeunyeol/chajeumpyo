import { useStoragePlaces } from "@/data";

/** 학교 공용 창구(CENTER) 이름·안내. 잠김·대면 확인 안내에 쓴다. 물건 위치가 드러나지 않는 공용 정보 */
export function useCenter(): { name: string; guideText: string | null } {
  const { data } = useStoragePlaces();
  const center = data?.storagePlaces.find((p) => p.org === "CENTER");
  return { name: center?.name ?? "종합서비스센터", guideText: center?.guideText ?? null };
}
