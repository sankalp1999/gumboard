import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/theme-provider";
import { CommandPaletteProvider } from "@/context/CommandPaletteContext";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { ClientShortcuts } from "@/components/ClientShortcuts";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gumboard",
  description: "Keep on top of your team's to-dos",
  icons: {
    icon: "/logo/gumboard.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <SessionProvider>
            <CommandPaletteProvider>
              {children}
              <ClientShortcuts />
              <KeyboardShortcutsHelp />
            </CommandPaletteProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
