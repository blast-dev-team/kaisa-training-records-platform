import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "happy-dom",
    // 시간 관련 테스트가 실행 환경 타임존에 흔들리지 않도록 KST 고정.
    env: { TZ: "Asia/Seoul" },
  },
});
