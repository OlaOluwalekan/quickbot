"use client";

import { RootState } from "@/store";
import clsx from "clsx";
import { useDispatch, useSelector } from "react-redux";
import UserImage from "../UserImage";
import { toggleProfileDialogOpen } from "@/features/generalSlice";
import ProfileDialog from "./ProfileDialog";
import { formatNumber } from "@/utils/format";

const UserProfile = ({ data }: { data: any }) => {
  const { profileDialogIsOpen } = useSelector(
    (store: RootState) => store.general
  );
  const dispatch = useDispatch();

  return (
    <div className="w-full relative px-1 md:mb-1">
      {profileDialogIsOpen && <ProfileDialog data={data} />}
      <button
        className={clsx(
          "a-modal w-full flex justify-start items-center gap-3 hover:bg-accent px-2 py-2 rounded-md text-primary-content",
          profileDialogIsOpen ? "bg-accent" : "bg-primary"
        )}
        title={data?.name as string}
        onClick={() =>
          dispatch(toggleProfileDialogOpen(profileDialogIsOpen ? false : true))
        }
      >
        <UserImage image={data?.image} />
        <article className="flex flex-grow items-center justify-between gap-2">
          <p className="whitespace-nowrap overflow-hidden text-ellipsis">
            {data?.name}
          </p>
          <span className="text-xs flex bg-success/70 px-1 py-0.5 rounded-sm">
            {formatNumber(data.token)} tokens
          </span>
        </article>
      </button>
    </div>
  );
};

export default UserProfile;
