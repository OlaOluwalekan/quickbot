import { ReactNode } from "react";

const SettingsCard = ({ children }: { children: ReactNode }) => {
  return (
    <div className="rounded-3xl w-full max-w-5xl p-6 sm:p-8 border border-border bg-surface/90 backdrop-blur-xl shadow-lg text-fg">
      {children}
    </div>
  );
};

export default SettingsCard;
