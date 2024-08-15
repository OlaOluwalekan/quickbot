import clsx from "clsx";
import Link from "next/link";
import { FaGear } from "react-icons/fa6";
import Logout from "../../auth/Logout";

const ProfileDialog = ({ data }: { data: any }) => {
  return (
    <div
      className={clsx(
        "flex flex-col bg-accent absolute bottom-[50px] left-1 w-[290px] p-2 rounded-md text-primary-content"
      )}
    >
      <p
        className="p-2 rounded-lg my-1 whitespace-nowrap overflow-hidden text-ellipsis"
        title={data.email}
      >
        {data.email}
      </p>
      <hr />
      <Link
        href="/settings"
        className="p-2 rounded-lg my-1.5 flex justify-start items-center gap-3 hover:bg-primary"
      >
        <FaGear />
        Settings
      </Link>
      <hr />
      <Logout />
    </div>
  );
};

export default ProfileDialog;
