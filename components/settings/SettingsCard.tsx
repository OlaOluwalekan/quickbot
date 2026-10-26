import { ReactNode } from "react";

const SettingsCard = ({ children }: { children: ReactNode }) => {
  return (
    <div className="rounded-3xl w-full max-w-5xl p-6 sm:p-8 border border-slate-200/90 dark:border-slate-800/90 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl shadow-indigo-500/5 text-slate-900 dark:text-slate-100">
      {children}
    </div>
  );
};

export default SettingsCard;
