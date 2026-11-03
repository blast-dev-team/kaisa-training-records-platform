import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { Providers } from "@/src/app/providers";
import { router } from "@/src/app/router";
import { initSentry } from "@/src/shared/lib/sentry";
import "@/src/styles/globals.css";

initSentry();

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
