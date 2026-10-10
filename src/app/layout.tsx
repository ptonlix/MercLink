import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "../public-discovery/public.css";

export const metadata: Metadata = {
  title: "MercLink",
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
