"use client";

import { RootState } from "@/store";
import clsx from "clsx";
import { useDispatch, useSelector } from "react-redux";
import UserImage from "../UserImage";
import { toggleProfileDialogOpen } from "@/features/generalSlice";
import ProfileDialog from "./ProfileDialog";
import { formatNumber } from "@/utils/format";
import { useTranslations } from "next-intl";

const UserProfile = ({ data }: { data: any }) => {
  const tCommon = useTranslations("Common");
  const { profileDialogIsOpen } = useSelector(
    (store: RootState) => store.general
  );
  const dispatch = useDispatch();

  return (
    <div className="w-full relative p-2.5 border-t border-slate-800/80">
      {profileDialogIsOpen && <ProfileDialog data={data} />}
      <button
        type="button"
        className={clsx(
          "a-modal w-full flex justify-start items-center gap-2.5 px-2.5 py-2 rounded-xl text-slate-100 transition-colors cursor-pointer",
          profileDialogIsOpen ? "bg-slate-800" : "hover:bg-slate-800/70"
        )}
        title={data?.name as string}
        onClick={() => dispatch(toggleProfileDialogOpen(!profileDialogIsOpen))}
      >
        <UserImage image={data?.image} />
        <div className="flex flex-1 min-w-0 items-center justify-between gap-2">
          <p className="text-xs sm:text-sm font-medium truncate">
            {data?.name}
          </p>
          <span className="text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full shrink-0">
            {formatNumber(data?.token ?? 0)} {tCommon("tokens").toLowerCase()}
          </span>
        </div>
      </button>
    </div>
  );
};

export default UserProfile;
