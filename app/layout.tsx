import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://tengen.me"),
  title: "tengen.me · Servers, systems, and projects",
  description: "Tengen's personal home for game servers, infrastructure projects, and public status.",
  openGraph: { title: "tengen.me", description: "A home for the things I run, build, and keep online.", type: "website", images: [{ url: "/og.png", width: 1744, height: 903, alt: "tengen.me — Servers, systems, and projects." }] },
  twitter: { card: "summary_large_image", title: "tengen.me", description: "Servers, systems, and projects by Tengen.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
