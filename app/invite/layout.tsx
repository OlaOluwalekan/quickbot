import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.invite");
  return {
    title: `${t("title")} · Klecx`,
    description: t("description"),
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default function InviteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
