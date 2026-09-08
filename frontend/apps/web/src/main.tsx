import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { Providers } from "@/src/app/providers";
import { router } from "@/src/app/router";
import "@fontsource/pretendard/400.css";
import "@fontsource/pretendard/600.css";
import "@/src/styles/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
