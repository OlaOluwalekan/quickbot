import clsx from "clsx";
import { FaExclamationTriangle } from "react-icons/fa";
import { IoCheckmarkDoneCircle } from "react-icons/io5";

interface respType {
  message: string;
  success: boolean;
}

const Alert = ({ message, success }: respType): React.JSX.Element => {
  return (
    <div
      role="alert"
      className={clsx(
        "text-xs sm:text-sm px-3.5 py-2.5 rounded-xl my-3 gap-2 flex items-center justify-center font-medium border",
        success
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
          : "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
      )}
    >
      {success ? (
        <IoCheckmarkDoneCircle className="text-base shrink-0" />
      ) : (
        <FaExclamationTriangle className="text-sm shrink-0" />
      )}
      <span>{message}</span>
    </div>
  );
};

export default Alert;
