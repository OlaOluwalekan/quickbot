import type { Metadata } from "next";
import { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  const tChat = await getTranslations("Chat");
  return {
    title: `${tChat("newChat")} | Klecx`,
    description: t("description"),
  };
}

const layout = ({ children }: { children: ReactNode }) => {
  return <>{children}</>;
};

export default layout;
