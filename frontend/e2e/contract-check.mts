// biome-ignore-all lint/suspicious/noExplicitAny: 응답 본문을 느슨하게 살펴보는 확인 스크립트
// biome-ignore-all lint/style/noNonNullAssertion: 시드 데이터가 있다고 보고 돌리는 스크립트
// 계약 확인: 화면이 쓰는 모든 엔드포인트를 실제 서버(4100)에 부르고 shared zod 스키마로 응답을 검증한다.
// 실행: API 서버(4100)를 켠 뒤 저장소 루트에서  npx tsx frontend/e2e/contract-check.mts <API 서버 로그 파일>  (가입 코드를 로그에서 읽음)
import { readFileSync } from "node:fs";
import sharp from "sharp";
import * as S from "../../packages/shared/src/index.ts";

const ORIGIN = "http://localhost:5173";
const API = process.env.API_BASE ?? "http://localhost:4100/api/v1";
const LOG = process.argv[2] ?? "";
const results: { name: string; ok: boolean; note: string }[] = [];
const rec = (name: string, ok: boolean, note = "") => {
  results.push({ name, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${note ? `  — ${note}` : ""}`);
};

type Opt = { method?: string; json?: unknown; form?: FormData; token?: string; headers?: Record<string, string> };
async function call(path: string, o: Opt = {}) {
  const headers: Record<string, string> = { Origin: ORIGIN, ...(o.headers ?? {}) };
  if (o.json !== undefined) headers["Content-Type"] = "application/json";
  if (o.token) headers.Authorization = `Bearer ${o.token}`;
  const res = await fetch(`${API}${path}`, {
    method: o.method ?? (o.json !== undefined || o.form ? "POST" : "GET"),
    headers,
    body: o.form ?? (o.json !== undefined ? JSON.stringify(o.json) : undefined),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body: body as any, headers: res.headers };
}
function check<T>(
  name: string,
  r: { status: number; body: unknown },
  status: number,
  schema?: { safeParse(v: unknown): any },
) {
  const parsed = schema ? schema.safeParse(r.body) : { success: true };
  const ok = r.status === status && parsed.success;
  rec(
    name,
    ok,
    ok
      ? `${r.status}`
      : `status ${r.status} ${JSON.stringify(r.body).slice(0, 300)} ${parsed.success ? "" : JSON.stringify(parsed.error.issues).slice(0, 300)}`,
  );
  return r.body as T;
}
function checkErr(name: string, r: { status: number; body: any }, code: string) {
  const ok =
    r.status === S.ERROR_STATUS[code as S.ErrorCode] &&
    r.body?.error?.code === code &&
    S.ErrorResponse.safeParse(r.body).success;
  rec(name, ok, ok ? `${r.status} ${code}` : `got ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
}

const photo = (rgb: [number, number, number]) =>
  sharp({ create: { width: 640, height: 480, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } })
    .jpeg()
    .toBuffer();
const consent = { version: S.CONSENT_VERSION, externalAi: true, location: false };
const run = Date.now().toString(36);

// ── CORS ───────────────────────────────────────────
{
  const pre = await fetch(`${API}/found-items`, {
    method: "OPTIONS",
    headers: {
      Origin: ORIGIN,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "x-captcha-token",
    },
  });
  const allowH = pre.headers.get("access-control-allow-headers") ?? "";
  rec(
    "CORS preflight POST /found-items (+X-Captcha-Token)",
    pre.status === 204 && pre.headers.get("access-control-allow-origin") === ORIGIN && /x-captcha-token/i.test(allowH),
    `${pre.status} origin=${pre.headers.get("access-control-allow-origin")} headers=${allowH}`,
  );
  const pre2 = await fetch(`${API}/notifications/read-all`, {
    method: "OPTIONS",
    headers: {
      Origin: ORIGIN,
      "Access-Control-Request-Method": "PATCH",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });
  rec(
    "CORS preflight PATCH + Authorization",
    pre2.status === 204 && /PATCH/.test(pre2.headers.get("access-control-allow-methods") ?? ""),
    `${pre2.status} methods=${pre2.headers.get("access-control-allow-methods")}`,
  );
  const bad = await fetch(`${API}/buildings`, { headers: { Origin: "http://evil.example" } });
  rec(
    "CORS 다른 출처는 허용 안 함",
    !bad.headers.get("access-control-allow-origin"),
    `${bad.headers.get("access-control-allow-origin")}`,
  );
}

// ── 공개 ───────────────────────────────────────────
const { buildings } = check<S.BuildingListResponse>(
  "GET /buildings",
  await call("/buildings"),
  200,
  S.BuildingListResponse,
);
const yudam = buildings.find((b) => b.name === "유담관") ?? buildings[0]!;
const sp = check<S.StoragePlaceListResponse>(
  "GET /storage-places?buildingId",
  await call(`/storage-places?buildingId=${yudam.id}`),
  200,
  S.StoragePlaceListResponse,
);
rec("storage-places 같은 건물 먼저", sp.storagePlaces[0]?.sameBuilding === true, sp.storagePlaces[0]?.name);
const guardPlace = sp.storagePlaces.find((p) => p.name === "유담관 경비실")!;

// ── F-02 등록 (multipart) ──────────────────────────
async function register(opts: {
  storageType: "IN_PLACE" | "HANDED_OVER";
  placeId?: number;
  ua: string;
  floor?: string;
}) {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(await photo([240, 240, 240]))], { type: "image/jpeg" }), "p.jpg");
  form.append("buildingId", String(yudam.id));
  form.append("storageType", opts.storageType);
  if (opts.placeId) form.append("storagePlaceId", String(opts.placeId));
  if (opts.floor) form.append("floor", opts.floor);
  form.append("consentVersion", S.CONSENT_VERSION);
  form.append("consentExternalAi", "true");
  form.append("consentLocation", "false");
  return call("/found-items", { form, headers: { "User-Agent": opts.ua } });
}
const reg = await register({ storageType: "HANDED_OVER", placeId: guardPlace.id, ua: `cc-${run}-1`, floor: "-1" });
const found = check<S.RegisterFoundItemResponse>(
  "POST /found-items (HANDED_OVER)",
  reg,
  201,
  S.RegisterFoundItemResponse,
);
rec(
  "등록 응답에 비공개 정보 없음(color/brand/features/title)",
  !["color", "brand", "features", "title", "description"].some((k) => k in (reg.body ?? {})),
  Object.keys(reg.body ?? {}).join(","),
);
const regInPlace = await register({ storageType: "IN_PLACE", ua: `cc-${run}-2` });
const inPlace = check<S.RegisterFoundItemResponse>(
  "POST /found-items (IN_PLACE)",
  regInPlace,
  201,
  S.RegisterFoundItemResponse,
);
rec(
  "고가품 IN_PLACE면 handOverAdvice",
  S.VALUABLE_CATEGORIES.includes(inPlace.category!) ? !!inPlace.handOverAdvice : inPlace.handOverAdvice === null,
  `category=${inPlace.category} advice=${!!inPlace.handOverAdvice}`,
);
{
  const form = new FormData();
  form.append("buildingId", String(yudam.id));
  form.append("storageType", "IN_PLACE");
  form.append("consentVersion", S.CONSENT_VERSION);
  form.append("consentExternalAi", "true");
  checkErr(
    "POST /found-items 사진 없음",
    await call("/found-items", { form, headers: { "User-Agent": `cc-${run}-3` } }),
    "VALIDATION_ERROR",
  );
}

