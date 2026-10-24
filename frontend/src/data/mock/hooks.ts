import {
  type AdminFoundItemListResponse,
  type AdminUpdateFoundItemRequest,
  type AnswerResponse,
  type AuthResponse,
  type ClaimResponse,
  type CreateLostReportRequest,
  type EmailVerifyResponse,
  ERROR_STATUS,
  type ErrorCode,
  type FoundItemDetailResponse,
  type FoundStatus,
  type InPersonPickupResponse,
  type LoginRequest,
  type LostReportWithCandidates,
  type PickupCompleteResponse,
  type PickupQrResponse,
  type PickupScanResponse,
  type RegisterFoundItemResponse,
  type SelfPickupResponse,
  type UpdateLostReportRequest,
  VALUABLE_CATEGORIES,
} from "@chajeumpyo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import type {
  AdminListParams,
  DemoLoginInput,
  HotspotParams,
  RegisterFoundItemInput,
  Session,
  SignupInput,
} from "../types";
import * as db from "./db";

// ── 공통 ─────────────────────────────────────────────

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const delay = () => wait(250);

class MockApiError extends Error {
  status: number;
  code: ErrorCode;
  constructor(code: ErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.status = ERROR_STATUS[code];
  }
}
const fail = (code: ErrorCode): never => {
  throw new MockApiError(code);
};

// ── 세션 ─────────────────────────────────────────────

const SESSION_KEY = "chajeumpyo.mock.session";
const EMPTY: Session = { user: null, isDemo: false, isAdmin: false, storagePlace: null };
let session: Session = (() => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : EMPTY;
  } catch {
    return EMPTY;
  }
})();
const listeners = new Set<() => void>();
function setSession(next: Session) {
  session = next;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  } catch {
    // 무시
  }
  for (const l of listeners) l();
}

/** 테스트·스크린샷용 */
export const setMockSession = (next: Session | null) => setSession(next ?? EMPTY);

export function useSession(): Session {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => session,
  );
}

export function useLogout() {
  const qc = useQueryClient();
  return () => {
    setSession(EMPTY);
    qc.clear();
  };
}

const authOf = (email: string, role: "USER" | "ADMIN" | "DEMO"): AuthResponse => ({
  accessToken: "mock",
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  user: { id: "u1", email, role },
});

export function useLogin() {
  return useMutation({
    mutationFn: async (body: LoginRequest) => {
      await delay();
      if (body.password === "wrong-password") fail("UNAUTHORIZED");
      const res = authOf(body.email, "USER");
      setSession({ user: res.user, isDemo: false, isAdmin: false, storagePlace: null });
      return res;
    },
  });
}

export function useAdminLogin() {
  return useMutation({
    mutationFn: async (body: LoginRequest) => {
      await delay();
      if (body.password === "wrong-password") fail("UNAUTHORIZED");
      const storagePlace = { id: 1, name: "학생지원센터" };
      setSession({ user: authOf(body.email, "ADMIN").user, isDemo: false, isAdmin: true, storagePlace });
      return { ...authOf(body.email, "ADMIN"), storagePlace };
    },
  });
}

export function useDemoLogin() {
  return useMutation({
    mutationFn: async (_: DemoLoginInput) => {
      await wait(600);
      const res = authOf("demo-7f3a@demo.chajeumpyo", "DEMO");
      setSession({ user: res.user, isDemo: true, isAdmin: false, storagePlace: null });
      return res;
    },
  });
}

export function useRequestEmailCode() {
  return useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      await delay();
      if (!email.endsWith("@skuniv.ac.kr")) fail("INVALID_EMAIL_DOMAIN");
      if (email.startsWith("taken")) fail("EMAIL_TAKEN");
      return { sent: true };
    },
  });
}

export function useVerifyEmailCode() {
  return useMutation({
    mutationFn: async ({ code }: { email: string; code: string }): Promise<EmailVerifyResponse> => {
      await delay();
      if (code === "000000") fail("INVALID_CODE");
      if (code === "999999") fail("RATE_LIMITED");
      return { verificationToken: "vt", expiresAt: new Date(Date.now() + 600_000).toISOString() };
    },
  });
}

export function useSignup() {
  return useMutation({
    mutationFn: async (_: SignupInput) => {
      await delay();
      const res = authOf("student@skuniv.ac.kr", "USER");
      setSession({ user: res.user, isDemo: false, isAdmin: false, storagePlace: null });
      return res;
    },
  });
}

export function useMe() {
  const s = useSession();
  return useQuery({
    queryKey: ["me", s.user?.id],
    queryFn: async () => {
      await delay();
      if (!s.user) fail("UNAUTHORIZED");
      return s.user as NonNullable<Session["user"]>;
    },
  });
}

// ── 건물·보관처 ──────────────────────────────────────

