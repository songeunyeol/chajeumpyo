import { CONSENT_VERSION, EmailCodeRequest, Password } from "@chajeumpyo/shared";
import { Check, Lock, RefreshCw, ShieldCheck, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Captcha } from "@/components/captcha";
import { ConsentSheet } from "@/components/consent-sheet";
import { BandHeader, Screen, StepCount } from "@/components/layout/screen";
import { OtpInput } from "@/components/otp-input";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { ErrorText, Field, Hint } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/ui/misc";
import { Alert } from "@/components/ui/status";
import { useRequestEmailCode, useSignup, useVerifyEmailCode } from "@/data";
import { type ConsentRecord, loadConsent } from "@/lib/consent-store";
import { errorCodeOf, errorMessageOf } from "@/lib/errors";
import { formatCountdown } from "@/lib/format";
import { useCountdown } from "@/lib/use-countdown";

/** 서버와 같은 값 (backend services/auth.ts) */
export const CODE_TTL_MS = 5 * 60_000;
export const RESEND_COOLDOWN_MS = 60_000;
export const CODE_MAX_FAILS = 5;
const SCHOOL_DOMAIN = "@skuniv.ac.kr";

type CodeProblem = null | { kind: "wrong"; left: number } | { kind: "blocked" } | { kind: "expired" };

/** 서버 INVALID_CODE 문구로 막힘·만료를 가른다 (코드는 같고 문구만 다름) */
export function classifyCodeError(message: string, fails: number): CodeProblem {
  if (message.includes("여러 번")) return { kind: "blocked" };
  if (message.includes("만료")) return { kind: "expired" };
  const left = CODE_MAX_FAILS - fails;
  return left <= 0 ? { kind: "blocked" } : { kind: "wrong", left };
}

/** L-02 회원가입 3단계: ① 학교 이메일 ② 6자리 코드(5분) ③ 비밀번호 + 동의 */
export function SignupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [step1Error, setStep1Error] = useState<string | null>(null);

  const sendCode = useRequestEmailCode();
  const header = (
    <BandHeader
      variant="lost"
      back={step === 1 ? "/login" : { back: () => setStep(1) }}
      title="회원가입"
      right={<StepCount current={step} total={3} />}
    />
  );
  const stepper = (
    <div className="-mt-1">
      <Stepper total={3} current={step} />
    </div>
  );

  const requestCode = (addr: string, captchaToken: string, onDone?: () => void) =>
    sendCode.mutate(
      { email: addr, captchaToken },
      {
        onSuccess: () => {
          setSentAt(Date.now());
          setStep(2);
          onDone?.();
        },
      },
    );

  if (step === 1) {
    return (
      <EmailStep
        header={header}
        stepper={stepper}
        initial={email}
        pending={sendCode.isPending}
        serverError={sendCode.isError ? sendCode.error : null}
        extraError={step1Error}
        onSubmit={(addr, token) => {
          setStep1Error(null);
          setEmail(addr);
          requestCode(addr, token);
        }}
      />
    );
  }
  if (step === 2 && sentAt !== null) {
    return (
      <CodeStep
        header={header}
        stepper={stepper}
        email={email}
        sentAt={sentAt}
        resendPending={sendCode.isPending}
        onResend={(token) => requestCode(email, token)}
        onVerified={(t) => {
          setVerificationToken(t);
          setStep(3);
        }}
      />
    );
  }
  return (
    <PasswordStep
      header={header}
      stepper={stepper}
      email={email}
      verificationToken={verificationToken ?? ""}
      onRestart={(msg) => {
        setStep1Error(msg);
        setStep(1);
      }}
      onDone={() => navigate("/home", { replace: true })}
    />
  );
}