// ── L-02 가입 ──────────────────────────────────────
const email = `cc${run}@skuniv.ac.kr`;
checkErr(
  "POST /auth/email/code 다른 도메인",
  await call("/auth/email/code", { json: { email: "x@gmail.com" } }),
  "INVALID_EMAIL_DOMAIN",
);
const codeRes = await call("/auth/email/code", { json: { email } });
rec("POST /auth/email/code", codeRes.status === 204, `${codeRes.status}`);
checkErr("POST /auth/email/code 60초 안 다시", await call("/auth/email/code", { json: { email } }), "RATE_LIMITED");
await new Promise((r) => setTimeout(r, 500));
const log = readFileSync(LOG, "utf8");
const lines = log.split("\n").filter((l) => l.includes(email));
const code = lines
  .map((l) => l.match(/\b(\d{6})\b/)?.[1])
  .filter(Boolean)
  .pop();
rec("서버 로그에서 인증 코드 찾기", !!code, code ? "found" : lines.slice(-2).join(" | ").slice(0, 300));
checkErr(
  "POST /auth/email/verify 틀린 코드",
  await call("/auth/email/verify", { json: { email, code: code === "000000" ? "111111" : "000000" } }),
  "INVALID_CODE",
);
const ver = check<S.EmailVerifyResponse>(
  "POST /auth/email/verify",
  await call("/auth/email/verify", { json: { email, code } }),
  200,
  S.EmailVerifyResponse,
);
const signup = check<S.AuthResponse>(
  "POST /auth/signup",
  await call("/auth/signup", {
    json: { verificationToken: ver.verificationToken, password: "password1234", consent: { ...consent, email: true } },
  }),
  201,
  S.AuthResponse,
);
checkErr(
  "POST /auth/login 틀린 비번",
  await call("/auth/login", { json: { email, password: "wrong-pass" } }),
  "UNAUTHORIZED",
);
const login = check<S.AuthResponse>(
  "POST /auth/login",
  await call("/auth/login", { json: { email, password: "password1234" } }),
  200,
  S.AuthResponse,
);
const userTok = login.accessToken ?? signup.accessToken;
check("GET /me", await call("/me", { token: userTok }), 200, S.MeResponse);
checkErr("GET /me 잘못된 토큰", await call("/me", { token: "garbage" }), "UNAUTHORIZED");

