import type { Metadata } from "next";
import { AppProvider } from "@/components/app/app-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "gpt_chat",
  description:
    "Private bilingual chat client powered by the GitHub Copilot SDK.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
