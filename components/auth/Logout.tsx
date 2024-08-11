"use client";

import { signOut } from "next-auth/react";
import { BiLogOut } from "react-icons/bi";

const Logout = () => {
  return (
    <button
      className="px-2 py-2 my-1 w-full flex justify-start items-center gap-3 rounded-lg hover:bg-error"
      onClick={() => signOut()}
    >
      <BiLogOut />
      LogOut
    </button>
  );
};

export default Logout;