// ── L-04/L-05 신고·후보 (회원) ─────────────────────
const now = new Date();
const lostFrom = new Date(now.getTime() - 3 * 3600_000).toISOString();
const lostTo = new Date(now.getTime() - 60_000).toISOString();
const created = check<S.LostReportWithCandidates>(
  "POST /lost-reports",
  await call("/lost-reports", {
    token: userTok,
    json: {
      category: "EARPHONE",
      lostFrom,
      lostTo,
      buildingId: yudam.id,
      description: "흰색 이어폰, 곰돌이 스티커, 오른쪽 아래 긁힘",
    },
  }),
  201,
  S.LostReportWithCandidates,
);
rec("후보 최대 3개", created.candidates.length <= 3, `${created.candidates.length}`);
const cand = check<S.CandidateListResponse>(
  "GET /lost-reports/:id/candidates",
  await call(`/lost-reports/${created.id}/candidates`, { token: userTok }),
  200,
  S.CandidateListResponse,
);
const forbiddenKeys = ["color", "brand", "features", "score", "rank", "title", "description", "similarity"];
rec(
  "후보에 색·점수·특징 없음",
  cand.candidates.every((c) => !forbiddenKeys.some((k) => k in c)),
  cand.candidates.map((c) => Object.keys(c).join("|"))[0],
);
rec(
  "후보 습득 최신순",
  cand.candidates.every((c, i, a) => i === 0 || Date.parse(a[i - 1]!.foundAt) >= Date.parse(c.foundAt)),
);
const mine = cand.candidates.find((c) => c.foundItemId === found.id);
rec("방금 등록한 물건이 후보에 있음", !!mine, cand.candidates.map((c) => c.foundItemId.slice(0, 8)).join(","));
if (mine?.thumbnailUrl) {
  const t = await fetch(mine.thumbnailUrl, { headers: { Origin: ORIGIN } });
  const corp = t.headers.get("cross-origin-resource-policy");
  rec(
    "썸네일 URL 받기(서명)",
    t.status === 200 && (t.headers.get("content-type") ?? "").startsWith("image/"),
    `${t.status} ${mine.thumbnailUrl.slice(0, 60)}`,
  );
  rec("썸네일 CORP가 다른 출처(5173) <img>를 막지 않음", corp !== "same-origin", `CORP=${corp}`);
  rec(
    "썸네일 URL이 브라우저에서 닿는 주소(PUBLIC_BASE_URL=4100)",
    mine.thumbnailUrl.startsWith("http://localhost:4100/"),
    mine.thumbnailUrl.slice(0, 40),
  );
} else rec("썸네일 URL 있음", false, "thumbnailUrl null");
check("GET /lost-reports", await call("/lost-reports", { token: userTok }), 200, S.LostReportListResponse);

