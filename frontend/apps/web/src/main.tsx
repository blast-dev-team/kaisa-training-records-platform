import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MaintenanceScreen } from "@/src/app/maintenance-screen";
import { initSentry } from "@/src/shared/lib/sentry";
import "@/src/styles/globals.css";

initSentry();

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

// PROD 데이터 정정 작업 중 전체 접근 차단 — 라우터·세션 쿼리 없이 차단 화면만 렌더링한다.
// 작업 완료 후 이 커밋을 revert 하면 기존 라우터가 복원된다.
createRoot(root).render(
  <StrictMode>
    <MaintenanceScreen />
  </StrictMode>,
);
