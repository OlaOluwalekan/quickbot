import { InputWithIconsProps } from "@/types/input-types";
import clsx from "clsx";

/**
 * Sleek rebranded InputWithIcon component.
 */
const InputWithIcon = ({
  type,
  placeholder,
  icons,
  name,
  id,
  value,
  onChange,
  readonly,
}: InputWithIconsProps): React.JSX.Element => {
  return (
    <label
      className={clsx(
        "bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 rounded-xl flex items-center gap-3 my-2.5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all shadow-2xs",
        type === "hidden" && "hidden",
        readonly && "bg-slate-100 dark:bg-slate-800/50 cursor-not-allowed"
      )}
    >
      <span
        className={clsx(
          "text-base shrink-0",
          readonly
            ? "text-slate-400 dark:text-slate-500"
            : "text-indigo-600 dark:text-indigo-400"
        )}
      >
        {icons}
      </span>

      <input
        type={type}
        className={clsx(
          "grow bg-transparent focus:outline-none text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500",
          readonly && "opacity-60 text-slate-500 cursor-not-allowed"
        )}
        placeholder={placeholder}
        name={name}
        id={id}
        value={value}
        onChange={onChange}
        readOnly={readonly}
      />
    </label>
  );
};

export default InputWithIcon;
