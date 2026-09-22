import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { Providers } from "@/src/app/providers";
import { ReviewPendingGate } from "@/src/app/review-pending-gate";
import { router } from "@/src/app/router";
import "@/src/styles/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <Providers>
      <ReviewPendingGate>
        <RouterProvider router={router} />
      </ReviewPendingGate>
    </Providers>
  </StrictMode>,
);
