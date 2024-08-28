"use client";

import clsx from "clsx";
import { signOut } from "next-auth/react";
import { BiLogOut } from "react-icons/bi";

const Logout = ({ styleClass }: { styleClass?: string }) => {
  return (
    <button
      className={clsx(
        "py-2 my-1 flex justify-start items-center gap-3 rounded-lg",
        styleClass ? styleClass : "w-full px-2 hover:bg-error"
      )}
      onClick={() => signOut()}
    >
      <BiLogOut />
      LogOut
    </button>
  );
};

export default Logout;
