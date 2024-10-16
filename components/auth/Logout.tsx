"use client";

import clsx from "clsx";
import { signOut } from "next-auth/react";
import { BiLogOut } from "react-icons/bi";

/**
 * logout button
 * @param {Object} props - component parameters
 * @param {string} props.styleClass - tailwind css class to style the logout button
 * @returns {JSX.Element} logout button element
 */
const Logout = ({ styleClass }: { styleClass?: string }): JSX.Element => {
  return (
    <button
      className={clsx(
        "flex justify-start items-center gap-3 rounded-lg",
        styleClass ? styleClass : "w-full px-2 py-2 my-1 hover:bg-error"
      )}
      onClick={() => signOut()}
    >
      <BiLogOut />
      LogOut
    </button>
  );
};

export default Logout;
