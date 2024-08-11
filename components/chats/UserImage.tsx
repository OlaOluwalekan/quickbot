import Image from "next/image";
import { FaUserCircle } from "react-icons/fa";

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
        <FaUserCircle className="text-[30px]" />
      )}
    </article>
  );
};

export default UserImage;
