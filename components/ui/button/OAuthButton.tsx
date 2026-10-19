import { OAuthBtnProps } from "@/types";

const OAuthButton = ({ icon, onClick, text }: OAuthBtnProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex justify-center items-center gap-2 text-lg w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/70 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors cursor-pointer shadow-2xs"
    >
      {icon}
      {text && <span className="text-xs font-semibold">{text}</span>}
    </button>
  );
};

export default OAuthButton;
