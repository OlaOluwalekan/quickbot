"use client";

import Link from "next/link";
import { FaGear } from "react-icons/fa6";
import Logout from "../../auth/Logout";
import { useTranslations } from "next-intl";

const ProfileDialog = ({ data }: { data: any }) => {
  const t = useTranslations("Chat");

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 shadow-2xl absolute bottom-[68px] left-2.5 right-2.5 p-2 rounded-2xl text-slate-100 z-50">
      <p
        className="px-3 py-2 text-xs text-slate-400 truncate border-b border-slate-800"
        title={data?.email}
      >
        {data?.email}
      </p>
      <Link
        href="/settings"
        className="px-3 py-2 rounded-xl my-1 flex items-center gap-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800 transition-colors"
      >
        <FaGear className="text-indigo-400" />
        <span>{t("settings")}</span>
      </Link>
      <div className="border-t border-slate-800 pt-1">
        <Logout />
      </div>
    </div>
  );
};

export default ProfileDialog;