// ── L-07/L-08 판정 PASS → L-10 공개 → L-11 QR → A-05 스캔·완료 ──
checkErr(
  "GET /found-items/:id/detail 통과 전",
  await call(`/found-items/${found.id}/detail`, { token: userTok }),
  "FORBIDDEN",
);
const claim = check<S.ClaimResponse>(
  "POST /lost-reports/:id/claims",
  await call(`/lost-reports/${created.id}/claims`, { token: userTok, json: { foundItemId: found.id } }),
  200,
  S.ClaimResponse,
);
rec("판정 결과(흰색·곰돌이 스티커·긁힘) = PASS", claim.result === "PASS", claim.result);
const claimAgain = check<S.ClaimResponse>(
  "같은 설명으로 다시 판정 → reused",
  await call(`/lost-reports/${created.id}/claims`, { token: userTok, json: { foundItemId: found.id } }),
  200,
  S.ClaimResponse,
);
rec("reused=true", claimAgain.reused === true, String(claimAgain.reused));
const detail = check<S.FoundItemDetailResponse>(
  "GET /found-items/:id/detail",
  await call(`/found-items/${found.id}/detail`, { token: userTok }),
  200,
  S.FoundItemDetailResponse,
);
if (detail?.imageUrl) {
  const img = await fetch(detail.imageUrl);
  rec("공개 사진 URL 받기", img.status === 200, `${img.status}`);
}
const qr = check<S.PickupQrResponse>(
  "POST /found-items/:id/pickup-qr",
  await call(`/found-items/${found.id}/pickup-qr`, { token: userTok, method: "POST" }),
  200,
  S.PickupQrResponse,
);
checkErr(
  "POST /found-items/:id/self-pickup (보관처 물건)",
  await call(`/found-items/${found.id}/self-pickup`, { token: userTok, method: "POST" }),
  "INVALID_STORAGE_TYPE",
);

const guard = check<S.AdminAuthResponse>(
  "POST /admin/auth/login (guard)",
  await call("/admin/auth/login", { json: { email: "guard@skuniv.ac.kr", password: "admin1234!" } }),
  200,
  S.AdminAuthResponse,
);
const center = check<S.AdminAuthResponse>(
  "POST /admin/auth/login (center)",
  await call("/admin/auth/login", { json: { email: "center@skuniv.ac.kr", password: "admin1234!" } }),
  200,
  S.AdminAuthResponse,
);
checkErr(
  "POST /admin/auth/login 회원 계정",
  await call("/admin/auth/login", { json: { email, password: "password1234" } }),
  "UNAUTHORIZED",
);
if (qr?.method === "CENTER_QR") {
  checkErr(
    "POST /admin/pickups/scan 다른 보관처",
    await call("/admin/pickups/scan", { token: center.accessToken, json: { qrToken: qr.qrToken } }),
    "FORBIDDEN",
  );
  const scan = check<S.PickupScanResponse>(
    "POST /admin/pickups/scan",
    await call("/admin/pickups/scan", { token: guard.accessToken, json: { qrToken: qr.qrToken } }),
    200,
    S.PickupScanResponse,
  );
  check(
    "POST /admin/pickups/:id/complete",
    await call(`/admin/pickups/${scan.pickupId}/complete`, { token: guard.accessToken, method: "POST" }),
    200,
    S.PickupCompleteResponse,
  );
  checkErr(
    "POST /admin/pickups/scan 이미 수령",
    await call("/admin/pickups/scan", { token: guard.accessToken, json: { qrToken: qr.qrToken } }),
    "ALREADY_CLAIMED",
  );
}
checkErr(
  "POST /admin/pickups/scan 없는 토큰",
  await call("/admin/pickups/scan", { token: guard.accessToken, json: { qrToken: "nope" } }),
  "NOT_FOUND",
);

