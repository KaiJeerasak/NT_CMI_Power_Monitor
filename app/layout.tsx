import type { Metadata } from "next";
import "./globals.css";
import "./auth.css";

export const metadata: Metadata = {
  title: "NT Chiang Mai | Power Monitor",
  description: "ระบบติดตามสถานะและข้อมูลพลังงานสถานี NT จังหวัดเชียงใหม่",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
