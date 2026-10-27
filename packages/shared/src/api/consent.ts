import { z } from "zod";

/**
 * 동의 문구 버전 (QA B15, open-issues #35). 문구를 바꾸면 이 값을 바꾸고, 예전 버전 동의는 받지 않는다.
 * 프론트는 이 버전과 아래 문구를 동의 화면에 그대로 쓴다.
 */
export const CONSENT_VERSION = "2026-10-12";

export const CONSENT_TEXTS = {
  email: "가입한 학교 이메일을 저장해요. 물건을 확인하고 가져간 계정을 특정하는 데 쓰고, 수령 30일 뒤 관련 기록을 지워요.",
  location:
    "사진의 위치 정보나 지금 위치로 가장 가까운 건물을 골라요. 좌표는 휴대폰 안에서 건물로만 바꾸고 서버에 보내거나 저장하지 않아요.",
  externalAi:
    "사진과 설명을 Google Gemini(해외)로 보내 물건의 종류·색·특징을 읽어요. 학습에 쓰이지 않는 유료 구간을 쓰고, 개인정보가 보이는 부분은 가려서 보여 줘요.",
} as const;

const Version = z.literal(CONSENT_VERSION, { message: "동의 내용이 바뀌었어요. 다시 확인해 주세요." });
const Required = (what: string) => z.literal(true, { message: `${what}에 동의해야 이용할 수 있어요.` });

/** 회원가입·체험 로그인: 이메일 수집과 외부 AI 처리는 필수, 위치는 선택 */
export const MemberConsent = z.object({
  version: Version,
  email: Required("이메일 수집"),
  externalAi: Required("사진·설명의 외부 AI 처리"),
  location: z.boolean().default(false),
});
export type MemberConsent = z.infer<typeof MemberConsent>;

/** 체험 로그인: 저장하는 이메일이 없으므로 외부 AI 처리만 필수 */
export const DemoConsent = MemberConsent.omit({ email: true });
export type DemoConsent = z.infer<typeof DemoConsent>;

/** multipart 필드는 문자열이라 "true"/"false"를 불리언으로 바꾼다 */
const FormBool = z.enum(["true", "false"]).transform((v) => v === "true");

/** 습득물 등록(비회원, multipart): 외부 AI 처리는 필수, 위치는 선택 */
export const FinderConsentFields = z.object({
  consentVersion: Version,
  consentExternalAi: FormBool.pipe(Required("사진의 외부 AI 처리")),
  consentLocation: FormBool.default(false),
});
