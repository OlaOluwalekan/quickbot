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
        "bg-surface border border-border px-3.5 py-2.5 rounded-xl flex items-center gap-3 my-2.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-ring transition-all shadow-2xs",
        type === "hidden" && "hidden",
        readonly && "bg-surface-2 cursor-not-allowed"
      )}
    >
      <span
        className={clsx(
          "text-base shrink-0",
          readonly ? "text-subtle" : "text-accent"
        )}
      >
        {icons}
      </span>

      <input
        type={type}
        className={clsx(
          "grow bg-transparent focus:outline-none text-sm sm:text-base text-fg placeholder:text-subtle",
          readonly && "opacity-60 text-muted cursor-not-allowed"
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
