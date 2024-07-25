import { FcGoogle } from "react-icons/fc";
import OAuthButton from "../ui/button/OAuthButton";
import { FaGithub } from "react-icons/fa6";

const OAuthCard = () => {
  return (
    <div className="flex justify-center items-center gap-5">
      <OAuthButton icon={<FcGoogle />} />
      <OAuthButton icon={<FaGithub />} />
    </div>
  );
};

export default OAuthCard;