// ── 체험 계정: 시드만, 수령은 DEMO ──────────────────
const demo = check<S.AuthResponse>(
  "POST /auth/demo",
  await call("/auth/demo", { json: { consent: { version: S.CONSENT_VERSION, externalAi: true, location: false } } }),
  201,
  S.AuthResponse,
);
rec("체험 계정 role DEMO", demo.user?.role === "DEMO", demo.user?.role);
const demoRep = check<S.LostReportWithCandidates>(
  "POST /lost-reports (체험)",
  await call("/lost-reports", {
    token: demo.accessToken,
    json: {
      category: "EARPHONE",
      lostFrom: new Date(Date.now() - 30 * 86400_000).toISOString(),
      lostTo,
      description: "흰색 이어폰, 곰돌이 스티커, 오른쪽 아래 긁힘",
    },
  }),
  201,
  S.LostReportWithCandidates,
);
rec(
  "체험 후보는 시드만",
  demoRep.candidates.every((c) => c.isSeed),
  `${demoRep.candidates.length}개 seed=${demoRep.candidates.map((c) => c.isSeed).join(",")}`,
);
const demoCand = demoRep.candidates.find((c) => c.category === "EARPHONE" && !c.locked);
if (demoCand) {
  const dc = check<S.ClaimResponse>(
    "체험 판정",
    await call(`/lost-reports/${demoRep.id}/claims`, {
      token: demo.accessToken,
      json: { foundItemId: demoCand.foundItemId },
    }),
    200,
    S.ClaimResponse,
  );
  rec("체험 판정 PASS", dc.result === "PASS", dc.result);
  if (dc.result === "PASS") {
    check(
      "체험 상세",
      await call(`/found-items/${demoCand.foundItemId}/detail`, { token: demo.accessToken }),
      200,
      S.FoundItemDetailResponse,
    );
    const dq = check<S.PickupQrResponse>(
      "체험 수령 QR → DEMO 완료",
      await call(`/found-items/${demoCand.foundItemId}/pickup-qr`, { token: demo.accessToken, method: "POST" }),
      200,
      S.PickupQrResponse,
    );
    rec("체험 수령 method DEMO", dq?.method === "DEMO", dq?.method);
  }
} else rec("체험 이어폰 시드 후보", false, JSON.stringify(demoRep.candidates).slice(0, 200));

