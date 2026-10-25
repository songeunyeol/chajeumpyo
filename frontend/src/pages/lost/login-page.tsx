import { LoginRequest } from "@chajeumpyo/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import type { z } from "zod";
import { BandHero, Screen } from "@/components/layout/screen";
import { PasswordInput } from "@/components/password-input";
import { SessionExpiredSheet } from "@/components/status-view";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/status";
import { useLogin } from "@/data";
import { errorCodeOf, errorMessageOf } from "@/lib/errors";

type Form = z.input<typeof LoginRequest>;

/** L-01 로그인. 틀리면 이메일·비밀번호 어느 쪽인지 밝히지 않는다. ?expired=1|demo면 만료 안내 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const expired = params.get("expired");
  const [expiredOpen, setExpiredOpen] = useState(expired === "1" || expired === "demo");
  const from = (location.state as { from?: string } | null)?.from;
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form, unknown, z.output<typeof LoginRequest>>({ resolver: zodResolver(LoginRequest) });

  const wrong = errorCodeOf(login.error) === "UNAUTHORIZED";
  const onSubmit = handleSubmit((v) =>
    login.mutate(v, { onSuccess: () => navigate(from && from !== "/login" ? from : "/home", { replace: true }) }),
  );

  return (
    <Screen
      flow="lost"
      header={
        <BandHero variant="lost" back="/" title="잃어버렸어요">
          학교 이메일로 로그인해요.
        </BandHero>
      }
      footer={
        <>
          <Button type="submit" form="login-form" loading={login.isPending}>
            {login.isPending ? "로그인하는 중이에요" : "로그인"}
          </Button>
          <div className="flex items-center justify-center gap-3 text-[14px]">
            <Link
              to="/signup"
              className="inline-flex min-h-touch items-center font-semibold text-brand underline underline-offset-4"
            >
              회원가입
            </Link>
            <span aria-hidden className="text-ink-subtle">
              ·
            </span>
            <Link
              to="/demo"
              className="inline-flex min-h-touch items-center font-semibold text-brand underline underline-offset-4"
            >
              체험해 보기
            </Link>
          </div>
        </>
      }
    >
      <form id="login-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {login.isError && (
          <Alert role="alert" tone="fail" title={wrong ? "이메일이나 비밀번호가 맞지 않아요" : "로그인하지 못했어요"}>
            {wrong ? "다시 확인해 주세요." : errorMessageOf(login.error)}
          </Alert>
        )}
        <Field label="학교 이메일" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="아이디@skuniv.ac.kr"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
        </Field>
        <Field label="비밀번호" htmlFor="password" error={errors.password ? "비밀번호를 넣어 주세요." : undefined}>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="8자 이상"
            aria-invalid={!!errors.password || wrong}
            {...register("password")}
          />
        </Field>
      </form>
      <SessionExpiredSheet open={expiredOpen} demo={expired === "demo"} onClose={() => setExpiredOpen(false)} />
    </Screen>
  );
}
