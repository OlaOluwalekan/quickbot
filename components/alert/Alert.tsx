import clsx from "clsx";
import { FaExclamationTriangle } from "react-icons/fa";
import { IoCheckmarkDoneCircle } from "react-icons/io5";

interface respType {
  message: string;
  success: boolean;
}

const Alert = ({ message, success }: respType) => {
  return (
    <div
      role="alert"
      className={clsx(
        "alert text-sm px-2 py-1 rounded my-2 text-base-100 gap-x-1 flex justify-center",
        success ? "bg-success/55 text-success" : "bg-error/15 text-error"
      )}
    >
      {success ? <IoCheckmarkDoneCircle /> : <FaExclamationTriangle />}
      <span>{message}</span>
    </div>
  );
};

export default Alert;
