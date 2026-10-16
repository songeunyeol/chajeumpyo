// 관리자 계정 만들기 (관리자는 직접 발급한다, 기능 명세서 F-14)
// npm run admin:create -w backend -- --email guard@skuniv.ac.kr --password '...' --place "혜인관 경비실"
import { parseArgs } from "node:util";
import { Password } from "@chajeumpyo/shared";
import { hashPassword } from "../src/lib/hash";
import { prisma } from "../src/lib/prisma";

const { values } = parseArgs({
  options: { email: { type: "string" }, password: { type: "string" }, place: { type: "string" } },
});
if (!values.email || !values.password) {
  console.error(
    '사용법: npm run admin:create -w backend -- --email <이메일> --password <비밀번호> [--place "보관처 이름"]',
  );
  process.exit(1);
}
const password = Password.parse(values.password);
const email = values.email.trim().toLowerCase();

try {
  const place = values.place ? await prisma.storagePlace.findUnique({ where: { name: values.place } }) : null;
  if (values.place && !place) throw new Error(`보관처 "${values.place}"가 없어요. 시드 데이터를 먼저 넣어 주세요.`);
  const data = {
    passwordHash: await hashPassword(password),
    role: "ADMIN" as const,
    storagePlaceId: place?.id ?? null,
  };
  const user = await prisma.user.upsert({ where: { email }, update: data, create: { email, ...data } });
  console.log(`관리자 계정을 만들었어요: ${user.email}${place ? ` (보관처: ${place.name})` : " (보관처 없음)"}`);
} finally {
  await prisma.$disconnect();
}
