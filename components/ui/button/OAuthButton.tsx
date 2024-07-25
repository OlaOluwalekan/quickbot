import { OAuthBtnProps } from "@/types";

const OAuthButton = ({ icon, onClick }: OAuthBtnProps) => {
  return (
    <button
      type="button"
      className="flex justify-center items-center text-2xl w-full py-3 border-2 border-base-300 rounded"
      onClick={onClick}
    >
      {icon}
    </button>
  );
};

export default OAuthButton;
