import { ReactNode } from "react";

const SettingsCard = ({ children }: { children: ReactNode }) => {
  return (
    <div className="card w-[90%] max-w-[1200px] px-3 py-5 bg-base-200 shadow-lg flex flex-col justify-center items-center">
      {children}
    </div>
  );
};
export default SettingsCard;
