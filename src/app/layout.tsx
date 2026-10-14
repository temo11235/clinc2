import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "نظام إدارة عيادة الأسنان",
  description: "نظام متكامل لإدارة عيادة أسنان خاصة في مصر — مواعيد، ملفات طبية، حسابات، ومساعد ذكي.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