// ── FAIL / BORDERLINE / 답 ──────────────────────────
{
  const reg2 = check<S.RegisterFoundItemResponse>(
    "POST /found-items (FAIL용)",
    await register({ storageType: "HANDED_OVER", placeId: guardPlace.id, ua: `cc-${run}-4` }),
    201,
    S.RegisterFoundItemResponse,
  );
  const failRep = check<S.LostReportWithCandidates>(
    "POST /lost-reports (틀린 설명)",
    await call("/lost-reports", {
      token: userTok,
      json: {
        category: "EARPHONE",
        lostFrom,
        lostTo,
        buildingId: yudam.id,
        description: "검정 이어폰, 고양이 스티커 붙어 있음",
      },
    }),
    201,
    S.LostReportWithCandidates,
  );
  const f = check<S.ClaimResponse>(
    "판정(틀린 설명)",
    await call(`/lost-reports/${failRep.id}/claims`, { token: userTok, json: { foundItemId: reg2.id } }),
    200,
    S.ClaimResponse,
  );
  rec(
    "FAIL이고 맞은/틀린 항목 없음",
    f.result === "FAIL" && !("matchedFields" in f) && !("mismatched" in f),
    `${f.result} keys=${Object.keys(f).join(",")}`,
  );
  if (f.result === "FAIL") rec("attemptsLeft = 2", f.attemptsLeft === 2, String(f.attemptsLeft));
  const cands = check<S.CandidateListResponse>(
    "FAIL 뒤 후보",
    await call(`/lost-reports/${failRep.id}/candidates`, { token: userTok }),
    200,
    S.CandidateListResponse,
  );
  const after = cands.candidates.find((c) => c.foundItemId === reg2.id);
  rec("후보 attemptsLeft 반영", after?.attemptsLeft === 2, String(after?.attemptsLeft));

  const bRep = check<S.LostReportWithCandidates>(
    "POST /lost-reports (애매한 설명)",
    await call("/lost-reports", {
      token: userTok,
      json: { category: "EARPHONE", lostFrom, lostTo, buildingId: yudam.id, description: "흰색 이어폰 잃어버렸어요" },
    }),
    201,
    S.LostReportWithCandidates,
  );
  const b = check<S.ClaimResponse>(
    "판정(애매)",
    await call(`/lost-reports/${bRep.id}/claims`, { token: userTok, json: { foundItemId: reg2.id } }),
    200,
    S.ClaimResponse,
  );
  rec("애매한 설명 결과", true, `${b.result}${b.result === "BORDERLINE" ? ` q=${b.question}` : ""}`);
  if (b.result === "BORDERLINE") {
    const a = check<S.AnswerResponse>(
      "POST /claims/:attemptId/answer",
      await call(`/claims/${b.attemptId}/answer`, { token: userTok, json: { answer: "곰돌이" } }),
      200,
      S.AnswerResponse,
    );
    rec("답 결과", true, a.result);
    checkErr(
      "두 번째 답",
      await call(`/claims/${b.attemptId}/answer`, { token: userTok, json: { answer: "곰돌이" } }),
      "ALREADY_ANSWERED",
    );
  }
  const upd = check<S.LostReportWithCandidates>(
    "PATCH /lost-reports/:id 설명",
    await call(`/lost-reports/${failRep.id}`, {
      token: userTok,
      method: "PATCH",
      json: { description: "검정 이어폰, 고양이 스티커와 긁힘" },
    }),
    200,
    S.LostReportWithCandidates,
  );
  rec("PATCH 후보 다시", Array.isArray(upd.candidates));
  check(
    "PATCH /lost-reports/:id 닫기",
    await call(`/lost-reports/${failRep.id}`, { token: userTok, method: "PATCH", json: { status: "CLOSED" } }),
    200,
    S.LostReportWithCandidates,
  );

  // in-person-pickup: 잠기지 않은 물건이면 NOT_IN_PERSON_ITEM
  checkErr(
    "POST /admin/found-items/:id/in-person-pickup 잠기지 않음",
    await call(`/admin/found-items/${reg2.id}/in-person-pickup`, {
      token: guard.accessToken,
      json: { verificationNote: "학생증 확인" },
    }),
    "NOT_IN_PERSON_ITEM",
  );
}

// ── 그 자리 물건 [찾았어요] ─────────────────────────
{
  const ipRep = check<S.LostReportWithCandidates>(
    "POST /lost-reports (IN_PLACE용)",
    await call("/lost-reports", {
      token: userTok,
      json: {
        category: "EARPHONE",
        lostFrom,
        lostTo,
        buildingId: yudam.id,
        description: "흰색 이어폰, 곰돌이 스티커, 오른쪽 아래 긁힘 있음",
      },
    }),
    201,
    S.LostReportWithCandidates,
  );
  const c = check<S.ClaimResponse>(
    "판정(IN_PLACE)",
    await call(`/lost-reports/${ipRep.id}/claims`, { token: userTok, json: { foundItemId: inPlace.id } }),
    200,
    S.ClaimResponse,
  );
  if (c.result === "PASS") {
    checkErr(
      "IN_PLACE 물건 pickup-qr",
      await call(`/found-items/${inPlace.id}/pickup-qr`, { token: userTok, method: "POST" }),
      "INVALID_STORAGE_TYPE",
    );
    check(
      "POST /found-items/:id/self-pickup",
      await call(`/found-items/${inPlace.id}/self-pickup`, { token: userTok, method: "POST" }),
      200,
      S.SelfPickupResponse,
    );
  } else rec("IN_PLACE 판정 PASS", false, c.result);
}

