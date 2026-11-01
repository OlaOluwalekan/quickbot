import clsx from "clsx";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

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
          ? "bg-success/10 border-success/30 text-success"
          : "bg-danger/10 border-danger/30 text-danger"
      )}
    >
      {success ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      )}
      <span>{message}</span>
    </div>
  );
};

export default Alert;
