"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useUiStore } from "@/lib/stores/ui";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const t = useTranslations("NotFound");
  const setCurrentPageTitle = useUiStore((s) => s.setCurrentPageTitle);

  useEffect(() => {
    setCurrentPageTitle("");
  }, [setCurrentPageTitle]);

  return (
    <div className="w-full h-full flex flex-col justify-center items-center gap-5">
      <div className="w-[90%] max-w-[500px]">
        <Image
          width="196"
          height="248"
          src="/404.png"
          alt={t("logoAlt")}
          className="w-full"
        />
      </div>
      <div className="flex flex-col justify-center items-center gap-2">
        <p className="text-xl font-semibold text-fg">
          {t("title")}
        </p>
        <p className="text-sm text-muted">
          {t("description")}
        </p>
      </div>
      <div>
        <Button asChild>
          <Link href="/">{t("backHome")}</Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
