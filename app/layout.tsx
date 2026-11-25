import type { Metadata } from "next";
import "./profile.css";

export const metadata: Metadata = {
  title: "S-Profile · 学生服务管理",
  description: "团队学生档案、服务进度与学校申请工作台。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
