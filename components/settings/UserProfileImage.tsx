import { SessionProps } from "@/types/user";
import Image from "next/image";

const UserProfileImage = ({ user }: { user: SessionProps }) => {
  return (
    <div className="rounded-full border-2 border-primary overflow-hidden w-20 aspect-square flex justify-center items-center">
      {user.image ? (
        <Image
          src={user.image as string}
          alt="Profile Image"
          width={100}
          height={100}
          className="w-full aspect-square"
        />
      ) : (
        <article className="text-6xl font-bold">
          {user.name.charAt(0).toUpperCase()}
        </article>
      )}
    </div>
  );
};
export default UserProfileImage;
