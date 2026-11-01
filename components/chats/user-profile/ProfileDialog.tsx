"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import Logout from "../../auth/Logout";
import { useTranslations } from "next-intl";

const ProfileDialog = ({ data }: { data: any }) => {
  const t = useTranslations("Chat");

  return (
    <div className="flex flex-col bg-surface border border-border shadow-lg absolute bottom-[68px] left-2.5 right-2.5 p-2 rounded-2xl text-fg z-50">
      <p
        className="px-3 py-2 text-xs text-muted truncate border-b border-border"
        title={data?.email}
      >
        {data?.email}
      </p>
      <Link
        href="/settings"
        className="px-3 py-2 rounded-xl my-1 flex items-center gap-2.5 text-sm font-medium text-fg hover:bg-surface-2 transition-colors"
      >
        <Settings className="h-4 w-4 text-accent" strokeWidth={1.5} />
        <span>{t("settings")}</span>
      </Link>
      <div className="border-t border-border pt-1">
        <Logout />
      </div>
    </div>
  );
};

export default ProfileDialog;
