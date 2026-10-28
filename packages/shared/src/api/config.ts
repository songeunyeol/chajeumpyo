import { z } from "zod";

/** 캡차 방식. off는 개발용(백엔드가 dev 토큰도 통과시킨다), turnstile은 Cloudflare Turnstile */
export const CaptchaMode = z.enum(["off", "turnstile"]);
export type CaptchaMode = z.infer<typeof CaptchaMode>;

/**
 * GET /config. 프론트가 시작할 때 읽는 공개 설정.
 * 사이트 키는 공개 값이라 내려 준다. 비밀 키는 서버 밖으로 나가지 않는다.
 */
export const PublicConfigResponse = z.object({
  captcha: z.object({
    mode: CaptchaMode,
    /** Turnstile 위젯용 사이트 키. off면 null */
    siteKey: z.string().nullable(),
  }),
});
export type PublicConfigResponse = z.infer<typeof PublicConfigResponse>;
