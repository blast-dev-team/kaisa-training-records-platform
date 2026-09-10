import { useEffect, useRef, useState } from "react";
import "@cap.js/widget";
import type { CapSolveEvent } from "@cap.js/widget";

import { TextField } from "@/src/shared/ui";
import { cn } from "@/src/shared/utils/cn";

/**
 * Cap(https://trycap.dev) 보안문자 위젯 래퍼 — Apache 2.0 오픈소스, 자체 호스팅.
 *
 * 검증 서버 엔드포인트(사이트 키 포함)는 VITE_CAP_API_ENDPOINT 로 전달받는다.
 * 미설정 시 Figma 보안문자 행(입력칸 + 코드 표시 박스)을 렌더하되, 표시된
 * 코드와 일치해야 토큰이 발급되는 목업으로 동작한다 — 목업은 안전하지 않으므로
 * 실제 검증은 Cap 서버·백엔드 연동 후 siteverify 로 수행한다.
 */

/** 목업 모드에서 표시·비교되는 보안문자 코드 */
const DEMO_CODE = "83F9B";

export interface CapCaptchaProps {
  /** 풀이 완료 시 토큰 수신 */
  onSolve?: (token: string) => void;
  className?: string;
}

export function CapCaptcha({ onSolve, className }: CapCaptchaProps) {
  const apiEndpoint = import.meta.env.VITE_CAP_API_ENDPOINT;
  const hostRef = useRef<HTMLDivElement>(null);
  // 최신 콜백만 유지 — effect 재실행로 위젯이 다시 그려지는 것을 막는다
  const onSolveRef = useRef(onSolve);
  const [demoValue, setDemoValue] = useState("");

  onSolveRef.current = onSolve;

  useEffect(() => {
    const host = hostRef.current;
    if (!apiEndpoint || !host) return;

    const widget = document.createElement("cap-widget");
    widget.setAttribute("data-cap-api-endpoint", apiEndpoint);
    widget.setAttribute("data-cap-i18n-initial-state", "저는 로봇이 아닙니다");
    widget.setAttribute("data-cap-i18n-verifying-label", "확인 중...");
    widget.setAttribute("data-cap-i18n-solved-label", "확인되었습니다");
    widget.setAttribute(
      "data-cap-i18n-error-label",
      "오류가 발생했습니다. 다시 시도해 주세요",
    );

    const handleSolve = (event: Event) => {
      const { token } = (event as CapSolveEvent).detail;
      onSolveRef.current?.(token);
    };
    widget.addEventListener("solve", handleSolve);
    host.replaceChildren(widget);

    return () => {
      widget.removeEventListener("solve", handleSolve);
    };
  }, [apiEndpoint]);

  // 엔드포인트 미설정 — 목업: 표시된 코드 일치 시 토큰 발급
  if (!apiEndpoint) {
    const isDemoMatched =
      demoValue.replace(/\s+/g, "").toUpperCase() === DEMO_CODE;

    return (
      <div
        aria-label="보안문자"
        className={cn("flex w-full items-center gap-3 font-sans", className)}
      >
        <TextField
          variant="outlined"
          placeholder="보안문자 입력"
          autoComplete="off"
          value={demoValue}
          error={demoValue !== "" && !isDemoMatched}
          onChange={(event) => {
            const next = event.target.value;
            setDemoValue(next);
            onSolveRef.current?.(
              next.replace(/\s+/g, "").toUpperCase() === DEMO_CODE
                ? `demo:${DEMO_CODE}`
                : "",
            );
          }}
          className="min-w-px flex-1 overflow-clip rounded-lg"
        />
        <div className="flex w-[160px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 bg-gray-100 py-3 text-gray-500">
          <span className="text-base font-bold tracking-[0.64px]">
            8 3 F 9 B
          </span>
          <span className="text-sm font-medium">CAPTCHA</span>
        </div>
      </div>
    );
  }

  return <div ref={hostRef} className={cn("w-full", className)} />;
}
