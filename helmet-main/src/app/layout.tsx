import type { Metadata } from "next";
import "./globals.css";
import { GlobalClickSound } from "../components/GlobalClickSound";
import { BottomNav } from "../components/BottomNav";

export const metadata: Metadata = {
  title: "Echo",
  description: "Remember with Echo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Syncopate:wght@400;700&family=Michroma&display=swap" rel="stylesheet" />
      </head>
      <body>
        <GlobalClickSound />
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