function EmailStep({
  header,
  stepper,
  initial,
  pending,
  serverError,
  extraError,
  onSubmit,
}: {
  header: React.ReactNode;
  stepper: React.ReactNode;
  initial: string;
  pending: boolean;
  serverError: unknown;
  extraError: string | null;
  onSubmit: (email: string, captchaToken: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const code = errorCodeOf(serverError);

  // 서버 오류 뒤 캡차는 다시 받아야 한다(1회용)
  useEffect(() => {
    if (serverError) setCaptchaReset((n) => n + 1);
  }, [serverError]);

  const submit = () => {
    const parsed = EmailCodeRequest.safeParse({ email: value });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "이메일을 확인해 주세요.");
    if (!parsed.data.email.endsWith(SCHOOL_DOMAIN)) return setError("학교 이메일(@skuniv.ac.kr)만 쓸 수 있어요.");
    if (!token) return setError(null);
    setError(null);
    onSubmit(parsed.data.email, token);
  };

  const fieldError =
    error ?? (code === "INVALID_EMAIL_DOMAIN" ? "학교 이메일(@skuniv.ac.kr)만 쓸 수 있어요." : undefined);

  return (
    <Screen
      flow="lost"
      header={header}
      footer={
        <Button onClick={submit} loading={pending} disabled={!value || !token}>
          인증 코드 받기
        </Button>
      }
    >
      {stepper}
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-title font-bold tracking-tight-ko">학교 이메일을 알려 주세요</h2>
        <p className="m-0 text-ink-muted">인증 코드를 보내 드려요.</p>
      </div>
      {extraError && (
        <Alert role="alert" tone="fail" title="처음부터 다시 해 주세요">
          {extraError}
        </Alert>
      )}
      {code === "RATE_LIMITED" && (
        <Alert role="alert" tone="review" icon={Timer} title="잠시 후 다시 시도해 주세요">
          {errorMessageOf(serverError)}
        </Alert>
      )}
      {serverError && code !== "RATE_LIMITED" && code !== "INVALID_EMAIL_DOMAIN" ? (
        <Alert role="alert" tone="fail" title="코드를 보내지 못했어요">
          {errorMessageOf(serverError)}
        </Alert>
      ) : null}
      <Field label="학교 이메일" htmlFor="signup-email" error={fieldError}>
        <Input
          id="signup-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="아이디@skuniv.ac.kr"
          value={value}
          aria-invalid={!!fieldError}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </Field>
      <Hint>받는 개인정보는 학교 이메일뿐이에요. 학번·이름은 받지 않아요.</Hint>
      <Captcha onToken={setToken} resetKey={captchaReset} />
    </Screen>
  );
}

function CodeStep({
  header,
  stepper,
  email,
  sentAt,
  resendPending,
  onResend,
  onVerified,
}: {
  header: React.ReactNode;
  stepper: React.ReactNode;
  email: string;
  sentAt: number;
  resendPending: boolean;
  onResend: (captchaToken: string) => void;
  onVerified: (token: string) => void;
}) {
  const verify = useVerifyEmailCode();
  const [code, setCode] = useState("");
  const [fails, setFails] = useState(0);
  const [problem, setProblem] = useState<CodeProblem>(null);
  const [resendToken, setResendToken] = useState<string | null>(null);
  const left = useCountdown(sentAt + CODE_TTL_MS);
  const cooldown = useCountdown(sentAt + RESEND_COOLDOWN_MS);
  const expired = left <= 0 || problem?.kind === "expired";
  const blocked = problem?.kind === "blocked";
  const dead = expired || blocked;

  // 새 코드를 받으면 처음부터
  // biome-ignore lint/correctness/useExhaustiveDependencies: sentAt이 바뀔 때만
  useEffect(() => {
    setCode("");
    setFails(0);
    setProblem(null);
    setResendToken(null);
  }, [sentAt]);

  const submit = (value: string) => {
    if (value.length !== 6 || dead || verify.isPending) return;
    verify.mutate(
      { email, code: value },
      {
        onSuccess: (r) => onVerified(r.verificationToken),
        onError: (e) => {
          if (errorCodeOf(e) !== "INVALID_CODE") return setProblem(null);
          const n = fails + 1;
          setFails(n);
          setProblem(classifyCodeError(e instanceof Error ? e.message : "", n));
        },
      },
    );
  };

  const onChange = (v: string) => {
    setCode(v);
    if (problem?.kind === "wrong") setProblem(null);
    if (v.length === 6) submit(v);
  };

  return (
    <Screen
      flow="lost"
      header={header}
      footer={
        dead ? (
          <Button
            variant="secondary"
            disabled={!resendToken}
            loading={resendPending}
            onClick={() => resendToken && onResend(resendToken)}
          >
            <RefreshCw aria-hidden /> 새 코드 받기
          </Button>
        ) : (
          <Button disabled={code.length !== 6} loading={verify.isPending} onClick={() => submit(code)}>
            확인
          </Button>
        )
      }
    >
      {stepper}
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-title font-bold tracking-tight-ko">메일로 받은 코드를 넣어 주세요</h2>
        <p className="m-0 text-ink-muted">{email} 로 보냈어요.</p>
      </div>
      <div className="flex flex-col gap-2">
        <OtpInput
          id="otp"
          value={code}
          onChange={onChange}
          invalid={problem?.kind === "wrong"}
          disabled={dead}
          describedBy="otp-status"
        />
        {problem?.kind === "wrong" ? (
          <ErrorText id="otp-status">코드가 맞지 않아요. {problem.left}번 더 넣을 수 있어요.</ErrorText>
        ) : (
          !dead && (
            <p id="otp-status" className="m-0 flex items-center gap-1 text-small text-ink-muted" aria-live="polite">
              <Timer className="size-4" aria-hidden />
              남은 시간 <b className="text-brand">{formatCountdown(left)}</b>
            </p>
          )
        )}
        {verify.isError && errorCodeOf(verify.error) !== "INVALID_CODE" && (
          <ErrorText>{errorMessageOf(verify.error)}</ErrorText>
        )}
      </div>

      {blocked && (
        <Alert role="alert" tone="fail" icon={Lock} title="5번 틀려서 이 코드는 막혔어요">
          새 코드를 받아 주세요.
        </Alert>
      )}
      {!blocked && expired && (
        <Alert role="alert" tone="review" icon={Timer} title="코드 유효 시간 5분이 지났어요">
          새 코드를 받아 주세요.
        </Alert>
      )}

      {dead || cooldown <= 0 ? (
        <div className="flex flex-col gap-2">
          {!dead && <p className="m-0 text-small text-ink-muted">메일이 안 왔나요? 사람 확인 뒤 다시 받아요.</p>}
          <Captcha onToken={setResendToken} resetKey={sentAt} />
          {!dead && (
            <Button
              variant="secondary"
              size="md"
              disabled={!resendToken}
              loading={resendPending}
              onClick={() => resendToken && onResend(resendToken)}
            >
              <RefreshCw aria-hidden /> 다시 받기
            </Button>
          )}
        </div>
      ) : (
        <p className="m-0 flex min-h-touch items-center gap-3 text-small text-ink-muted">
          메일이 안 왔나요?
          <span className="font-semibold text-ink-subtle" aria-live="off">
            다시 받기 ({formatCountdown(cooldown)} 뒤)
          </span>
        </p>
      )}
    </Screen>
  );
}

function PasswordStep({
  header,
  stepper,
  email,
  verificationToken,
  onRestart,
  onDone,
}: {
  header: React.ReactNode;
  stepper: React.ReactNode;
  email: string;
  verificationToken: string;
  onRestart: (msg: string) => void;
  onDone: () => void;
}) {
  const signup = useSignup();
  const [consent, setConsent] = useState<ConsentRecord | null>(() => loadConsent("member"));
  const [sheet, setSheet] = useState(!consent);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [touched, setTouched] = useState(false);
  const pwOk = Password.safeParse(pw).success;
  const pwError = touched && !pwOk ? Password.safeParse(pw).error?.issues[0]?.message : undefined;
  const pw2Error = touched && pw2 !== pw ? "비밀번호가 서로 달라요." : undefined;

  const submit = () => {
    setTouched(true);
    if (!pwOk || pw !== pw2) return;
    if (!consent?.email || !consent.externalAi) return setSheet(true);
    signup.mutate(
      {
        verificationToken,
        password: pw,
        consent: { version: CONSENT_VERSION, email: true, externalAi: true, location: consent.location },
      },
      {
        onSuccess: onDone,
        onError: (e) => {
          const c = errorCodeOf(e);
          if (c === "EMAIL_TAKEN") onRestart("이미 가입한 이메일이에요. 로그인해 주세요.");
          else if (c === "INVALID_CODE") onRestart(errorMessageOf(e));
        },
      },
    );
  };

  const signupCode = errorCodeOf(signup.error);
  return (
    <Screen
      flow="lost"
      header={header}
      footer={
        <Button onClick={submit} loading={signup.isPending}>
          가입하기
        </Button>
      }
    >
      {stepper}
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-title font-bold tracking-tight-ko">비밀번호를 정해 주세요</h2>
        <p className="m-0 text-ink-muted">{email} 인증됐어요.</p>
      </div>
      {signup.isError && signupCode !== "EMAIL_TAKEN" && signupCode !== "INVALID_CODE" && (
        <Alert role="alert" tone="fail" title="가입하지 못했어요">
          {errorMessageOf(signup.error)}
        </Alert>
      )}
      <Field
        label="비밀번호"
        htmlFor="pw"
        error={pwError}
        hint={
          <span className={pwOk ? "flex items-center gap-1 text-pass" : "flex items-center gap-1"}>
            <Check className="size-4" aria-hidden /> 8자 이상
          </span>
        }
      >
        <PasswordInput
          id="pw"
          autoComplete="new-password"
          value={pw}
          aria-invalid={!!pwError}
          onChange={(e) => setPw(e.target.value)}
        />
      </Field>
      <Field label="비밀번호 확인" htmlFor="pw2" error={pw2Error}>
        <PasswordInput
          id="pw2"
          autoComplete="new-password"
          placeholder="한 번 더 입력"
          value={pw2}
          aria-invalid={!!pw2Error}
          onChange={(e) => setPw2(e.target.value)}
        />
      </Field>
      <div className="flex items-center gap-3 rounded-lg bg-white px-4 py-3 shadow-[0_0_0_1px_var(--border)]">
        <ShieldCheck className="size-5 shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col">
          <b className="text-[15px]">동의 항목</b>
          <span className="text-small text-ink-muted">
            {consent?.email && consent.externalAi ? "필수 2개 동의함" : "필수 동의가 필요해요"} · 위치 사용{" "}
            {consent?.location ? "함" : "안 함"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSheet(true)}
          className="inline-flex min-h-touch min-w-touch items-center justify-center text-[14px] font-semibold text-brand underline underline-offset-4"
        >
          바꾸기
        </button>
      </div>
      <ConsentSheet
        key={String(sheet)}
        flow="member"
        open={sheet}
        onOpenChange={setSheet}
        initial={consent ?? undefined}
        onAgree={(rec) => {
          setConsent(rec);
          setSheet(false);
        }}
      />
    </Screen>
  );
}
