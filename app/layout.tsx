import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { HIGHLIGHT_CSS } from "@/lib/annotations/highlight-styles";
import QueryProvider from "@/components/providers/query-provider";
import { SiteConfigProvider } from "@/components/providers/site-config-provider";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { getSiteConfig } from "@/server/config/site";
import { getLocaleDefinition, getAlternateOgLocales } from "@/i18n/locales";

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
  const locale = await getLocale().catch(() => "en");
  const localeDef = getLocaleDefinition(locale);
  const t = await getTranslations("Metadata");
  const site = getSiteConfig();
  const xHandle = site.social.x
    ? new URL(site.social.x).pathname.split("/").filter(Boolean)[0]
    : undefined;

  const defaultTitle = t ? t("root.title") : "Klecx — Workspaces, not threads";
  const titleTemplate = t ? t("root.titleTemplate") : "%s · Klecx";
  const description = t
    ? t("root.description")
    : "Collaborative AI workspace for research, writing, and knowledge organization. Keep response versions, annotate passages, and organize work into projects.";
  const applicationName = t ? t("root.applicationName") : site.appName;
  const keywordsString = t
    ? t("root.keywords")
    : "AI workspace, collaborative AI, prompt engineering, response versions, passage reasoning, AI research";
  const keywords = keywordsString.split(",").map((k) => k.trim());

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: defaultTitle,
      template: titleTemplate,
    },
    description,
    applicationName,
    authors: [{ name: "Klecx Team" }],
    keywords,
    manifest: "/manifest.webmanifest",
    // Icons come from the file conventions: app/favicon.ico, app/icon.tsx and
    // app/apple-icon.tsx, all drawn from lib/brand/mark.ts (F5.10).
    openGraph: {
      type: "website",
      locale: localeDef?.ogLocale || "en_US",
      alternateLocale: getAlternateOgLocales(locale),
      url: siteUrl,
      siteName: site.appName,
      title: defaultTitle,
      description,
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
      title: defaultTitle,
      description,
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
      <head>
        <style dangerouslySetInnerHTML={{ __html: HIGHLIGHT_CSS }} />
      </head>
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