export function useBuildings() {
  return useQuery({
    queryKey: ["buildings"],
    queryFn: async () => {
      await delay();
      return { buildings: db.buildings };
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useStoragePlaces(buildingId?: number) {
  return useQuery({
    queryKey: ["storage-places", buildingId ?? null],
    queryFn: async () => {
      await delay();
      const list = db.storagePlaces.map((p) => ({ ...p, sameBuilding: p.building.id === buildingId }));
      list.sort((a, b) => Number(b.sameBuilding) - Number(a.sameBuilding));
      return { storagePlaces: list };
    },
  });
}

// ── 습득물 등록 ──────────────────────────────────────

export function useRegisterFoundItem() {
  return useMutation({
    mutationFn: async (input: RegisterFoundItemInput): Promise<RegisterFoundItemResponse> => {
      await wait(2500);
      const name = input.image.name.toLowerCase();
      if (name.includes("blank")) fail("NO_OBJECT_DETECTED");
      if (name.includes("huge")) fail("IMAGE_TOO_LARGE");
      if (name.includes("rate")) fail("RATE_LIMITED");
      const building = db.buildings.find((x) => x.id === input.buildingId) ?? db.buildings[0];
      const bs = { id: building?.id ?? 1, name: building?.name ?? "" };
      const place = db.storagePlaces.find((p) => p.id === input.storagePlaceId);
      const review = name.includes("review");
      const category = review ? null : name.includes("umbrella") ? "UMBRELLA" : "EARPHONE";
      const valuable = category !== null && VALUABLE_CATEGORIES.includes(category);
      return {
        id: "f-new",
        status: review ? "REVIEW" : "REGISTERED",
        category,
        building: bs,
        floor: input.floor ?? null,
        storageType: input.storageType,
        storagePlace: place ? { id: place.id, name: place.name, guideText: place.guideText } : null,
        message: review ? "사진만으로 물건을 알아보지 못해 관리자가 확인한 뒤 등록돼요." : null,
        handOverAdvice:
          valuable && input.storageType === "IN_PLACE"
            ? {
                message: "비싼 물건이라 가까운 보관처에 맡겨 주시면 더 안전하게 돌려줄 수 있어요.",
                storagePlaces: db.storagePlaces.map((p) => ({
                  id: p.id,
                  name: p.name,
                  guideText: p.guideText,
                  building: p.building,
                  sameBuilding: p.building.id === bs.id,
                })),
              }
            : null,
      };
    },
  });
}

// ── 분실 신고 ────────────────────────────────────────

export function useLostReports() {
  return useQuery({
    queryKey: ["lost-reports"],
    queryFn: async () => {
      await delay();
      return { reports: db.lostReports };
    },
  });
}

export function useCandidates(reportId: string) {
  return useQuery({
    queryKey: ["candidates", reportId],
    queryFn: async () => {
      await delay();
      const ids = db.reportCandidates[reportId];
      if (!ids) fail("NOT_FOUND");
      const candidates = (ids ?? []).flatMap((id) => {
        const f = db.foundItems[id];
        return f ? [f.candidate] : [];
      });
      return { candidates };
    },
  });
}

export function useCreateLostReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateLostReportRequest): Promise<LostReportWithCandidates> => {
      await wait(1500);
      if (body.description.includes("오류")) fail("AI_UNAVAILABLE");
      const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      return {
        id,
        status: "OPEN",
        candidates: (db.reportCandidates[id] ?? []).flatMap((x) => {
          const f = db.foundItems[x];
          return f ? [f.candidate] : [];
        }),
      };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lost-reports"] }),
  });
}

export function useUpdateLostReport(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateLostReportRequest): Promise<LostReportWithCandidates> => {
      await wait(800);
      const r = db.lostReports.find((x) => x.id === reportId);
      if (r && body.description) r.description = body.description;
      if (r && body.status) r.status = body.status;
      return { id: reportId, status: r?.status ?? "OPEN", candidates: [] };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lost-reports"] });
      qc.invalidateQueries({ queryKey: ["candidates", reportId] });
    },
  });
}

// ── 판정 ─────────────────────────────────────────────

export function useClaim(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ foundItemId }: { foundItemId: string }): Promise<ClaimResponse> => {
      await wait(2200);
      const f = db.foundItems[foundItemId];
      if (!f) return fail("NOT_FOUND");
      const attemptId = `at-${foundItemId.slice(0, 8)}`;
      switch (f.outcome) {
        case "PASS":
          return { result: "PASS", attemptId, reused: false, matchedFields: ["color", "feature:sticker"], foundItemId };
        case "BORDERLINE":
          return { result: "BORDERLINE", attemptId, reused: false, question: "손잡이는 어떤 재질이었나요?" };
        case "FAIL":
          return { result: "FAIL", attemptId, reused: false, attemptsLeft: 1, inPersonOnly: false };
        case "LOCKED":
          return fail("MATCH_LOCKED");
        case "IN_PERSON":
          return fail("IN_PERSON_REQUIRED");
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["candidates", reportId] }),
  });
}

