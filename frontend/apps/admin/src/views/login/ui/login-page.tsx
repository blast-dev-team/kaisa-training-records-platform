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
  const [inviteCode, setInviteCode] = useState("");
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
      // 초대 없음·코드 불일치·만료는 서버가 같은 코드로 내려준다 (이메일 존재 여부 숨김)
      if (e instanceof ApiError && e.code === "INVITE_INVALID") {
        setError("초대 코드가 올바르지 않거나 만료됐어요. 관리자에게 코드 재발급을 요청해 주세요");
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
      if (!inviteCode.trim()) {
        setError("관리자에게 받은 초대 코드를 입력해 주세요");
        return;
      }
      registerMutation.mutate({ email: email.trim(), password, inviteCode: inviteCode.trim() });
    } else {
      loginMutation.mutate({ email: email.trim(), password });
    }
  };

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setConfirmPassword("");
    setInviteCode("");
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
            <p className="text-20 text-white/70">교육내역 관리</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="login-mobile-logo mb-8 flex items-center gap-2 text-ink">
            <ShieldCheck className="size-7 text-accent" strokeWidth={1.5} />
            <span className="text-18 font-semibold">KAISA 관리자콘솔</span>
          </div>

          <h1 className="text-24 font-semibold tracking-tight text-ink">
            {mode === "login" ? "로그인" : "관리자 가입"}
          </h1>
          <p className="mt-2 text-14 text-ink-3">
            {mode === "login"
              ? "관리자 계정으로 로그인하세요"
              : "초대받은 이메일과 초대 코드로 가입할 수 있어요"}
          </p>

          {notice && (
            <p className="mt-4 rounded-md bg-ok-soft px-3 py-2 text-14 text-ok">{notice}</p>
          )}
          {error && (
            <p className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-14 text-danger">{error}</p>
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
                <Label htmlFor="invite-code">초대 코드</Label>
                <Input
                  id="invite-code"
                  autoComplete="one-time-code"
                  placeholder="XXXX-XXXX-XXXX"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                />
              </div>
            )}
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

          <p className="mt-6 text-center text-14 text-ink-3">
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
