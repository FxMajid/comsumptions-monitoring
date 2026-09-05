import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/*
 * Both faces are variable fonts, so a single file covers every weight the
 * interface uses. next/font self-hosts them and inlines the @font-face rule,
 * which removes the external request and the layout shift that comes with it.
 * The mono face is only for figures; `--font-sans` and `--font-mono` in
 * globals.css are what the Tailwind utilities read.
 */
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

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
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
