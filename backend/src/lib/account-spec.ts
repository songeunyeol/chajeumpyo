// 직접 발급하는 계정 목록(심사용 등)을 검사한다. 비밀번호는 환경 변수 JSON으로만 받는다 (scripts/create-user.ts)
import { Password } from "@chajeumpyo/shared";
import { z } from "zod";

const AccountSpec = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: Password,
  role: z.enum(["USER", "ADMIN"]).default("USER"),
  place: z.string().min(1).optional(),
});
export type AccountSpec = z.infer<typeof AccountSpec>;

/** JSON 배열을 읽어 메일 도메인·역할·보관처 조건을 확인한다. 틀리면 비밀번호를 빼고 이유만 던진다 */
export function parseAccountSpecs(json: string, allowedDomains: readonly string[]): AccountSpec[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("계정 목록 JSON을 읽지 못했어요.");
  }
  const parsed = z.array(AccountSpec).min(1).safeParse(raw);
  if (!parsed.success)
    throw new Error(`계정 목록이 올바르지 않아요: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  const seen = new Set<string>();
  for (const a of parsed.data) {
    const domain = a.email.split("@")[1] ?? "";
    if (!allowedDomains.includes(domain)) throw new Error(`허용되지 않은 메일 도메인이에요: ${a.email}`);
    if (seen.has(a.email)) throw new Error(`같은 메일이 두 번 있어요: ${a.email}`);
    seen.add(a.email);
    if (a.role === "USER" && a.place) throw new Error(`일반 계정에는 보관처를 줄 수 없어요: ${a.email}`);
  }
  return parsed.data;
}