export function useAnswer(attemptId: string) {
  return useMutation({
    mutationFn: async ({ answer }: { answer: string }): Promise<AnswerResponse> => {
      await wait(1500);
      if (attemptId === "used") fail("ALREADY_ANSWERED");
      if (answer.includes("나무")) return { result: "PASS", foundItemId: "22222222-2222-4222-8222-222222222222" };
      return { result: "FAIL", attemptsLeft: 1, inPersonOnly: false };
    },
  });
}

// ── 공개·수령 ────────────────────────────────────────

export function useFoundItemDetail(id: string) {
  return useQuery({
    queryKey: ["found-item", id],
    queryFn: async (): Promise<FoundItemDetailResponse> => {
      await delay();
      const f = db.foundItems[id];
      if (!f) return fail("NOT_FOUND");
      const c = f.candidate;
      return { id, category: c.category, building: c.building, foundAt: c.foundAt, isSeed: c.isSeed, ...f.detail };
    },
  });
}

export function useIssuePickupQr(foundItemId: string) {
  const s = useSession();
  return useMutation({
    mutationFn: async (): Promise<PickupQrResponse> => {
      await wait(500);
      if (s.isDemo) {
        return { method: "DEMO", pickupId: "p-demo", status: "COMPLETED", completedAt: new Date().toISOString() };
      }
      if (foundItemId.startsWith("4")) fail("ALREADY_CLAIMED");
      return {
        method: "CENTER_QR",
        pickupId: "p1",
        qrToken: `mock-qr-${Math.random().toString(36).slice(2, 10)}`,
        status: "ISSUED",
        expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
      };
    },
  });
}

export function useSelfPickup(_foundItemId: string) {
  return useMutation({
    mutationFn: async (): Promise<SelfPickupResponse> => {
      await wait(500);
      return { pickupId: "p2", method: "SELF_REPORT", status: "COMPLETED", completedAt: new Date().toISOString() };
    },
  });
}

// ── 알림 ─────────────────────────────────────────────

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      await delay();
      return { notifications: db.notifications, unreadCount: db.notifications.filter((n) => !n.readAt).length };
    },
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const n = db.notifications.find((x) => x.id === id);
      if (n && !n.readAt) n.readAt = new Date().toISOString();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      for (const n of db.notifications) n.readAt ??= new Date().toISOString();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

// ── 관리자 ───────────────────────────────────────────

export function useAdminFoundItems(params: AdminListParams = {}) {
  return useQuery({
    queryKey: ["admin", "found-items", params],
    queryFn: async (): Promise<AdminFoundItemListResponse> => {
      await delay();
      const all = [db.reviewItem, ...Object.keys(db.foundItems).map(db.adminDetail)];
      const items = params.status ? all.filter((x) => x.status === params.status) : all;
      const counts: Partial<Record<FoundStatus, number>> = { REVIEW: 1, REGISTERED: 5, REVEALED: 2, CLAIMED: 14 };
      return { items, page: params.page ?? 1, pageSize: 20, total: items.length, counts };
    },
  });
}

export function useAdminFoundItem(id: string) {
  return useQuery({
    queryKey: ["admin", "found-item", id],
    queryFn: async () => {
      await delay();
      return id === db.reviewItem.id ? db.reviewItem : db.adminDetail(id);
    },
  });
}

export function useUpdateAdminFoundItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_: AdminUpdateFoundItemRequest) => {
      await wait(500);
      return { id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
  });
}

export function useInPersonPickup(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_: { verificationNote: string }): Promise<InPersonPickupResponse> => {
      await wait(500);
      return { pickupId: `ip-${id}`, method: "IN_PERSON", status: "COMPLETED", completedAt: new Date().toISOString() };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
  });
}

export function useScanPickup() {
  return useMutation({
    mutationFn: async ({ qrToken }: { qrToken: string }): Promise<PickupScanResponse> => {
      await wait(600);
      if (qrToken.includes("expired")) fail("QR_EXPIRED");
      if (qrToken.includes("claimed")) fail("ALREADY_CLAIMED");
      if (qrToken.includes("other")) fail("FORBIDDEN");
      return {
        pickupId: "p1",
        foundItem: {
          id: "11111111-1111-4111-8111-111111111111",
          category: "EARPHONE",
          building: "유담관",
          imageUrl: db.mockPhoto("#F7F7F2", "circle"),
        },
        claimant: { emailMasked: "ki***@skuniv.ac.kr" },
        expiresAt: new Date(Date.now() + 20 * 3_600_000).toISOString(),
      };
    },
  });
}

export function useCompletePickup() {
  return useMutation({
    mutationFn: async ({ pickupId }: { pickupId: string }): Promise<PickupCompleteResponse> => {
      await wait(500);
      return { pickupId, status: "COMPLETED", completedAt: new Date().toISOString() };
    },
  });
}

export function useHotspots(params: HotspotParams) {
  return useQuery({
    queryKey: ["admin", "hotspots", params],
    queryFn: async () => {
      await delay();
      return { ...db.hotspots, from: params.from ?? db.hotspots.from, to: params.to ?? db.hotspots.to };
    },
  });
}
