import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Monitoring Konsumsi",
    template: "%s · Monitoring Konsumsi",
  },
  description:
    "Monitoring perencanaan, distribusi, pengambilan, dan anggaran konsumsi.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