// ── C-04 알림 ──────────────────────────────────────
for (const [who, tok] of [
  ["회원", userTok],
  ["관리자", guard.accessToken],
] as const) {
  const n = check<S.NotificationListResponse>(
    `GET /notifications (${who})`,
    await call("/notifications", { token: tok }),
    200,
    S.NotificationListResponse,
  );
  const first = n.notifications[0];
  if (first) {
    const r = await call(`/notifications/${first.id}/read`, { token: tok, method: "PATCH" });
    rec(`PATCH /notifications/:id/read (${who})`, r.status === 204, `${r.status}`);
  } else rec(`알림 있음 (${who})`, true, "0개 — 읽음 생략");
  const ra = await call("/notifications/read-all", { token: tok, method: "PATCH" });
  rec(`PATCH /notifications/read-all (${who})`, ra.status === 204, `${ra.status}`);
}

// ── A-02~A-06 관리자 ───────────────────────────────
const list = check<S.AdminFoundItemListResponse>(
  "GET /admin/found-items",
  await call("/admin/found-items?page=1", { token: center.accessToken }),
  200,
  S.AdminFoundItemListResponse,
);
rec("관리자 목록 counts", Object.keys(list.counts).length > 0, JSON.stringify(list.counts));
check(
  "GET /admin/found-items?status=REVIEW",
  await call("/admin/found-items?status=REVIEW", { token: center.accessToken }),
  200,
  S.AdminFoundItemListResponse,
);
const gList = check<S.AdminFoundItemListResponse>(
  "GET /admin/found-items (guard)",
  await call("/admin/found-items", { token: guard.accessToken }),
  200,
  S.AdminFoundItemListResponse,
);
const target = gList.items.find((i) => i.status === "REGISTERED") ?? gList.items[0];
if (target) {
  const d = check<S.AdminFoundItemDetailResponse>(
    "GET /admin/found-items/:id",
    await call(`/admin/found-items/${target.id}`, { token: guard.accessToken }),
    200,
    S.AdminFoundItemDetailResponse,
  );
  if (d?.originalImageUrl) {
    const o = await fetch(d.originalImageUrl);
    rec("관리자 원본 사진 받기", o.status === 200, `${o.status}`);
  }
  check(
    "PATCH /admin/found-items/:id",
    await call(`/admin/found-items/${target.id}`, {
      token: guard.accessToken,
      method: "PATCH",
      json: { brand: "Apple" },
    }),
    200,
    S.AdminFoundItemDetailResponse,
  );
  checkErr(
    "PATCH 빈 본문",
    await call(`/admin/found-items/${target.id}`, { token: guard.accessToken, method: "PATCH", json: {} }),
    "VALIDATION_ERROR",
  );
}
const hs = check<S.HotspotResponse>(
  "GET /admin/stats/hotspots",
  await call("/admin/stats/hotspots", { token: center.accessToken }),
  200,
  S.HotspotResponse,
);
rec("hotspots topInsight", !!hs.topInsight, hs.topInsight);
checkErr("관리자 API를 회원 토큰으로", await call("/admin/found-items", { token: userTok }), "FORBIDDEN");
checkErr("회원 API를 관리자 토큰으로 (/me)", await call("/me", { token: guard.accessToken }), "FORBIDDEN");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(` - ${f.name}: ${f.note}`);
}
