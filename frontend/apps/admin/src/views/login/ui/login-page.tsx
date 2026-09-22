import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/src/shared/ui/button";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";
import { ApiError } from "@/src/shared/api";
import { authQueries, postLogin, postRegister } from "@/src/entities/auth";
import logoMark from "@/src/assets/logo-mark.svg";

const PASSWORD_HINT = "10자 이상, 영문과 숫자를 조합해 주세요";

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: postLogin,
    onSuccess: (me) => {
      if (me.accountType !== "admin") {
        setError("관리자 계정으로 로그인해 주세요");
        return;
      }
      queryClient.setQueryData(authQueries.me().queryKey, me);
      navigate("/", { replace: true });
    },
    onError: (e: Error) => setError(e.message),
  });

  const registerMutation = useMutation({
    mutationFn: postRegister,
    onSuccess: () => {
      setNotice("가입이 완료됐어요. 로그인해서 들어가 주세요");
      setError(null);
      setMode("login");
    },
    onError: (e: Error) => {
      // 화이트리스트·비밀번호 규칙 위반은 서버 메시지 그대로 안내
      if (e instanceof ApiError && e.code === "EMAIL_NOT_ALLOWED") {
        setError("초대되지 않은 이메일이에요. 관리자에게 문의해 주세요");
        return;
      }
      setError(e.message);
    },
  });

  const submitting = loginMutation.isPending || registerMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    // 테스트 편의 — 이메일 '테스트' 입력 시 비밀번호 없이 데모 관리자로 로그인
    if (mode === "login" && email.trim() === "테스트") {
      loginMutation.mutate({ email: "테스트", password: "테스트" });
      return;
    }
    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 입력해 주세요");
      return;
    }
    if (mode === "register") {
      if (password.length < 10 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        setError(PASSWORD_HINT);
        return;
      }
      if (password !== confirmPassword) {
        setError("비밀번호가 일치하지 않아요. 다시 확인해 주세요");
        return;
      }
      registerMutation.mutate({ email: email.trim(), password });
    } else {
      loginMutation.mutate({ email: email.trim(), password });
    }
  };

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setConfirmPassword("");
    setShowPassword(false);
    setError(null);
    setNotice(null);
  };

  return (
    <div className="flex min-h-screen bg-bg">
      <div className="login-brand-panel">
        <div className="flex flex-col items-center justify-center gap-10 text-white bg-primary min-w-[500px]">
          <img src={logoMark} alt="KAISA 로고" className="size-50" />
          <div className="flex flex-col items-start">
            <p className="text-[30px] font-semibold tracking-tight">KAISA 관리자콘솔</p>
            <p className="text-[20px] text-white/70">교육내역 관리</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="login-mobile-logo mb-8 flex items-center gap-2 text-ink">
            <ShieldCheck className="size-7 text-accent" strokeWidth={1.5} />
            <span className="text-lg font-semibold">KAISA 관리자콘솔</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {mode === "login" ? "로그인" : "관리자 가입"}
          </h1>
          <p className="mt-2 text-sm text-ink-3">
            {mode === "login"
              ? "관리자 계정으로 로그인하세요"
              : "초대받은 이메일로만 가입할 수 있어요"}
          </p>

          {notice && (
            <p className="mt-4 rounded-md bg-ok-soft px-3 py-2 text-sm text-ok">{notice}</p>
          )}
          {error && (
            <p className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="admin@kaisa.or.kr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">비밀번호</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder={mode === "register" ? PASSWORD_HINT : ""}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 transition-colors hover:text-ink"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">비밀번호 확인</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="비밀번호 재입력"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 transition-colors hover:text-ink"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "처리 중..." : mode === "login" ? "로그인" : "가입하기"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-3">
            {mode === "login" ? (
              <>
                초대를 받았다면{" "}
                <button
                  type="button"
                  className="font-medium text-accent hover:underline"
                  onClick={() => switchMode("register")}
                >
                  가입하기
                </button>
              </>
            ) : (
              <>
                이미 계정이 있다면{" "}
                <button
                  type="button"
                  className="font-medium text-accent hover:underline"
                  onClick={() => switchMode("login")}
                >
                  로그인
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
