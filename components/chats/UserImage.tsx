import Image from "next/image";
import { UserCircle2 } from "lucide-react";

const UserImage = ({ image }: { image: string | null }) => {
  return (
    <article>
      {image ? (
        <Image
          src={image}
          alt="user photo"
          width={30}
          height={30}
          className="rounded-[50%]"
        />
      ) : (
        <UserCircle2 className="h-[30px] w-[30px] text-muted" strokeWidth={1.5} />
      )}
    </article>
  );
};

export default UserImage;
