import { OAuthBtnProps } from "@/types";

const OAuthButton = ({ icon, onClick, text }: OAuthBtnProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex justify-center items-center gap-2 text-lg w-full py-2.5 px-4 rounded-xl border border-border bg-surface text-fg hover:bg-surface-2 transition-colors cursor-pointer shadow-2xs"
    >
      {icon}
      {text && <span className="text-xs font-semibold">{text}</span>}
    </button>
  );
};

export default OAuthButton;
