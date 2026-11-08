import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import QueryProvider from "@/components/providers/query-provider";
import { SiteConfigProvider } from "@/components/providers/site-config-provider";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { getSiteConfig } from "@/server/config/site";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const siteUrl = getSiteConfig().appUrl;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  const site = getSiteConfig();
  const xHandle = site.social.x
    ? new URL(site.social.x).pathname.split("/").filter(Boolean)[0]
    : undefined;
  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: "Klecx — Workspaces, not threads",
      template: "%s · Klecx",
    },
    description:
      "Collaborative AI workspace for research, writing, and knowledge organization. Keep response versions, annotate passages, and organize work into projects.",
    applicationName: "Klecx",
    authors: [{ name: "Klecx Team" }],
    keywords: [
      "AI workspace",
      "collaborative AI",
      "prompt engineering",
      "response versions",
      "passage reasoning",
      "AI research",
    ],
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/icon.svg", type: "image/svg+xml" },
        { url: "/favicon.ico", sizes: "any" },
      ],
      apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      url: siteUrl,
      siteName: "Klecx",
      title: "Klecx — Workspaces, not threads",
      description:
        "Collaborative AI workspace for research, writing, and knowledge organization. Keep response versions, annotate passages, and organize work into projects.",
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: t("ogImageAlt", { appName: site.appName }),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Klecx — Workspaces, not threads",
      description:
        "Collaborative AI workspace for research, writing, and knowledge organization.",
      images: ["/twitter-image"],
      ...(xHandle ? { creator: `@${xHandle}` } : {}),
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const siteConfig = getSiteConfig();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-bg text-fg font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SiteConfigProvider value={siteConfig}>
            <QueryProvider>
              <ThemeProvider
                attribute="data-theme"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                <OfflineBanner />
                {children}
                <Toaster position="bottom-right" />
              </ThemeProvider>
            </QueryProvider>
          </SiteConfigProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
