import { createBrowserRouter } from "react-router";

// 라우트가 늘어나면 lazy import 로 코드 스플리팅한다.
export const router = createBrowserRouter([
  {
    path: "/",
    lazy: async () => {
      const { HomePage } = await import("@/src/views/home");
      return { Component: HomePage };
    },
  },
]);
