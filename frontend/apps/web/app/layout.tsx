import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/src/shared/lib/query-client";

export const metadata: Metadata = {
  title: {
    default: "Kaisa",
    template: "%s | Kaisa",
  },
  description: "Kaisa Training Records Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased" suppressHydrationWarning>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
