import { CONSENT_VERSION } from "@chajeumpyo/shared";

/**
 * C-02 동의 기록. 습득자·체험·가입 각각 처음 한 번만 묻는다.
 * 기기에만 남기는 편의 기록이고, 실제 동의는 매 요청 본문(consent)으로 서버에 간다.
 */
export type ConsentFlow = "finder" | "demo" | "member";

export type ConsentRecord = {
  version: string;
  email: boolean;
  location: boolean;
  externalAi: boolean;
};

const key = (flow: ConsentFlow) => `chajeumpyo.consent.${flow}`;

export function loadConsent(flow: ConsentFlow): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(key(flow));
    if (!raw) return null;
    const rec = JSON.parse(raw) as ConsentRecord;
    // 문구 버전이 바뀌면 다시 묻는다
    if (rec.version !== CONSENT_VERSION) return null;
    return rec;
  } catch {
    return null;
  }
}

export function saveConsent(flow: ConsentFlow, rec: Omit<ConsentRecord, "version">): ConsentRecord {
  const full = { ...rec, version: CONSENT_VERSION };
  try {
    localStorage.setItem(key(flow), JSON.stringify(full));
  } catch {
    // 저장이 막혀도 이번 요청에는 쓴다
  }
  return full;
}
