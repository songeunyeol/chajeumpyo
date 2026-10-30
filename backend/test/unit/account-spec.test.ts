import { describe, expect, it } from "vitest";
import { parseAccountSpecs } from "../../src/lib/account-spec";

const ok = "abcdefgh1234";

describe("parseAccountSpecs", () => {
  it("일반·관리자 계정을 읽고 메일을 소문자로 맞춘다", () => {
    const list = parseAccountSpecs(
      JSON.stringify([
        { email: "Judge1@skuniv.ac.kr", password: ok },
        { email: "judge-admin@skuniv.ac.kr", password: ok, role: "ADMIN", place: "교무처" },
      ]),
      ["skuniv.ac.kr"],
    );
    expect(list).toEqual([
      { email: "judge1@skuniv.ac.kr", password: ok, role: "USER" },
      { email: "judge-admin@skuniv.ac.kr", password: ok, role: "ADMIN", place: "교무처" },
    ]);
  });

  it("허용되지 않은 도메인, 중복 메일, 보관처가 있는 일반 계정을 거절한다", () => {
    expect(() => parseAccountSpecs(JSON.stringify([{ email: "a@gmail.com", password: ok }]), ["skuniv.ac.kr"])).toThrow(
      /도메인/,
    );
    const dup = JSON.stringify([
      { email: "a@skuniv.ac.kr", password: ok },
      { email: "A@skuniv.ac.kr", password: ok },
    ]);
    expect(() => parseAccountSpecs(dup, ["skuniv.ac.kr"])).toThrow(/두 번/);
    expect(() =>
      parseAccountSpecs(JSON.stringify([{ email: "a@skuniv.ac.kr", password: ok, place: "교무처" }]), ["skuniv.ac.kr"]),
    ).toThrow(/보관처/);
  });

  it("짧은 비밀번호와 깨진 JSON은 비밀번호를 드러내지 않고 거절한다", () => {
    const err = () =>
      parseAccountSpecs(JSON.stringify([{ email: "a@skuniv.ac.kr", password: "short1" }]), ["skuniv.ac.kr"]);
    expect(err).toThrow(/password/);
    expect(err).not.toThrow(/short1/);
    expect(() => parseAccountSpecs("{", ["skuniv.ac.kr"])).toThrow(/JSON/);
  });
});
