import { LoginRequest } from "@chajeumpyo/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { Clock, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import type { z } from "zod";
import { BandHero, Screen } from "@/components/layout/screen";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/status";
import { useAdminLogin } from "@/data";
import { errorCodeOf, errorMessageOf } from "@/lib/errors";

type Form = z.input<typeof LoginRequest>;

/** A-01 관리자 로그인. 분실자 L-01과 달리 먹색 띠·방패 아이콘, 회원가입·체험 링크 없음 */
export function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const from = (location.state as { from?: string } | null)?.from;
  const login = useAdminLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form, unknown, z.output<typeof LoginRequest>>({ resolver: zodResolver(LoginRequest) });
  const wrong = errorCodeOf(login.error) === "UNAUTHORIZED";
  const onSubmit = handleSubmit((v) =>
    login.mutate(v, {
      onSuccess: () =>
        navigate(from?.startsWith("/admin") && from !== "/admin/login" ? from : "/admin", { replace: true }),
    }),
  );

  return (
    <Screen
      flow="admin"
      header={
        <BandHero
          variant="admin"
          back="/"
          title="보관처 직원 로그인"
          eyebrow={
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-4" aria-hidden />
              찾음표 관리자
            </span>
          }
        >
          보관처마다 발급된 관리자 계정으로 들어와요.
        </BandHero>
      }
      footer={
        <>
          <Button
            type="submit"
            form="admin-login-form"
            loading={login.isPending}
            className="bg-band-admin hover:bg-band-admin/90 active:bg-band-admin"
          >
            {login.isPending ? "로그인하는 중이에요" : "관리자 로그인"}
          </Button>
          <p className="m-0 text-center text-caption text-ink-muted">
            학생 계정은 첫 화면의 “잃어버렸어요”로 들어가요.
          </p>
        </>
      }
    >
      <form id="admin-login-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {params.get("expired") === "1" && !login.isError && (
          <Alert role="alert" tone="review" icon={Clock} title="로그인이 만료됐어요">
            다시 로그인해 주세요.
          </Alert>
        )}
        {login.isError && (
          <Alert role="alert" tone="fail" title={wrong ? "이메일이나 비밀번호가 맞지 않아요" : "로그인하지 못했어요"}>
            {wrong ? "관리자 계정이 아니면 들어올 수 없어요." : errorMessageOf(login.error)}
          </Alert>
        )}
        <Field label="관리자 이메일" htmlFor="admin-email" error={errors.email?.message}>
          <Input
            id="admin-email"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="center@skuniv.ac.kr"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
        </Field>
        <Field
          label="비밀번호"
          htmlFor="admin-password"
          error={errors.password ? "비밀번호를 넣어 주세요." : undefined}
        >
          <PasswordInput
            id="admin-password"
            autoComplete="current-password"
            placeholder="비밀번호"
            aria-invalid={!!errors.password || wrong}
            {...register("password")}
          />
        </Field>
      </form>
    </Screen>
  );
}
