import { SessionProps } from "@/types/user";
import Image from "next/image";

const UserProfileImage = ({ user }: { user: SessionProps }) => {
  return (
    <div className="rounded-2xl border-2 border-indigo-500/40 bg-gradient-to-br from-indigo-500/15 to-sky-500/15 overflow-hidden w-20 h-20 flex justify-center items-center shadow-sm">
      {user?.image ? (
        <Image
          src={user.image as string}
          alt="Profile Image"
          width={80}
          height={80}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
          {(user?.name || "U").charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
};

export default UserProfileImage;
