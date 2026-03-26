import type { Metadata } from "next";
import { AppProvider } from "@/components/app/app-provider";
import { getSettings } from "@/lib/server/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "gpt_chat",
  description:
    "Private bilingual chat client powered by the GitHub Copilot SDK.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getSettings();

  return (
    <html lang="en" data-theme={settings.themePreference}>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
