// 계정을 직접 발급한다 (심사용 계정 등). 메일 인증 없이 만들지만 권한·시도 제한은 가입한 계정과 같다.
// 비밀번호가 명령줄·로그에 남지 않게 JSON 배열을 환경 변수로 받는다.
//   ACCOUNTS_JSON='[{"email":"a@skuniv.ac.kr","password":"...","role":"USER"},{"email":"b@skuniv.ac.kr","password":"...","role":"ADMIN","place":"교무처"}]' \
//   npm run user:create -w backend
// 이미 있는 메일이면 비밀번호·역할·보관처를 덮어쓴다. 출력에는 메일과 역할만 남긴다.

import { parseAccountSpecs } from "../src/lib/account-spec";
import { hashPassword } from "../src/lib/hash";
import { prisma } from "../src/lib/prisma";

const json = process.env.ACCOUNTS_JSON;
if (!json) {
  console.error("ACCOUNTS_JSON 환경 변수에 계정 목록(JSON 배열)을 넣어 주세요.");
  process.exit(1);
}
const domains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

try {
  const accounts = parseAccountSpecs(json, domains);
  for (const a of accounts) {
    const place = a.place ? await prisma.storagePlace.findUnique({ where: { name: a.place } }) : null;
    if (a.place && !place) throw new Error(`보관처 "${a.place}"가 없어요.`);
    const data = { passwordHash: await hashPassword(a.password), role: a.role, storagePlaceId: place?.id ?? null };
    const user = await prisma.user.upsert({
      where: { email: a.email },
      update: data,
      create: { email: a.email, ...data },
    });
    console.log(`계정을 만들었어요: ${user.email} (${user.role}${place ? `, 보관처 ${place.name}` : ""})`);
  }
} finally {
  await prisma.$disconnect();
}
